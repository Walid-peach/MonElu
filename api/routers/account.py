"""
api/routers/account.py
Private account routes (#413, #414, ADR-040).

Every handler here takes `require_account` (or, for profile creation only,
`require_verified_user`), which verifies the Supabase access token itself, and
reads through `account_transaction()` on the restricted-role pool, so the
migration 013 RLS policies are the backstop behind each explicit `WHERE`. Never
use `get_conn()` (the owner connection, which bypasses RLS) in this module -
`resolve_profile_id()` in api/account_auth.py is the one deliberate exception,
and it lives there, not here.

Defence in depth means both layers, always: every statement below that reads,
changes or removes account rows names the caller's profile explicitly, written
as `profile_id = %(profile_id)s` (`id = %(profile_id)s` on the profiles table).
tests/integration/test_account_endpoints.py rewrites exactly that clause out of
every statement in this module and checks the cross-user tests still pass, so
keep the spelling uniform - a filter written another way escapes that proof.

There is no sign-up, sign-in, sign-out or password endpoint, and there never
will be: Supabase Auth and the Next.js server own the flow (ADR-040 §4).
`POST /account/me` only creates the MonÉlu profile row for an identity Supabase
has already verified.

Collection is minimal by ADR-040 §6: no birthdate, gender, address or phone,
and nothing here derives a political label from what a caller follows.
Notification preferences are stored and returned only - nothing in this API
sends or enqueues a message, and #359's hold stands.

No per-route rate limit: `rate_limit_key` buckets anonymous callers by IP, and
every request here arrives from the Next.js server, so an IP bucket would throttle
all signed-in users together. A per-account limit, if one is needed, keys on the
verified identity instead.
"""

import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

import psycopg2
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.routing import APIRoute
from psycopg2 import sql
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from api import account_auth
from api.account_auth import Account, VerifiedUser, require_account, require_verified_user
from api.db import AccountStoreUnavailable, account_transaction
from api.departments_data import normalize_code
from api.schemas import (
    AccountBookmark,
    AccountExport,
    AccountFollowedDeputy,
    AccountFollowedTheme,
    AccountNotificationPreferences,
    AccountProfile,
)
from api.themes_data import THEME_NAMES


class _PrivateRoute(APIRoute):
    """Marks every successful account response `Cache-Control: private, no-store`.

    These bodies are one person's data. Nothing in the chain is meant to cache
    them (the Next route handlers are uncached by ADR-040 §4), and this header
    makes that hold for any proxy or browser in between too - including the
    export, which is a file download. Applied at the route class rather than
    per handler, so the 204s and the export's hand-built Response get it too.
    """

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def private_handler(request: Request) -> Response:
            response = await handler(request)
            response.headers["Cache-Control"] = "private, no-store"
            return response

        return private_handler


router = APIRouter(route_class=_PrivateRoute)

_UNAUTHENTICATED_HEADERS = {"WWW-Authenticate": "Bearer"}

DISPLAY_NAME_MAX_LEN = 80

# Circonscriptions are numbered from 1 within a department; the largest
# (Nord, Paris, Bouches-du-Rhône) stay well under 30. Stored as a bare number,
# the convention deputies.circonscription and migration 013 both follow.
_CIRCONSCRIPTION = re.compile(r"[0-9]{1,2}")


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------
# Module-level on purpose: the integration suite neutralises the ownership
# clause in each of these to prove RLS is enforcing on its own (see the module
# docstring). Every constant is plain text with named placeholders.

_PROFILE_COLUMNS = (
    "id::text AS id, display_name, preferred_language, "
    "department_code, circonscription, created_at, updated_at"
)

SQL_SELECT_PROFILE = f"""
    SELECT {_PROFILE_COLUMNS}
    FROM app_private.profiles
    WHERE id = %(profile_id)s
"""

SQL_INSERT_PROFILE = f"""
    INSERT INTO app_private.profiles
        (id, auth_user_id, display_name, preferred_language,
         department_code, circonscription)
    VALUES
        (%(profile_id)s, %(auth_user_id)s, %(display_name)s,
         COALESCE(%(preferred_language)s, 'fr'),
         %(department_code)s, %(circonscription)s)
    RETURNING {_PROFILE_COLUMNS}
"""

