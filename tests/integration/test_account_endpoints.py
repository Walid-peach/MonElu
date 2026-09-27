"""
The #414 account endpoints against a real Postgres, through the real app (ADR-040).

Only the token check is replaced: `require_verified_user` is overridden to take
the caller's Supabase id from a test header, so everything after it runs for
real - `require_account`'s owner-side profile lookup, the restricted-role pool,
`SET LOCAL app.user_id`, and the migration 013 policies. The account pool logs
in as a member of `monelu_app_user`, the way production does.

Every cross-user test runs twice. The second run rewrites the ownership clause
(`profile_id = %(profile_id)s`) out of every statement in api/routers/account.py
before the requests are made, so the only thing still separating two accounts is
RLS. Both runs must pass: the first proves the application filters, the second
proves the database does too, rather than the policies being decoration.
"""

from __future__ import annotations

import os
import re
import secrets
import uuid
from unittest.mock import patch
from urllib.parse import urlparse, urlunparse

import psycopg2
import psycopg2.extras
import psycopg2.pool
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

import api.db as _db
import api.routers.account as account_router
from api.account_auth import VerifiedUser, require_verified_user
from api.main import app

pytestmark = pytest.mark.integration

APP_ROLE = "monelu_app_user"
# Dropped at module teardown, so test_account_rls.py's enumeration of roles
# holding USAGE on app_private never sees it.
LOGIN_ROLE = "monelu_account_endpoints_it"
TEST_USER_HEADER = "X-Test-Auth-User"

# Seeded by tests/integration/conftest.py.
DEPUTY_X, DEPUTY_Y = "PA001", "PA002"
VOTE_X, VOTE_Y = "VTANR5L17V0001", "VTANR5L17V0002"

_OWNER_CLAUSE = re.compile(r"\b(?:\w+\.)?(?:profile_id|id) = %\(profile_id\)s")


def _owner_url() -> str:
    return os.environ["DATABASE_URL"]


@pytest.fixture(scope="module")
def restricted_dsn(db_conn):
    password = secrets.token_urlsafe(16)
    with db_conn.cursor() as cur:
        cur.execute(f"DROP ROLE IF EXISTS {LOGIN_ROLE}")
        cur.execute(
            f"CREATE ROLE {LOGIN_ROLE} LOGIN INHERIT PASSWORD %s IN ROLE {APP_ROLE}",
            (password,),
        )
    owner = urlparse(_owner_url())
    netloc = f"{LOGIN_ROLE}:{password}@{owner.hostname}"
    if owner.port:
        netloc += f":{owner.port}"
    yield urlunparse(owner._replace(netloc=netloc))
    with db_conn.cursor() as cur:
        cur.execute(f"DROP ROLE IF EXISTS {LOGIN_ROLE}")


def _verified_from_header(request: Request) -> VerifiedUser:
    return VerifiedUser(auth_user_id=uuid.UUID(request.headers[TEST_USER_HEADER]))


@pytest.fixture(scope="module")
def client(restricted_dsn):
    pool = psycopg2.pool.ThreadedConnectionPool(
        1, 2, dsn=restricted_dsn, cursor_factory=psycopg2.extras.RealDictCursor
    )
    previous = _db._account_pool
    _db._account_pool = pool
    app.dependency_overrides[require_verified_user] = _verified_from_header
    try:
        with patch("api.main._warm_sql_pool"), TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(require_verified_user, None)
        _db._account_pool = previous
        # The app's lifespan closes the account pool on shutdown.
        if not pool.closed:
            pool.closeall()


def _strip_owner_clauses(monkeypatch) -> None:
    """Neutralise the explicit ownership filter in every statement of the router.

    `(TRUE OR profile_id = %(profile_id)s)` keeps the placeholder, so the
    parameters still bind, but filters nothing.
    """
    stripped = 0
    for name in dir(account_router):
        value = getattr(account_router, name)
        if name.startswith("SQL_") and isinstance(value, str):
            rewritten, count = _OWNER_CLAUSE.subn(lambda m: f"(TRUE OR {m.group(0)})", value)
            if count:
                monkeypatch.setattr(account_router, name, rewritten)
                stripped += count
    # Every statement that reads, changes or removes a caller's rows: if the
    # count drops, a filter was written in a form this proof cannot see.
    assert stripped >= 15


@pytest.fixture(params=["explicit-where", "rls-only"])
def mode(request, monkeypatch):
    if request.param == "rls-only":
        _strip_owner_clauses(monkeypatch)
    return request.param


