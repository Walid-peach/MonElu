"""
The #414 account endpoints without a database (ADR-040).

Tokens are real ES256 JWTs verified by the real code path (the fixtures come
from test_account_auth.py); the pools are mocks that record every statement.
Cross-user isolation and deletion are proven against a real Postgres in
tests/integration/test_account_endpoints.py - this suite covers what a mock can
honestly show: authentication on every route, input validation before anything
is stored, the statement shapes, and that nothing here can send a message.
"""

import ast
import re
from pathlib import Path
from unittest.mock import patch

import psycopg2.sql
import pytest

import api.account_auth as account_auth
import api.db as _db
import api.routers.account as account_router
from tests.unit.test_account_auth import (  # noqa: F401 - _supabase is an autouse fixture
    AUTH_USER_ID,
    PROFILE_ID,
    PROFILE_ROW,
    _mock_pool,
    _statements,
    _supabase,
    _token,
)

AUTH = {"Authorization": f"Bearer {_token()}"}


@pytest.fixture
def profile_exists():
    with patch.object(account_auth, "resolve_profile_id", return_value=PROFILE_ID) as resolve:
        yield resolve


@pytest.fixture
def account_pool():
    pool, conn, cursor = _mock_pool(fetchone=PROFILE_ROW)
    cursor.fetchall.return_value = []
    with patch.object(_db, "_account_pool", pool):
        yield pool, conn, cursor


def _account_operations(client) -> list[tuple[str, str]]:
    paths = client.get("/openapi.json").json()["paths"]
    return sorted(
        (method.upper(), path)
        for path, operations in paths.items()
        if path.startswith("/account")
        for method in operations
    )


def _concrete(path: str) -> str:
    # A real theme slug, so the theme routes get past their DB-free slug check.
    return re.sub(r"\{[^}]+\}", "x", path.replace("{slug}", "agriculture"))


# ---------------------------------------------------------------------------
# Authentication on every route
# ---------------------------------------------------------------------------


def test_every_account_route_requires_a_bearer_token(client, profile_exists, account_pool):
    operations = _account_operations(client)
    assert len(operations) == 17

    spec = client.get("/openapi.json").json()["paths"]
    for method, path in operations:
        assert spec[path][method.lower()]["security"] == [{"HTTPBearer": []}], (method, path)
        r = client.request(method, _concrete(path), json={})
        assert r.status_code == 401, (method, path, r.status_code)

    account_pool[0].getconn.assert_not_called()


def test_every_route_but_creation_needs_an_existing_profile(client, account_pool):
    with patch.object(account_auth, "resolve_profile_id", return_value=None):
        for method, path in _account_operations(client):
            if (method, path) == ("POST", "/account/me"):
                continue
            r = client.request(method, _concrete(path), headers=AUTH, json={})
            assert r.status_code == 401, (method, path)
    account_pool[0].getconn.assert_not_called()


def test_account_store_outage_is_503(client, profile_exists):
    with patch.object(_db, "_account_pool", None):
        for method, path in _account_operations(client):
            if method == "POST":
                continue  # needs the owner lookup to say "no profile" first
            r = client.request(method, _concrete(path), headers=AUTH, json={})
            assert r.status_code == 503, (method, path)


# ---------------------------------------------------------------------------
# Unknown ids and invalid bodies are rejected before anything is stored
# ---------------------------------------------------------------------------


def test_unknown_theme_is_422_without_touching_the_database(client, profile_exists, account_pool):
    r = client.put("/account/follows/themes/fiscalite", headers=AUTH)
    assert r.status_code == 422
    account_pool[0].getconn.assert_not_called()


@pytest.mark.parametrize(
    "path",
    ["/account/follows/deputies/PA999999", "/account/bookmarks/VTANR5L17V9999"],
)
def test_unknown_deputy_or_vote_is_422_and_rolled_back(client, profile_exists, account_pool, path):
    _pool, conn, cursor = account_pool
    cursor.fetchone.return_value = None  # the existence check finds nothing

    r = client.put(path, headers=AUTH)

    assert r.status_code == 422
    assert not any(s.startswith("INSERT") for s in _statements(cursor))
    conn.commit.assert_not_called()
    conn.rollback.assert_called()


@pytest.mark.parametrize(
    "body",
    [
        {"department_code": "00"},
        {"department_code": "Var"},
        {"circonscription": "premiere"},
        {"circonscription": "0"},
        {"circonscription": "123"},
        {"display_name": "x" * 81},
        {"display_name": "a\nb"},
        {"preferred_language": "de"},
        {"preferred_language": None},
        {"birthdate": "1990-01-01"},
        {"email": "camille@example.org"},
    ],
    ids=[
        "unknown-department",
        "department-name",
        "circonscription-word",
        "circonscription-zero",
        "circonscription-too-long",
        "name-too-long",
        "name-control-char",
        "unsupported-language",
        "null-language",
        "birthdate-not-collected",
        "email-not-collected",
    ],
)
def test_invalid_profile_body_is_422(client, profile_exists, account_pool, body):
    r = client.patch("/account/me", headers=AUTH, json=body)
    assert r.status_code == 422
    account_pool[0].getconn.assert_not_called()