# `{assignments}` is filled by psycopg2.sql from a fixed column allowlist.
SQL_UPDATE_PROFILE = f"""
    UPDATE app_private.profiles
    SET {{assignments}}
    WHERE id = %(profile_id)s
    RETURNING {_PROFILE_COLUMNS}
"""

# Appended to the SET list when the department changes without a new
# circonscription (see update_my_profile).
SQL_CLEAR_STALE_CIRCONSCRIPTION = """
    circonscription = CASE
        WHEN department_code IS DISTINCT FROM %(department_code)s THEN NULL
        ELSE circonscription
    END
"""

# ON DELETE CASCADE on every child table (migration 013) makes this one
# statement remove the follows, bookmarks and preferences with the profile.
SQL_DELETE_PROFILE = """
    DELETE FROM app_private.profiles
    WHERE id = %(profile_id)s
"""

SQL_DEPUTY_EXISTS = "SELECT 1 FROM public.deputies WHERE deputy_id = %(deputy_id)s"

SQL_LIST_FOLLOWED_DEPUTIES = """
    SELECT d.deputy_id, d.full_name, d.party, d.party_short, d.department,
           d.circonscription, d.photo_url, f.created_at AS followed_at
    FROM app_private.followed_deputies f
    JOIN public.deputies d ON d.deputy_id = f.deputy_id
    WHERE f.profile_id = %(profile_id)s
    ORDER BY f.created_at DESC, f.deputy_id
"""

SQL_FOLLOW_DEPUTY = """
    INSERT INTO app_private.followed_deputies (profile_id, deputy_id)
    VALUES (%(profile_id)s, %(deputy_id)s)
    ON CONFLICT (profile_id, deputy_id) DO NOTHING
"""

SQL_UNFOLLOW_DEPUTY = """
    DELETE FROM app_private.followed_deputies
    WHERE profile_id = %(profile_id)s AND deputy_id = %(deputy_id)s
"""

SQL_LIST_FOLLOWED_THEMES = """
    SELECT theme_slug, created_at AS followed_at
    FROM app_private.followed_themes
    WHERE profile_id = %(profile_id)s
    ORDER BY created_at DESC, theme_slug
"""

SQL_FOLLOW_THEME = """
    INSERT INTO app_private.followed_themes (profile_id, theme_slug)
    VALUES (%(profile_id)s, %(theme_slug)s)
    ON CONFLICT (profile_id, theme_slug) DO NOTHING
"""

SQL_UNFOLLOW_THEME = """
    DELETE FROM app_private.followed_themes
    WHERE profile_id = %(profile_id)s AND theme_slug = %(theme_slug)s
"""

SQL_VOTE_EXISTS = "SELECT 1 FROM public.votes WHERE vote_id = %(vote_id)s"

SQL_LIST_BOOKMARKS = """
    SELECT v.vote_id, v.vote_title, v.voted_at, v.result, b.created_at AS bookmarked_at
    FROM app_private.bookmarks b
    JOIN public.votes v ON v.vote_id = b.vote_id
    WHERE b.profile_id = %(profile_id)s
    ORDER BY b.created_at DESC, b.vote_id
"""

SQL_ADD_BOOKMARK = """
    INSERT INTO app_private.bookmarks (profile_id, vote_id)
    VALUES (%(profile_id)s, %(vote_id)s)
    ON CONFLICT (profile_id, vote_id) DO NOTHING
"""

SQL_REMOVE_BOOKMARK = """
    DELETE FROM app_private.bookmarks
    WHERE profile_id = %(profile_id)s AND vote_id = %(vote_id)s
"""

_PREFERENCE_COLUMNS = "followed_deputy_votes, followed_theme_votes, weekly_digest, updated_at"

SQL_SELECT_PREFERENCES = f"""
    SELECT {_PREFERENCE_COLUMNS}
    FROM app_private.notification_preferences
    WHERE profile_id = %(profile_id)s
"""