class _User:
    def __init__(self, client: TestClient):
        self.client = client
        self.auth_user_id = uuid.uuid4()
        self.headers = {TEST_USER_HEADER: str(self.auth_user_id)}

    def __getattr__(self, method):
        call = getattr(self.client, method)
        return lambda path, **kw: call(path, headers=self.headers, **kw)


@pytest.fixture
def users(client, db_conn):
    created = [_User(client), _User(client)]
    yield created
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM app_private.profiles WHERE auth_user_id = ANY(%s::uuid[])",
            ([str(u.auth_user_id) for u in created],),
        )


def _populate(user: _User, deputy: str, vote: str, theme: str) -> str:
    r = user.post("/account/me", json={"display_name": f"User {deputy}"})
    assert r.status_code == 201, r.text
    assert user.put(f"/account/follows/deputies/{deputy}").status_code == 204
    assert user.put(f"/account/follows/themes/{theme}").status_code == 204
    assert user.put(f"/account/bookmarks/{vote}").status_code == 204
    assert user.patch("/account/preferences", json={"weekly_digest": True}).status_code == 200
    return r.json()["id"]


def _counts(db_conn, profile_id: str) -> dict[str, int]:
    """Row counts per account table, read on the owner connection (no RLS)."""
    counts = {}
    with db_conn.cursor() as cur:
        for table, column in (
            ("profiles", "id"),
            ("followed_deputies", "profile_id"),
            ("followed_themes", "profile_id"),
            ("bookmarks", "profile_id"),
            ("notification_preferences", "profile_id"),
        ):
            cur.execute(
                f"SELECT count(*) AS n FROM app_private.{table} WHERE {column} = %s",
                (profile_id,),
            )
            counts[table] = cur.fetchone()["n"]
    return counts


# ---------------------------------------------------------------------------
# The owner can read, update and remove each kind of row
# ---------------------------------------------------------------------------


def test_owner_round_trip(users, db_conn):
    alice, _ = users
    profile_id = _populate(alice, DEPUTY_X, VOTE_X, "agriculture")

    r = alice.patch(
        "/account/me",
        json={"preferred_language": "en", "department_code": "083", "circonscription": "01"},
    )
    assert r.status_code == 200
    assert r.json()["department_code"] == "83"
    assert r.json()["circonscription"] == "1"
    assert alice.get("/account/me").json()["preferred_language"] == "en"

    deputies = alice.get("/account/follows/deputies").json()
    assert [d["deputy_id"] for d in deputies] == [DEPUTY_X]
    assert deputies[0]["full_name"] == "Alice Martin"
    assert [t["slug"] for t in alice.get("/account/follows/themes").json()] == ["agriculture"]
    bookmarks = alice.get("/account/bookmarks").json()
    assert [b["vote_id"] for b in bookmarks] == [VOTE_X]
    assert bookmarks[0]["vote_title"]
    assert alice.get("/account/preferences").json()["weekly_digest"] is True

    # Idempotent adds do not duplicate.
    assert alice.put(f"/account/follows/deputies/{DEPUTY_X}").status_code == 204
    assert len(alice.get("/account/follows/deputies").json()) == 1

    assert alice.delete(f"/account/follows/deputies/{DEPUTY_X}").status_code == 204
    assert alice.delete("/account/follows/themes/agriculture").status_code == 204
    assert alice.delete(f"/account/bookmarks/{VOTE_X}").status_code == 204
    assert alice.delete("/account/preferences").status_code == 204
    assert alice.get("/account/preferences").json()["weekly_digest"] is False

    assert _counts(db_conn, profile_id) == {
        "profiles": 1,
        "followed_deputies": 0,
        "followed_themes": 0,
        "bookmarks": 0,
        "notification_preferences": 0,
    }


def test_create_is_idempotent(users):
    alice, _ = users
    first = alice.post("/account/me")
    assert first.status_code == 201
    again = alice.post("/account/me", json={"display_name": "Ignored"})
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["display_name"] is None


def test_circonscription_without_department_is_rolled_back(users):
    alice, _ = users
    alice.post("/account/me", json={"department_code": "83", "circonscription": "2"})

    r = alice.patch("/account/me", json={"department_code": None})
    assert r.status_code == 422
    assert alice.get("/account/me").json()["department_code"] == "83"


# ---------------------------------------------------------------------------
# Unknown ids are rejected and not stored
# ---------------------------------------------------------------------------


