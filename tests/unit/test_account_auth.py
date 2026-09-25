"""
Supabase access-token verification and the restricted-role path (#413, ADR-040).

Tokens here are real ES256 JWTs signed with keys generated per test run, and they
go through the real `jwt.PyJWKClient` - only its network fetch is replaced with
the test key set. So "a forged token is rejected" is proven by a signature check
actually failing, not by a mock deciding to return an error.
"""

import json
import logging
import time
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import jwt
import psycopg2
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

import api.account_auth as account_auth
import api.db as _db

SUPABASE_URL = "https://testproject.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "test-key-1"

AUTH_USER_ID = uuid.UUID("0b6f3c5e-1111-4a2b-9c3d-000000000001")
PROFILE_ID = uuid.UUID("7c1d9a52-3f0e-4c1b-9a7e-2b8f6d4e1a30")

_SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())
_ATTACKER_KEY = ec.generate_private_key(ec.SECP256R1())


def _public_jwk(private_key, kid: str) -> dict:
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    return {**jwk, "kid": kid, "alg": "ES256", "use": "sig"}


JWKS = {"keys": [_public_jwk(_SIGNING_KEY, KID)]}


def _claims(**overrides) -> dict:
    now = int(time.time())
    claims = {
        "sub": str(AUTH_USER_ID),
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "role": "authenticated",
        "email": "camille@example.org",
        "is_anonymous": False,
    }
    claims.update(overrides)
    return {k: v for k, v in claims.items() if v is not None}


def _token(key=_SIGNING_KEY, kid: str = KID, algorithm: str = "ES256", **overrides) -> str:
    return jwt.encode(_claims(**overrides), key, algorithm=algorithm, headers={"kid": kid})


@pytest.fixture(autouse=True)
def _supabase(monkeypatch):
    """Point verification at the test issuer and serve the test key set."""
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    account_auth._jwks_client.cache_clear()
    with patch.object(jwt.PyJWKClient, "fetch_data", return_value=JWKS) as fetch:
        yield fetch
    account_auth._jwks_client.cache_clear()


@pytest.fixture
def profile_exists():
    with patch.object(account_auth, "resolve_profile_id", return_value=PROFILE_ID) as resolve:
        yield resolve


# ---------------------------------------------------------------------------
# verify_access_token
# ---------------------------------------------------------------------------


def test_valid_token_resolves_to_its_subject():
    assert account_auth.verify_access_token(_token()).auth_user_id == AUTH_USER_ID


@pytest.mark.parametrize(
    "token_factory, why",
    [
        (lambda: _token(exp=int(time.time()) - 60, iat=int(time.time()) - 3660), "expired"),
        (lambda: _token(key=_ATTACKER_KEY), "signed with the wrong key under the real kid"),
        (lambda: _token(key=_ATTACKER_KEY, kid="attacker-key"), "kid absent from the JWKS"),
        (lambda: _token(aud="anon"), "wrong audience"),
        (lambda: _token(iss="https://evil.example/auth/v1"), "wrong issuer"),
        (lambda: _token(sub=None), "no subject"),
        (lambda: _token(exp=None), "no expiry"),
        (lambda: _token(sub="not-a-uuid"), "subject is not a uuid"),
        (lambda: _token(is_anonymous=True), "anonymous Supabase session"),
        (lambda: "not.a.jwt", "malformed"),
    ],
)
def test_bad_tokens_are_rejected(token_factory, why):
    with pytest.raises(account_auth.InvalidAccessToken):
        account_auth.verify_access_token(token_factory())


def test_tampered_payload_is_rejected():
    """Swap the payload of a genuinely signed token for another user's."""
    header, _payload, signature = _token().split(".")
    forged_payload = jwt.utils.base64url_encode(
        json.dumps(_claims(sub=str(uuid.uuid4()))).encode()
    ).decode()
    with pytest.raises(account_auth.InvalidAccessToken):
        account_auth.verify_access_token(f"{header}.{forged_payload}.{signature}")


def test_token_cannot_choose_a_symmetric_algorithm():
    """The algorithm-confusion forgery: an HS256 token keyed on the *public* key,
    which an attacker can read off the JWKS. Pinned algorithms reject it before
    any key is tried."""
    public_pem = _SIGNING_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    # PyJWT refuses to HMAC with a PEM key, so sign at the JWS layer by hand.
    forged = jwt.api_jws.PyJWS(algorithms=["HS256"])
    forged._algorithms["HS256"].prepare_key = lambda key: key
    token = forged.encode(
        json.dumps(_claims()).encode(), key=public_pem, algorithm="HS256", headers={"kid": KID}
    )
    with pytest.raises(account_auth.InvalidAccessToken):
        account_auth.verify_access_token(token)