# A NULL parameter keeps the stored value (or the default, on first save).
SQL_UPSERT_PREFERENCES = f"""
    INSERT INTO app_private.notification_preferences
        (profile_id, followed_deputy_votes, followed_theme_votes, weekly_digest)
    VALUES
        (%(profile_id)s,
         COALESCE(%(followed_deputy_votes)s, FALSE),
         COALESCE(%(followed_theme_votes)s, FALSE),
         COALESCE(%(weekly_digest)s, FALSE))
    ON CONFLICT (profile_id) DO UPDATE SET
        followed_deputy_votes = COALESCE(
            %(followed_deputy_votes)s, notification_preferences.followed_deputy_votes),
        followed_theme_votes = COALESCE(
            %(followed_theme_votes)s, notification_preferences.followed_theme_votes),
        weekly_digest = COALESCE(
            %(weekly_digest)s, notification_preferences.weekly_digest)
    RETURNING {_PREFERENCE_COLUMNS}
"""

SQL_DELETE_PREFERENCES = """
    DELETE FROM app_private.notification_preferences
    WHERE profile_id = %(profile_id)s
"""

SQL_EXPORT_PROFILE = """
    SELECT id::text AS id, auth_user_id::text AS auth_user_id, display_name,
           preferred_language, department_code, circonscription, created_at, updated_at
    FROM app_private.profiles
    WHERE id = %(profile_id)s
"""

SQL_EXPORT_FOLLOWED_DEPUTIES = """
    SELECT deputy_id, created_at
    FROM app_private.followed_deputies
    WHERE profile_id = %(profile_id)s
    ORDER BY created_at, deputy_id
"""

SQL_EXPORT_FOLLOWED_THEMES = """
    SELECT theme_slug, created_at
    FROM app_private.followed_themes
    WHERE profile_id = %(profile_id)s
    ORDER BY created_at, theme_slug
"""

SQL_EXPORT_BOOKMARKS = """
    SELECT vote_id, created_at
    FROM app_private.bookmarks
    WHERE profile_id = %(profile_id)s
    ORDER BY created_at, vote_id
"""


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class ProfileFields(BaseModel):
    """Editable profile fields. Omit a field to leave it unchanged; send `null`
    to clear it (except `preferred_language`, which always has a value)."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "display_name": "Camille",
                "preferred_language": "fr",
                "department_code": "83",
                "circonscription": "1",
            }
        },
    )

    display_name: Optional[str] = None
    preferred_language: Optional[Literal["fr", "en"]] = None
    department_code: Optional[str] = None
    circonscription: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def _display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            # Clearing is explicit (`null`); a blank string is more likely a
            # client bug than a request to erase the name.
            raise ValueError("must not be blank; send null to clear it")
        if len(value) > DISPLAY_NAME_MAX_LEN:
            raise ValueError(f"at most {DISPLAY_NAME_MAX_LEN} characters")
        if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
            raise ValueError("must not contain control characters")
        return value

    @field_validator("department_code")
    @classmethod
    def _department_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = normalize_code(value)
        if code is None:
            raise ValueError("unknown department code")
        return code

    @field_validator("circonscription")
    @classmethod
    def _circonscription(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not _CIRCONSCRIPTION.fullmatch(value) or int(value) == 0:
            raise ValueError("must be a circonscription number, e.g. '1'")
        return str(int(value))  # "01" -> "1", deputies.circonscription's form

    @model_validator(mode="after")
    def _language_is_never_cleared(self):
        if "preferred_language" in self.model_fields_set and self.preferred_language is None:
            raise ValueError("preferred_language cannot be null")
        return self

    def changes(self) -> dict:
        """Only the fields the caller actually sent, `null`s included."""
        return {name: getattr(self, name) for name in self.model_fields_set}


class NotificationPreferencesUpdate(BaseModel):
    """Omit a flag, or send `null`, to leave it unchanged."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {"followed_deputy_votes": True}},
    )

    followed_deputy_votes: Optional[bool] = None
    followed_theme_votes: Optional[bool] = None
    weekly_digest: Optional[bool] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@contextmanager
def _transaction(profile_id: uuid.UUID):
    """`account_transaction`, with an unavailable account store answered as 503."""
    try:
        with account_transaction(profile_id) as cur:
            yield cur
    except AccountStoreUnavailable:
        raise HTTPException(
            status_code=503, detail="Account storage is temporarily unavailable"
        ) from None


def _params(account: Account, **extra) -> dict:
    return {"profile_id": str(account.profile_id), **extra}


