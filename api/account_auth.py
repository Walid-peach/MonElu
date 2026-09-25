"""
api/account_auth.py
Supabase access-token verification for the account routes (#413, ADR-040 §4).

Supabase Auth issues the session and the Next.js server holds it; its route
handlers forward the access token here as a bearer. This module distrusts all of
that and checks the signature itself: a forwarded user id, a shared service
token, or any header the caller sets is not an identity - only a token whose
signature verifies against the project's published signing key is. That is the
whole reason the check lives in the API rather than in the Next layer, where a
header injection or an SSRF in a route handler would become account
impersonation.

Unrelated to `api/auth.py`, which resolves public API keys for rate-limit tiers.

Only asymmetric signing keys (ES256, RS256) are accepted, fetched from the
project's JWKS endpoint. The legacy HS256 shared secret is deliberately not
supported: with it, anything holding the secret can mint a token for any user,
so the API would be one more place a forging credential lives. With a JWKS the
API holds no secret at all. A project still on the legacy secret must migrate to
signing keys in the Supabase dashboard before accounts can work.

Never log a token, a claim payload or a hash of either - failures are logged by
exception class only, and every rejection carries the same generic detail.
"""

import functools
import logging
import os
import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.db import get_conn

logger = logging.getLogger(__name__)

# Supabase signs user access tokens for this audience; the anon/service keys and
# any other token the project mints do not carry it.
SUPABASE_AUDIENCE = "authenticated"

# Pinned rather than read from the token header, so a token cannot choose its own
# verification algorithm (`none`, or HS256 against a public key).
ALLOWED_ALGORITHMS = ["ES256", "RS256"]
_ASYMMETRIC_KEY_TYPES = {"EC", "RSA"}

_JWKS_TIMEOUT_SECONDS = 5
_JWKS_CACHE_SECONDS = 600
_CLOCK_SKEW_SECONDS = 30

_UNAUTHENTICATED_HEADERS = {"WWW-Authenticate": "Bearer"}

# auto_error=False: FastAPI's own error for a missing header has been a 403 in
# some versions, and a protected route must answer 401 (the issue's criterion).
_bearer = HTTPBearer(
    auto_error=False,
    description="Supabase access token, forwarded by the Next.js server (ADR-040).",
)


class InvalidAccessToken(Exception):
    """The token is absent, malformed, expired, or does not verify."""


class AuthUnavailable(Exception):
    """Verification could not run: auth is unconfigured or the JWKS is unreachable.

    Kept distinct from InvalidAccessToken so a Supabase outage answers 503 rather
    than 401 - a 401 would tell the Next layer the session is dead and sign
    every visitor out over a network blip.
    """


@dataclass(frozen=True)
class VerifiedUser:
    """An identity proven by a verified signature. `auth_user_id` is the token's
    `sub`, i.e. Supabase's `auth.users.id` - never MonÉlu's own profile id."""

    auth_user_id: uuid.UUID


def supabase_issuer() -> str | None:
    """`<SUPABASE_URL>/auth/v1`, the `iss` Supabase stamps on access tokens."""
    base = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    return f"{base}/auth/v1" if base else None


@functools.lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    # Cached per URL so the key set is fetched once and reused; PyJWKClient
    # refetches on its own when a token names a key id it has not seen, which is
    # what makes a Supabase key rotation work without a restart.
    return jwt.PyJWKClient(
        jwks_url,
        cache_jwk_set=True,
        lifespan=_JWKS_CACHE_SECONDS,
        timeout=_JWKS_TIMEOUT_SECONDS,
    )