def test_unsigned_token_is_rejected():
    unsigned = jwt.encode(_claims(), None, algorithm="none", headers={"kid": KID})
    with pytest.raises(account_auth.InvalidAccessToken):
        account_auth.verify_access_token(unsigned)


def test_missing_supabase_url_is_unavailable_not_unauthenticated(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL")
    with pytest.raises(account_auth.AuthUnavailable):
        account_auth.verify_access_token(_token())


def test_unreachable_jwks_is_unavailable_not_unauthenticated(_supabase):
    _supabase.side_effect = jwt.PyJWKClientConnectionError("boom")
    with pytest.raises(account_auth.AuthUnavailable):
        account_auth.verify_access_token(_token())


@pytest.mark.parametrize(
    "jwks_response",
    [
        {"keys": []},  # what a project still on the legacy HS256 secret publishes
        {"keys": [{"kty": "oct", "k": "c2VjcmV0", "kid": KID}]},  # a shared secret, published
        ["not", "an", "object"],
        ValueError("Expecting value: line 1 column 1"),  # non-JSON body
    ],
    ids=["empty", "symmetric-key", "not-an-object", "not-json"],
)
def test_broken_key_set_is_unavailable_not_unauthenticated(_supabase, jwks_response):
    """A misconfigured JWKS must not answer 401, or the Next layer would sign
    every visitor out over an operator mistake."""
    if isinstance(jwks_response, Exception):
        _supabase.side_effect = jwks_response
    else:
        _supabase.return_value = jwks_response
    with pytest.raises(account_auth.AuthUnavailable):
        account_auth.verify_access_token(_token())


def test_token_without_kid_is_rejected():
    token = jwt.encode(_claims(), _SIGNING_KEY, algorithm="ES256")
    with pytest.raises(account_auth.InvalidAccessToken):
        account_auth.verify_access_token(token)


def test_small_clock_skew_is_tolerated():
    """A token whose `iat` is a few seconds ahead of this host still verifies."""
    token = _token(iat=int(time.time()) + 10)
    assert account_auth.verify_access_token(token).auth_user_id == AUTH_USER_ID


def test_jwks_is_fetched_once_and_cached(_supabase):
    for _ in range(3):
        account_auth.verify_access_token(_token())
    assert _supabase.call_count == 1


# ---------------------------------------------------------------------------
# The protected route, end to end through FastAPI
# ---------------------------------------------------------------------------


def _mock_pool(fetchone=None):
    """A pool whose connections record every statement executed on them."""
    cursor = MagicMock()
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)
    cursor.fetchone.return_value = fetchone
    conn = MagicMock()
    conn.cursor.return_value = cursor
    pool = MagicMock()
    pool.getconn.return_value = conn
    pool.closed = False
    return pool, conn, cursor


def _statements(cursor) -> list[str]:
    return [" ".join(c.args[0].split()) for c in cursor.execute.call_args_list]


PROFILE_ROW = {
    "id": str(PROFILE_ID),
    "display_name": "Camille",
    "preferred_language": "fr",
    "department_code": "83",
    "circonscription": "1",
    "created_at": None,
    "updated_at": None,
}


@pytest.fixture
def account_pool():
    pool, conn, cursor = _mock_pool(fetchone=PROFILE_ROW)
    with patch.object(_db, "_account_pool", pool):
        yield pool, conn, cursor


def test_me_returns_the_callers_profile(client, profile_exists, account_pool):
    r = client.get("/account/me", headers={"Authorization": f"Bearer {_token()}"})

    assert r.status_code == 200
    assert r.json()["id"] == str(PROFILE_ID)
    profile_exists.assert_called_once_with(AUTH_USER_ID)


def test_me_without_authorization_header_is_401(client, profile_exists, account_pool):
    r = client.get("/account/me")

    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    profile_exists.assert_not_called()


@pytest.mark.parametrize(
    "header",
    [
        f"Bearer {_token(exp=int(time.time()) - 60, iat=int(time.time()) - 3660)}",
        f"Bearer {_token(key=_ATTACKER_KEY)}",
        "Bearer ",
        "Basic dXNlcjpwYXNz",
    ],
    ids=["expired", "forged", "empty", "basic-scheme"],
)
def test_me_with_a_bad_credential_is_401(client, profile_exists, account_pool, header):
    r = client.get("/account/me", headers={"Authorization": header})

    assert r.status_code == 401
    profile_exists.assert_not_called()
    account_pool[0].getconn.assert_not_called()