def _gone() -> HTTPException:
    # The profile was deleted between require_account's lookup and this
    # transaction: the same answer require_account gives a deleted account.
    return HTTPException(
        status_code=401,
        detail="No MonÉlu account for this identity",
        headers=_UNAUTHENTICATED_HEADERS,
    )


def _unprocessable(loc: tuple[str, ...], msg: str) -> HTTPException:
    """A 422 in the same shape FastAPI gives a request-validation failure.

    One shape for every 422 on these routes, so a client (#416) parses a single
    format: `detail` is a list of `{loc, msg, type}`.
    """
    return HTTPException(
        status_code=422,
        detail=[{"loc": list(loc), "msg": msg, "type": "value_error"}],
    )


def _check_territory(row: dict) -> None:
    """A circonscription number only means something inside a department."""
    if row.get("circonscription") and not row.get("department_code"):
        raise _unprocessable(
            ("body", "circonscription"), "circonscription requires a department_code"
        )


def _read_profile(profile_id: uuid.UUID) -> dict | None:
    with _transaction(profile_id) as cur:
        cur.execute(SQL_SELECT_PROFILE, {"profile_id": str(profile_id)})
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=AccountProfile,
    summary="The signed-in caller's own MonÉlu profile",
)
def get_my_profile(account: Account = Depends(require_account)):
    """The profile of the account holder whose Supabase access token is presented.

    Requires `Authorization: Bearer <access token>`. The API verifies the token's
    signature, expiry, audience and issuer itself; a forwarded user id or any
    other caller-asserted identity is ignored. 401 when the header is absent,
    the token does not verify, or no MonÉlu profile exists for that identity
    (create one with `POST /account/me`). 503 when account authentication or
    the account database is unavailable.

    Returns only the caller's own row - there is no way to address another
    account. Nothing about public data requires an account: every other endpoint
    in this API stays anonymous.
    """
    row = _read_profile(account.profile_id)
    if row is None:
        raise _gone()
    return AccountProfile(**row)


@router.post(
    "/me",
    response_model=AccountProfile,
    summary="Create the signed-in caller's MonÉlu profile",
    responses={200: {"description": "The profile already existed and is returned unchanged"}},
    status_code=201,
)
def create_my_profile(
    response: Response,
    body: Optional[ProfileFields] = Body(default=None),
    user: VerifiedUser = Depends(require_verified_user),
):
    """Create the MonÉlu profile for a verified Supabase identity, on first sign-in.

    This is not sign-up: Supabase Auth has already created and verified the
    identity, and this only adds the MonÉlu row every other account route
    needs. The body is optional and takes the same fields as `PATCH
    /account/me`; `preferred_language` defaults to `fr`. A `circonscription`
    requires a `department_code` (a bare number, only meaningful inside a
    department), and an unknown department code is 422.

    Idempotent: 201 with the new profile, or 200 with the existing profile left
    unchanged when one already exists (use `PATCH /account/me` to change it).
    401 without a valid access token.
    """
    fields = body.changes() if body else {}
    _check_territory(fields)

    existing = account_auth.resolve_profile_id(user.auth_user_id)
    if existing is None:
        profile_id = uuid.uuid4()
        params = {
            "profile_id": str(profile_id),
            "auth_user_id": str(user.auth_user_id),
            "display_name": fields.get("display_name"),
            "preferred_language": fields.get("preferred_language"),
            "department_code": fields.get("department_code"),
            "circonscription": fields.get("circonscription"),
        }
        try:
            with _transaction(profile_id) as cur:
                cur.execute(SQL_INSERT_PROFILE, params)
                return AccountProfile(**cur.fetchone())
        except psycopg2.errors.UniqueViolation:
            # A concurrent first request created it; fall through and return it.
            existing = account_auth.resolve_profile_id(user.auth_user_id)
            if existing is None:
                raise

    response.status_code = 200
    row = _read_profile(existing)
    if row is None:
        raise _gone()
    return AccountProfile(**row)