def test_circonscription_needs_a_department_on_creation(client, account_pool):
    with patch.object(account_auth, "resolve_profile_id", return_value=None):
        r = client.post("/account/me", headers=AUTH, json={"circonscription": "1"})
    assert r.status_code == 422
    account_pool[0].getconn.assert_not_called()


def test_unknown_preference_is_422(client, profile_exists, account_pool):
    r = client.patch("/account/preferences", headers=AUTH, json={"sms_alerts": True})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Statement shapes
# ---------------------------------------------------------------------------


def test_profile_update_sets_only_the_sent_fields(client, profile_exists, account_pool):
    _pool, _conn, cursor = account_pool

    r = client.patch(
        "/account/me", headers=AUTH, json={"department_code": "2a", "display_name": None}
    )

    assert r.status_code == 200
    first, *_rest, update = cursor.execute.call_args_list
    assert first.args == ("SET LOCAL app.user_id = %s", (str(PROFILE_ID),))
    # The SET clause is composed from an allowlist of column identifiers.
    assert isinstance(update.args[0], psycopg2.sql.Composed)
    params = update.args[1]
    assert params == {"profile_id": str(PROFILE_ID), "department_code": "2A", "display_name": None}


def test_creation_inserts_under_the_new_profile_identity(client, account_pool):
    _pool, conn, cursor = account_pool

    with patch.object(account_auth, "resolve_profile_id", return_value=None):
        r = client.post("/account/me", headers=AUTH, json={"display_name": " Camille "})

    assert r.status_code == 201
    set_identity, _timeout, insert = cursor.execute.call_args_list
    new_id = set_identity.args[1][0]
    assert insert.args[1]["profile_id"] == new_id
    assert insert.args[1]["auth_user_id"] == str(AUTH_USER_ID)
    assert insert.args[1]["display_name"] == "Camille"
    conn.commit.assert_called_once()


def test_creation_returns_an_existing_profile_unchanged(client, profile_exists, account_pool):
    _pool, _conn, cursor = account_pool

    r = client.post("/account/me", headers=AUTH, json={"display_name": "Other"})

    assert r.status_code == 200
    assert r.json()["display_name"] == "Camille"
    assert not any(s.startswith("INSERT") for s in _statements(cursor))


def test_export_is_a_download_with_no_preferences_when_none_saved(
    client, profile_exists, account_pool
):
    _pool, _conn, cursor = account_pool
    export_profile = {**PROFILE_ROW, "auth_user_id": str(AUTH_USER_ID)}
    cursor.fetchone.side_effect = [export_profile, None]

    r = client.get("/account/export", headers=AUTH)

    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith('attachment; filename="monelu-export-')
    body = r.json()
    assert body["profile"]["auth_user_id"] == str(AUTH_USER_ID)
    assert body["notification_preferences"] is None
    assert body["followed_deputies"] == body["followed_themes"] == body["bookmarks"] == []


def test_preferences_default_to_false_before_any_save(client, profile_exists, account_pool):
    account_pool[2].fetchone.return_value = None
    r = client.get("/account/preferences", headers=AUTH)
    assert r.json() == {
        "followed_deputy_votes": False,
        "followed_theme_votes": False,
        "weekly_digest": False,
        "updated_at": None,
    }


def test_every_account_statement_names_its_owner():
    """Defence in depth: each statement that reads, changes or removes account
    rows carries the explicit ownership clause, in the one spelling the
    integration suite knows how to strip when it proves RLS on its own."""
    owner_clause = re.compile(r"\b(?:\w+\.)?(?:profile_id|id) = %\(profile_id\)s")
    for name in dir(account_router):
        statement = getattr(account_router, name)
        if not (name.startswith("SQL_") and isinstance(statement, str)):
            continue
        if "app_private." not in statement or statement.lstrip().startswith("INSERT"):
            continue
        assert owner_clause.search(statement), f"{name} has no explicit ownership filter"


# ---------------------------------------------------------------------------
# Nothing here can send a message (ADR-040, #359)
# ---------------------------------------------------------------------------


def test_the_account_router_imports_nothing_that_can_send():
    source = Path(account_router.__file__).read_text(encoding="utf-8")
    imported = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])

    assert imported <= {
        "api",
        "contextlib",
        "datetime",
        "fastapi",
        "psycopg2",
        "pydantic",
        "re",
        "typing",
        "uuid",
    }, f"unexpected import in the account router: {imported}"


def test_saving_preferences_only_writes_the_preferences_row(client, profile_exists, account_pool):
    _pool, conn, cursor = account_pool
    cursor.fetchone.return_value = {
        "followed_deputy_votes": True,
        "followed_theme_votes": False,
        "weekly_digest": False,
        "updated_at": None,
    }
    r = client.patch("/account/preferences", headers=AUTH, json={"followed_deputy_votes": True})

    assert r.status_code == 200
    writes = [s for s in _statements(cursor) if not s.startswith("SET LOCAL")]
    assert len(writes) == 1
    assert writes[0].startswith("INSERT INTO app_private.notification_preferences")
    conn.commit.assert_called_once()