def test_asserted_identity_headers_are_ignored(client, profile_exists, account_pool):
    """A forwarded user id is not an identity: without a token it is still 401,
    and with a valid token the token's subject wins."""
    spoof = {"X-User-Id": str(uuid.uuid4()), "X-Forwarded-User": str(uuid.uuid4())}

    assert client.get("/account/me", headers=spoof).status_code == 401

    r = client.get("/account/me", headers={**spoof, "Authorization": f"Bearer {_token()}"})
    assert r.status_code == 200
    profile_exists.assert_called_once_with(AUTH_USER_ID)


def test_verified_identity_without_a_profile_is_401(client, account_pool):
    with patch.object(account_auth, "resolve_profile_id", return_value=None):
        r = client.get("/account/me", headers={"Authorization": f"Bearer {_token()}"})

    assert r.status_code == 401
    account_pool[0].getconn.assert_not_called()


def test_auth_outage_is_503_not_401(client, profile_exists, account_pool, _supabase):
    _supabase.side_effect = jwt.PyJWKClientConnectionError("boom")
    r = client.get("/account/me", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 503


def test_unconfigured_account_pool_is_503(client, profile_exists):
    with patch.object(_db, "_account_pool", None):
        r = client.get("/account/me", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 503


def test_account_route_reads_through_the_restricted_pool(client, account_pool):
    """The owner pool answers only the profile-id lookup; the profile itself is
    read on the restricted pool, inside a SET LOCAL-scoped transaction."""
    owner_pool, _owner_conn, owner_cursor = _mock_pool(fetchone={"id": str(PROFILE_ID)})
    pool, conn, cursor = account_pool

    with patch.object(_db, "_pool", owner_pool):
        r = client.get("/account/me", headers={"Authorization": f"Bearer {_token()}"})

    assert r.status_code == 200
    owner_sql = _statements(owner_cursor)
    assert len(owner_sql) == 1 and "WHERE auth_user_id = %s" in owner_sql[0]

    account_sql = _statements(cursor)
    assert account_sql[0] == "SET LOCAL app.user_id = %s"
    assert cursor.execute.call_args_list[0].args[1] == (str(PROFILE_ID),)
    assert any("FROM app_private.profiles" in s for s in account_sql)
    conn.commit.assert_called_once()


def test_public_routes_never_touch_the_restricted_pool(client, mock_cursor, account_pool):
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"count": 0, "total": 0}

    assert client.get("/deputies").status_code == 200
    assert client.get("/votes/latest").status_code == 200

    account_pool[0].getconn.assert_not_called()


def test_health_needs_no_authentication(client):
    spec = client.get("/openapi.json").json()

    assert "security" not in spec["paths"]["/health"]["get"]
    assert spec["paths"]["/account/me"]["get"]["security"] == [{"HTTPBearer": []}]


def test_no_token_or_claim_reaches_logs_or_responses(client, profile_exists, account_pool, caplog):
    valid = _token()
    rejected = [
        _token(key=_ATTACKER_KEY),
        _token(exp=int(time.time()) - 60, iat=int(time.time()) - 3660),
        _token(aud="anon"),
        _token(is_anonymous=True),
    ]
    bodies = []
    with caplog.at_level(logging.DEBUG):
        for token in [valid, *rejected]:
            r = client.get("/account/me", headers={"Authorization": f"Bearer {token}"})
            bodies.append(r.text)

    haystack = caplog.text + "".join(bodies)
    for token in [valid, *rejected]:
        for segment in token.split("."):
            assert segment not in haystack
    for secret in (str(AUTH_USER_ID), "camille@example.org"):
        assert secret not in haystack


def test_there_is_no_sign_up_or_password_endpoint(client):
    paths = client.get("/openapi.json").json()["paths"]
    forbidden = ("signup", "sign-up", "signin", "sign-in", "login", "logout", "password")
    assert [p for p in paths if any(word in p.lower() for word in forbidden)] == []


# ---------------------------------------------------------------------------
# account_transaction
# ---------------------------------------------------------------------------


@contextmanager
def _restricted(pool):
    with patch.object(_db, "_account_pool", pool):
        yield


def test_transaction_sets_the_identity_with_set_local_first():
    pool, conn, cursor = _mock_pool()
    with _restricted(pool):
        with _db.account_transaction(PROFILE_ID) as cur:
            cur.execute("SELECT 1")

    statements = _statements(cursor)
    assert statements[0] == "SET LOCAL app.user_id = %s"
    # Never a session-scoped SET of the identity (PgBouncer transaction pooling).
    assert not any(s.startswith("SET app.") for s in statements)
    assert conn.autocommit is False
    conn.commit.assert_called_once()
    pool.putconn.assert_called_once_with(conn, close=False)


def test_transaction_rolls_back_on_error():
    pool, conn, _cursor = _mock_pool()
    with _restricted(pool), pytest.raises(RuntimeError):
        with _db.account_transaction(PROFILE_ID):
            raise RuntimeError("handler failed")

    conn.commit.assert_not_called()
    conn.rollback.assert_called_once()
    pool.putconn.assert_called_once_with(conn, close=False)


def test_transaction_discards_a_broken_connection():
    pool, conn, _cursor = _mock_pool()
    with _restricted(pool), pytest.raises(psycopg2.OperationalError):
        with _db.account_transaction(PROFILE_ID):
            raise psycopg2.OperationalError("server closed the connection")

    pool.putconn.assert_called_once_with(conn, close=True)


@pytest.mark.parametrize("bad", ["", "not-a-uuid", None])
def test_transaction_refuses_a_malformed_identity_before_connecting(bad):
    pool, _conn, _cursor = _mock_pool()
    with _restricted(pool), pytest.raises((ValueError, TypeError)):
        with _db.account_transaction(bad):
            pass
    pool.getconn.assert_not_called()


def test_transaction_without_a_configured_dsn_is_unavailable(monkeypatch):
    monkeypatch.delenv("ACCOUNT_DATABASE_URL", raising=False)
    with _restricted(None), pytest.raises(_db.AccountStoreUnavailable):
        with _db.account_transaction(PROFILE_ID):
            pass


def test_transient_connect_failure_is_retried(monkeypatch):
    monkeypatch.setattr(_db.time, "sleep", lambda _s: None)
    pool, conn, _cursor = _mock_pool()
    pool.getconn.side_effect = [psycopg2.OperationalError("proxy drop"), conn]

    with _restricted(pool):
        with _db.account_transaction(PROFILE_ID):
            pass

    assert pool.getconn.call_count == 2


def test_persistent_connect_failure_is_unavailable(monkeypatch):
    monkeypatch.setattr(_db.time, "sleep", lambda _s: None)
    pool, _conn, _cursor = _mock_pool()
    pool.getconn.side_effect = psycopg2.OperationalError("down")

    with _restricted(pool), pytest.raises(_db.AccountStoreUnavailable):
        with _db.account_transaction(PROFILE_ID):
            pass


def test_startup_opens_no_account_connection(monkeypatch):
    """A missing or still-NOLOGIN account role must never stop the public API
    (and /health) from booting."""
    monkeypatch.setenv("ACCOUNT_DATABASE_URL", "postgresql://monelu_app_user@nowhere:1/x")
    with (
        patch.object(_db, "_account_pool", None),
        patch.object(psycopg2.pool, "ThreadedConnectionPool") as ctor,
    ):
        _db.init_account_pool()
        assert _db._account_pool is None
    ctor.assert_not_called()


def test_pool_is_created_on_first_use_and_keeps_idle_connections(monkeypatch):
    """minconn >= 1: psycopg2 closes every returned connection beyond minconn, so
    minconn=0 would reconnect to Supabase on every request."""
    monkeypatch.setenv("ACCOUNT_DATABASE_URL", "postgresql://monelu_app_user@db:5432/x")
    pool, _conn, _cursor = _mock_pool()
    with (
        patch.object(_db, "_account_pool", None),
        patch.object(psycopg2.pool, "ThreadedConnectionPool", return_value=pool) as ctor,
    ):
        with _db.account_transaction(PROFILE_ID):
            pass
        with _db.account_transaction(PROFILE_ID):
            pass

    ctor.assert_called_once()
    assert ctor.call_args.kwargs["minconn"] >= 1
    # libpq's default is to wait forever, under the pool-creation lock.
    assert ctor.call_args.kwargs["connect_timeout"] > 0


def test_failed_pool_creation_is_retried_by_the_next_request(monkeypatch):
    monkeypatch.setenv("ACCOUNT_DATABASE_URL", "postgresql://monelu_app_user@db:5432/x")
    monkeypatch.setattr(_db.time, "sleep", lambda _s: None)
    pool, _conn, _cursor = _mock_pool()
    down = psycopg2.OperationalError("role is not permitted to log in")
    with (
        patch.object(_db, "_account_pool", None),
        patch.object(psycopg2.pool, "ThreadedConnectionPool", side_effect=[down, down, down, pool]),
    ):
        with pytest.raises(_db.AccountStoreUnavailable):
            with _db.account_transaction(PROFILE_ID):
                pass
        assert _db._account_pool is None

        with _db.account_transaction(PROFILE_ID):
            pass
        assert _db._account_pool is pool