@router.patch(
    "/me",
    response_model=AccountProfile,
    summary="Update the signed-in caller's profile",
)
def update_my_profile(body: ProfileFields, account: Account = Depends(require_account)):
    """Change any of display name, preferred language, department and circonscription.

    Only the fields present in the body change; send `null` to clear
    `display_name`, `department_code` or `circonscription`. `preferred_language`
    is `fr` or `en` and cannot be cleared. `department_code` is a code as
    `GET /departments/{code}` takes it (`"83"`, `"2A"`, `"971"`), and
    `circonscription` a bare number within it (`"1"`); a circonscription left
    without a department is 422. Changing `department_code` without also
    sending `circonscription` clears the stored circonscription, since the
    number belongs to the old department. A blank `display_name` is 422.
    Territory is department + circonscription only (ADR-040 §6): no address or
    commune is collected. Returns the updated
    profile. 401 without a valid access token or profile.
    """
    changes = body.changes()
    if not changes:
        row = _read_profile(account.profile_id)
    else:
        assignments = [
            sql.SQL("{} = {}").format(sql.Identifier(name), sql.Placeholder(name))
            for name in sorted(changes)
        ]
        if "department_code" in changes and "circonscription" not in changes:
            # Circonscription numbers are per department, so one carried over
            # from the old department names a different seat - or none at all.
            # SET expressions read the pre-update row, so this compares the
            # stored department with the new one.
            assignments.append(sql.SQL(SQL_CLEAR_STALE_CIRCONSCRIPTION))
        query = sql.SQL(SQL_UPDATE_PROFILE).format(assignments=sql.SQL(", ").join(assignments))
        with _transaction(account.profile_id) as cur:
            cur.execute(query, _params(account, **changes))
            row = cur.fetchone()
            if row is not None:
                # Raising inside the transaction rolls the update back.
                _check_territory(row)
    if row is None:
        raise _gone()
    return AccountProfile(**row)


@router.delete(
    "/me",
    status_code=204,
    summary="Delete the signed-in caller's account and all of its data",
)
def delete_my_account(account: Account = Depends(require_account)):
    """Irreversibly delete the caller's MonÉlu profile and every row that depends on it.

    One statement removes the profile, and the database cascades it to every
    followed deputy, followed theme, bookmark and notification preference - no
    other account is touched. Immediate and total (RGPD article 17, ADR-040
    §6); there is no soft delete and no grace period, so download
    `GET /account/export` first if the data is wanted.

    Afterwards the same access token answers 401 on every account route, since
    it no longer resolves to a profile. The sign-in identity itself (the email
    address) is held by Supabase Auth, outside these tables, and this endpoint
    does not remove it: the API holds no Supabase admin credential. 204 on
    success.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_DELETE_PROFILE, _params(account))
    return Response(status_code=204)


@router.get(
    "/export",
    response_model=AccountExport,
    summary="Download everything MonÉlu stores about the signed-in caller",
)
def export_my_data(account: Account = Depends(require_account)):
    """Every stored row belonging to the caller, as JSON (RGPD articles 15 and 20).

    The profile (including the Supabase user id it is linked to), followed
    deputies, followed themes, bookmarks and notification preferences, with the
    column names of the tables they are stored in and no public data joined in.
    `notification_preferences` is null when none were ever saved. Nothing about
    any other account is included, and nothing is derived: MonÉlu computes no
    profile or label from what a caller follows.

    Served with `Content-Disposition: attachment`, so a browser saves it as a
    file. The email address used to sign in is held by Supabase Auth, outside
    these tables, and is not part of this export. 401 without a valid access
    token or profile.
    """
    params = _params(account)
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_EXPORT_PROFILE, params)
        profile = cur.fetchone()
        if profile is None:
            raise _gone()
        cur.execute(SQL_EXPORT_FOLLOWED_DEPUTIES, params)
        followed_deputies = cur.fetchall()
        cur.execute(SQL_EXPORT_FOLLOWED_THEMES, params)
        followed_themes = cur.fetchall()
        cur.execute(SQL_EXPORT_BOOKMARKS, params)
        bookmarks = cur.fetchall()
        cur.execute(SQL_SELECT_PREFERENCES, params)
        preferences = cur.fetchone()

    exported_at = datetime.now(timezone.utc)
    export = AccountExport(
        exported_at=exported_at,
        profile=profile,
        followed_deputies=followed_deputies,
        followed_themes=followed_themes,
        bookmarks=bookmarks,
        notification_preferences=preferences,
    )
    filename = f"monelu-export-{exported_at:%Y-%m-%d}.json"
    return Response(
        content=export.model_dump_json(indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Followed deputies
# ---------------------------------------------------------------------------


@router.get(
    "/follows/deputies",
    response_model=list[AccountFollowedDeputy],
    summary="Deputies the signed-in caller follows",
)
def list_followed_deputies(account: Account = Depends(require_account)):
    """The deputies the caller follows, most recently followed first.

    Each entry carries the deputy's public identity fields (name, group,
    department, circonscription, portrait) so a client can render the list
    without a second call, plus `followed_at`. A former deputy stays in the
    list; `mandate_end` is on `GET /deputies/{id}`. 401 without a valid access
    token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_LIST_FOLLOWED_DEPUTIES, _params(account))
        return cur.fetchall()