def test_unknown_ids_are_rejected_and_not_stored(users, db_conn):
    alice, _ = users
    profile_id = alice.post("/account/me").json()["id"]

    assert alice.put("/account/follows/deputies/PA999999").status_code == 422
    assert alice.put("/account/follows/themes/fiscalite").status_code == 422
    assert alice.put("/account/bookmarks/VTANR5L17V9999").status_code == 422
    assert alice.patch("/account/me", json={"department_code": "00"}).status_code == 422

    counts = _counts(db_conn, profile_id)
    assert counts["followed_deputies"] == counts["followed_themes"] == counts["bookmarks"] == 0


# ---------------------------------------------------------------------------
# Cross-user isolation - explicit WHERE, then RLS alone
# ---------------------------------------------------------------------------


def test_a_user_sees_only_their_own_rows(mode, users):
    alice, bob = users
    _populate(alice, DEPUTY_X, VOTE_X, "agriculture")
    _populate(bob, DEPUTY_Y, VOTE_Y, "international")

    assert [d["deputy_id"] for d in alice.get("/account/follows/deputies").json()] == [DEPUTY_X]
    assert [t["slug"] for t in alice.get("/account/follows/themes").json()] == ["agriculture"]
    assert [b["vote_id"] for b in alice.get("/account/bookmarks").json()] == [VOTE_X]
    assert alice.get("/account/me").json()["display_name"] == f"User {DEPUTY_X}"


def test_export_contains_only_the_callers_data(mode, users):
    alice, bob = users
    alice_id = _populate(alice, DEPUTY_X, VOTE_X, "agriculture")
    bob_id = _populate(bob, DEPUTY_Y, VOTE_Y, "international")

    r = alice.get("/account/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment;")
    export = r.json()

    assert export["profile"]["id"] == alice_id
    assert export["profile"]["auth_user_id"] == str(alice.auth_user_id)
    assert set(export["profile"]) >= {
        "display_name",
        "preferred_language",
        "department_code",
        "circonscription",
        "created_at",
        "updated_at",
    }
    assert [d["deputy_id"] for d in export["followed_deputies"]] == [DEPUTY_X]
    assert [t["theme_slug"] for t in export["followed_themes"]] == ["agriculture"]
    assert [b["vote_id"] for b in export["bookmarks"]] == [VOTE_X]
    assert export["notification_preferences"]["weekly_digest"] is True
    for foreign in (bob_id, str(bob.auth_user_id), DEPUTY_Y, VOTE_Y, "international"):
        assert foreign not in r.text


def test_a_user_cannot_change_or_remove_another_users_rows(mode, users, db_conn):
    alice, bob = users
    _populate(alice, DEPUTY_X, VOTE_X, "agriculture")
    bob_id = _populate(bob, DEPUTY_Y, VOTE_Y, "international")
    before = _counts(db_conn, bob_id)

    # Alice aims every mutation at the rows Bob holds.
    alice.delete(f"/account/follows/deputies/{DEPUTY_Y}")
    alice.delete("/account/follows/themes/international")
    alice.delete(f"/account/bookmarks/{VOTE_Y}")
    alice.delete("/account/preferences")
    alice.patch("/account/me", json={"display_name": "Renamed"})

    assert _counts(db_conn, bob_id) == before
    assert bob.get("/account/me").json()["display_name"] == f"User {DEPUTY_Y}"
    assert bob.get("/account/preferences").json()["weekly_digest"] is True


def test_deletion_is_total_and_touches_no_other_account(mode, users, db_conn):
    """A second account's rows are in the fixture, so a too-broad DELETE fails."""
    alice, bob = users
    alice_id = _populate(alice, DEPUTY_X, VOTE_X, "agriculture")
    # Bob follows the same deputy, theme and vote, so a DELETE keyed on the
    # followed id rather than the profile would take his rows too.
    bob_id = _populate(bob, DEPUTY_X, VOTE_X, "agriculture")
    bob_before = _counts(db_conn, bob_id)

    assert alice.delete("/account/me").status_code == 204

    assert set(_counts(db_conn, alice_id).values()) == {0}
    assert _counts(db_conn, bob_id) == bob_before

    # The same (still unexpired) identity no longer resolves to an account.
    for path in ("/account/me", "/account/export", "/account/bookmarks"):
        r = alice.get(path)
        assert r.status_code == 401, path
    assert bob.get("/account/me").status_code == 200