def verify_access_token(token: str) -> VerifiedUser:
    """Verify signature, expiry, audience and issuer; return the token's subject.

    Raises InvalidAccessToken for anything the caller got wrong, and
    AuthUnavailable when verification itself cannot run.
    """
    issuer = supabase_issuer()
    if issuer is None:
        raise AuthUnavailable("SUPABASE_URL is not set")

    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        raise InvalidAccessToken(type(exc).__name__) from None
    if not kid:
        raise InvalidAccessToken("no kid")

    client = _jwks_client(f"{issuer}/.well-known/jwks.json")

    # Two failure classes that must not be confused. A key set that cannot be
    # fetched, parsed, or holds no usable key - which is exactly what a project
    # still on the legacy HS256 secret publishes - means verification cannot
    # run: 503. Only a token naming a key the set does not hold is the
    # caller's fault: 401. Answering 401 to the first would sign every visitor
    # out over a misconfiguration.
    try:
        client.get_jwk_set()
    except (jwt.PyJWKClientError, jwt.PyJWKSetError, ValueError) as exc:
        raise AuthUnavailable(type(exc).__name__) from None

    try:
        # An unknown kid forces at most one refetch per cooldown window
        # (PyJWT >= 2.15), so random kids cannot turn this into a JWKS
        # fetch per request.
        signing_key = client.get_signing_key(kid)
    except (jwt.PyJWKClientConnectionError, ValueError) as exc:
        raise AuthUnavailable(type(exc).__name__) from None
    except jwt.PyJWTError as exc:
        raise InvalidAccessToken(type(exc).__name__) from None

    # The key set is the project's, not the caller's, so a symmetric key in it
    # is a misconfiguration rather than a bad token - and decoding with one
    # would raise outside PyJWT's error hierarchy.
    if signing_key.key_type not in _ASYMMETRIC_KEY_TYPES:
        raise AuthUnavailable(f"JWKS key type {signing_key.key_type} is not asymmetric")

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=SUPABASE_AUDIENCE,
            issuer=issuer,
            # Absorbs clock skew between Supabase and this host, which would
            # otherwise reject a freshly issued token's `iat` as in the future.
            leeway=_CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidAccessToken(type(exc).__name__) from None

    # Anonymous sign-ins mint `authenticated` tokens too. ADR-040 has no
    # anonymous accounts, so one reaching the API is not a MonÉlu user.
    if claims.get("is_anonymous") is True:
        raise InvalidAccessToken("anonymous session")

    try:
        return VerifiedUser(auth_user_id=uuid.UUID(str(claims["sub"])))
    except ValueError:
        raise InvalidAccessToken("sub is not a uuid") from None


def require_verified_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> VerifiedUser:
    """FastAPI dependency: the verified caller, or 401.

    A plain `def`, so FastAPI runs it in the threadpool - the first request after
    a cold start (or a key rotation) fetches the JWKS over the network.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401, detail="Not authenticated", headers=_UNAUTHENTICATED_HEADERS
        )

    try:
        return verify_access_token(credentials.credentials)
    except InvalidAccessToken as exc:
        # The reason is an exception class name or a fixed string, never the
        # token or anything decoded from it.
        logger.info("Rejected access token: %s", exc)
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
            headers=_UNAUTHENTICATED_HEADERS,
        ) from None
    except AuthUnavailable as exc:
        logger.error("Account authentication unavailable: %s", exc)
        raise HTTPException(
            status_code=503, detail="Account authentication is temporarily unavailable"
        ) from None


@dataclass(frozen=True)
class Account:
    """A verified caller who has a MonÉlu profile.

    `profile_id` is what `account_transaction()` sets as `app.user_id`;
    `auth_user_id` is kept for the rare statement that has to name the provider
    identity (ADR-040: application rows reference the profile id, never `sub`).
    """

    profile_id: uuid.UUID
    auth_user_id: uuid.UUID


def resolve_profile_id(auth_user_id: uuid.UUID) -> uuid.UUID | None:
    """MonÉlu profile id for a verified Supabase user, or None if there is none.

    The single deliberate use of the owner connection on an account path
    (migration 013's closing note): the lookup has to run *before* `app.user_id`
    is known, so it cannot satisfy the `own_profile` policy on the restricted
    pool. It reads one column of one row by a unique key, and only ever for an
    identity whose signature has already verified.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text AS id FROM app_private.profiles WHERE auth_user_id = %s",
                (str(auth_user_id),),
            )
            row = cur.fetchone()
    return uuid.UUID(row["id"]) if row else None


def require_account(user: VerifiedUser = Depends(require_verified_user)) -> Account:
    """FastAPI dependency: the verified caller's MonÉlu account, or 401.

    A verified token with no profile behind it is 401, not 404: the caller is
    not a MonÉlu account holder, and a deleted account must stop working with a
    token Supabase issued before the deletion (#414's acceptance criterion).
    Profile creation is not behind this dependency - it needs the verified
    identity alone, i.e. `require_verified_user`.
    """
    profile_id = resolve_profile_id(user.auth_user_id)
    if profile_id is None:
        raise HTTPException(
            status_code=401,
            detail="No MonÉlu account for this identity",
            headers=_UNAUTHENTICATED_HEADERS,
        )
    return Account(profile_id=profile_id, auth_user_id=user.auth_user_id)