@router.put(
    "/follows/deputies/{deputy_id}",
    status_code=204,
    summary="Follow a deputy",
)
def follow_deputy(deputy_id: str, account: Account = Depends(require_account)):
    """Add a deputy to the caller's follows. Idempotent: following twice is a no-op.

    `deputy_id` is the Assemblée nationale identifier as `GET /deputies` returns
    it (`PA720892`). An id not in the deputies table is 422 and nothing is
    stored. Following records the choice and nothing else: no notification is
    sent on the basis of it. 204 on success; 401 without a valid access token or
    profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_DEPUTY_EXISTS, {"deputy_id": deputy_id})
        if cur.fetchone() is None:
            raise _unprocessable(("path", "deputy_id"), "Unknown deputy_id")
        cur.execute(SQL_FOLLOW_DEPUTY, _params(account, deputy_id=deputy_id))
    return Response(status_code=204)


@router.delete(
    "/follows/deputies/{deputy_id}",
    status_code=204,
    summary="Unfollow a deputy",
)
def unfollow_deputy(deputy_id: str, account: Account = Depends(require_account)):
    """Remove a deputy from the caller's follows.

    Idempotent: removing a deputy that is not followed (or does not exist) still
    answers 204, so a client can retry freely. Only the caller's own follow is
    ever removed. 401 without a valid access token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_UNFOLLOW_DEPUTY, _params(account, deputy_id=deputy_id))
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Followed themes
# ---------------------------------------------------------------------------


@router.get(
    "/follows/themes",
    response_model=list[AccountFollowedTheme],
    summary="Themes the signed-in caller follows",
)
def list_followed_themes(account: Account = Depends(require_account)):
    """The themes the caller follows, most recently followed first.

    Each entry has the theme's `slug` (as `GET /themes/{slug}` takes it), its
    display `name`, and `followed_at`. Followed themes are stored exactly as
    chosen and never aggregated into an inferred political profile (ADR-040
    §6). 401 without a valid access token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_LIST_FOLLOWED_THEMES, _params(account))
        rows = cur.fetchall()
    return [
        AccountFollowedTheme(
            slug=row["theme_slug"],
            name=THEME_NAMES.get(row["theme_slug"]),
            followed_at=row["followed_at"],
        )
        for row in rows
    ]


@router.put(
    "/follows/themes/{slug}",
    status_code=204,
    summary="Follow a theme",
)
def follow_theme(slug: str, account: Account = Depends(require_account)):
    """Add a theme to the caller's follows. Idempotent: following twice is a no-op.

    `slug` is one of the ten theme slugs `GET /themes/{slug}` serves
    (`economie-budget`, `sante-social`, ...). Any other value is 422 and nothing
    is stored. 204 on success; 401 without a valid access token or profile.
    """
    if slug not in THEME_NAMES:
        raise _unprocessable(("path", "slug"), "Unknown theme slug")
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_FOLLOW_THEME, _params(account, theme_slug=slug))
    return Response(status_code=204)


@router.delete(
    "/follows/themes/{slug}",
    status_code=204,
    summary="Unfollow a theme",
)
def unfollow_theme(slug: str, account: Account = Depends(require_account)):
    """Remove a theme from the caller's follows.

    Idempotent: removing a theme that is not followed still answers 204. Only
    the caller's own follow is ever removed. 401 without a valid access token or
    profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_UNFOLLOW_THEME, _params(account, theme_slug=slug))
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Bookmarks
# ---------------------------------------------------------------------------


