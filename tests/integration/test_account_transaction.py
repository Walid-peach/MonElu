"""
`api.db.account_transaction()` against a real Postgres (#413, ADR-040).

test_account_rls.py proves the migration 013 policies filter correctly when a
test switches role by hand. This suite proves the API's own code path does the
same: the identity it sets is gone once its transaction ends, and a connection
that logs in as a member of the restricted role - the way the production pool
will - sees only its own profile with no `WHERE` of its own.

The first claim is Postgres semantics that no mock can stand in for, which is
why it lives here rather than in tests/unit.
"""

from __future__ import annotations

import contextlib
import os
import secrets
import uuid
from urllib.parse import urlparse, urlunparse

import psycopg2
import psycopg2.extras
import psycopg2.pool
import pytest

import api.db as _db

pytestmark = pytest.mark.integration

APP_ROLE = "monelu_app_user"
# A throwaway LOGIN role that inherits the restricted role's privileges, standing
# in for the production login (`monelu_app_user` itself stays NOLOGIN, which
# test_account_rls.py asserts). Dropped at module teardown, so it never appears
# in test_account_rls.py's enumeration of roles holding USAGE on app_private.
LOGIN_ROLE = "monelu_account_it"


@contextlib.contextmanager
def _account_pool(dsn: str):
    """Install a one-connection pool as the account pool: minconn=maxconn=1
    guarantees that consecutive transactions reuse the same server connection.
    (psycopg2 closes returned connections beyond minconn, so minconn=0 would hand
    every transaction a fresh session and prove nothing.)"""
    pool = psycopg2.pool.ThreadedConnectionPool(
        1, 1, dsn=dsn, cursor_factory=psycopg2.extras.RealDictCursor
    )
    previous = _db._account_pool
    _db._account_pool = pool
    try:
        yield pool
    finally:
        _db._account_pool = previous
        pool.closeall()


def _current_identity(pool, expected_backend: int) -> str | None:
    """Read `app.user_id` in a fresh transaction on the pool's only connection."""
    conn = pool.getconn()
    try:
        assert conn.info.backend_pid == expected_backend, "not the same server session"
        with conn.cursor() as cur:
            cur.execute("SELECT current_setting('app.user_id', true) AS v")
            value = cur.fetchone()["v"]
        conn.rollback()
        return value
    finally:
        pool.putconn(conn)


@pytest.fixture(scope="module")
def two_profiles(db_conn):
    profile_a, profile_b = uuid.uuid4(), uuid.uuid4()
    with db_conn.cursor() as cur:
        for profile_id in (profile_a, profile_b):
            cur.execute(
                "INSERT INTO app_private.profiles (id, auth_user_id, display_name) "
                "VALUES (%s, %s, %s)",
                (str(profile_id), str(uuid.uuid4()), f"Profil {profile_id.hex[:6]}"),
            )
    yield profile_a, profile_b
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM app_private.profiles WHERE id = ANY(%s::uuid[])",
            ([str(profile_a), str(profile_b)],),
        )


@pytest.fixture(scope="module")
def restricted_dsn(db_conn):
    """DSN for a LOGIN role that is a member of the restricted role."""
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


def _owner_url() -> str:
    return os.environ["DATABASE_URL"]


def test_identity_does_not_survive_the_transaction(db_conn, two_profiles):
    """The PgBouncer leak ADR-040 guards against: with a session-scoped `SET`,
    the next transaction on this connection would still carry profile A."""
    profile_a, _ = two_profiles

    with _account_pool(_owner_url()) as pool:
        with _db.account_transaction(profile_a) as cur:
            cur.execute("SELECT current_setting('app.user_id', true) AS v, pg_backend_pid() AS pid")
            row = cur.fetchone()
            assert row["v"] == str(profile_a)

        # Postgres reports a custom GUC that was set once and then reverted as ''
        # rather than NULL - which is why the policies wrap it in NULLIF.
        assert _current_identity(pool, row["pid"]) in (None, "")


def test_identity_does_not_survive_a_failed_transaction(db_conn, two_profiles):
    profile_a, _ = two_profiles

    with _account_pool(_owner_url()) as pool:
        with pytest.raises(RuntimeError):
            with _db.account_transaction(profile_a) as cur:
                cur.execute("SELECT pg_backend_pid() AS pid")
                pid = cur.fetchone()["pid"]
                raise RuntimeError("handler failed mid-transaction")

        assert _current_identity(pool, pid) in (None, "")


def test_restricted_login_sees_only_its_own_profile(restricted_dsn, two_profiles):
    """No `WHERE` in the query: RLS alone scopes it, through the API's own code."""
    profile_a, profile_b = two_profiles

    with _account_pool(restricted_dsn):
        with _db.account_transaction(profile_a) as cur:
            cur.execute("SELECT id::text AS id FROM app_private.profiles")
            assert [r["id"] for r in cur.fetchall()] == [str(profile_a)]

        with _db.account_transaction(profile_b) as cur:
            cur.execute("SELECT id::text AS id FROM app_private.profiles")
            assert [r["id"] for r in cur.fetchall()] == [str(profile_b)]


def test_restricted_login_without_identity_sees_nothing(restricted_dsn, two_profiles):
    """Outside account_transaction there is no identity, and the policies fail
    closed - a query that escaped the helper returns nothing, not everyone."""
    with _account_pool(restricted_dsn) as pool:
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM app_private.profiles")
                assert cur.fetchall() == []
            conn.rollback()
        finally:
            pool.putconn(conn)