@router.get(
    "/bookmarks",
    response_model=list[AccountBookmark],
    summary="Votes the signed-in caller saved",
)
def list_bookmarks(account: Account = Depends(require_account)):
    """The scrutins the caller bookmarked, most recently saved first.

    Each entry carries the vote's public title, date and result (`adopté` /
    `rejeté`) so a client can render the list without a second call, plus
    `bookmarked_at`. Production holds votes from 2025-07-01 onward. 401 without
    a valid access token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_LIST_BOOKMARKS, _params(account))
        return cur.fetchall()


@router.put(
    "/bookmarks/{vote_id}",
    status_code=204,
    summary="Bookmark a vote",
)
def add_bookmark(vote_id: str, account: Account = Depends(require_account)):
    """Save a scrutin to the caller's bookmarks. Idempotent: saving twice is a no-op.

    `vote_id` is the scrutin identifier as `GET /votes` returns it
    (`VTANR5L17V1234`). An id not in the votes table is 422 and nothing is
    stored. 204 on success; 401 without a valid access token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_VOTE_EXISTS, {"vote_id": vote_id})
        if cur.fetchone() is None:
            raise _unprocessable(("path", "vote_id"), "Unknown vote_id")
        cur.execute(SQL_ADD_BOOKMARK, _params(account, vote_id=vote_id))
    return Response(status_code=204)


@router.delete(
    "/bookmarks/{vote_id}",
    status_code=204,
    summary="Remove a bookmarked vote",
)
def remove_bookmark(vote_id: str, account: Account = Depends(require_account)):
    """Remove a scrutin from the caller's bookmarks.

    Idempotent: removing a vote that is not bookmarked still answers 204. Only
    the caller's own bookmark is ever removed. 401 without a valid access token
    or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_REMOVE_BOOKMARK, _params(account, vote_id=vote_id))
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Notification preferences - stored, never acted on
# ---------------------------------------------------------------------------

_DEFAULT_PREFERENCES = AccountNotificationPreferences(
    followed_deputy_votes=False, followed_theme_votes=False, weekly_digest=False
)


@router.get(
    "/preferences",
    response_model=AccountNotificationPreferences,
    summary="The signed-in caller's stored notification preferences",
)
def get_preferences(account: Account = Depends(require_account)):
    """The caller's notification preferences. **Nothing is sent on their basis.**

    MonÉlu sends no notifications, digests or alerts today: ADR-040 permits
    only the transactional sign-in email, and the alerts work (#359) is on hold.
    These flags are stored so a later feature can honour them, and a client
    must say so rather than imply delivery. Until the caller first saves one,
    every flag reads false and `updated_at` is null. 401 without a valid access
    token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_SELECT_PREFERENCES, _params(account))
        row = cur.fetchone()
    return AccountNotificationPreferences(**row) if row else _DEFAULT_PREFERENCES


@router.patch(
    "/preferences",
    response_model=AccountNotificationPreferences,
    summary="Update the signed-in caller's notification preferences",
)
def update_preferences(
    body: NotificationPreferencesUpdate, account: Account = Depends(require_account)
):
    """Store any of the three notification flags. **Nothing is sent on their basis.**

    Flags omitted from the body (or sent as `null`) keep their stored value, or
    their default, false, on first save. Storing a preference sends nothing,
    schedules nothing and enqueues nothing (ADR-040; #359's hold stands).
    Returns the stored preferences. 401 without a valid access token or profile.
    """
    if not body.model_fields_set:
        # Nothing to store: an empty body must not create a row the export
        # would then report as a saved choice.
        return get_preferences(account)
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_UPSERT_PREFERENCES, _params(account, **body.model_dump()))
        return cur.fetchone()


@router.delete(
    "/preferences",
    status_code=204,
    summary="Reset the signed-in caller's notification preferences",
)
def delete_preferences(account: Account = Depends(require_account)):
    """Delete the caller's stored notification preferences, returning them to defaults.

    Removes the stored row, so `GET /account/preferences` reads every flag as
    false again and the export shows `notification_preferences: null`.
    Idempotent. 204 on success; 401 without a valid access token or profile.
    """
    with _transaction(account.profile_id) as cur:
        cur.execute(SQL_DELETE_PREFERENCES, _params(account))
    return Response(status_code=204)
