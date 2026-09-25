"""
Proves the #412 / ADR-040 isolation claim against a real Postgres, rather than
trusting that a policy written in a migration does anything.

The claim being tested: with the restricted role and `app.user_id` set, a query
carrying **no `WHERE` clause of its own** returns only the signed-in profile's
rows, and a missing identity returns nothing at all. That is what makes the
policies a gate instead of decoration - #414's endpoints will also carry explicit
filters, and this suite is what proves those filters are defence in depth rather
than the only thing standing between two users' accounts.

Every test runs inside a transaction that is rolled back, and uses
`SET LOCAL ROLE`, so neither the role switch nor the GUC leaks into the next test
or into the session-scoped connection other integration tests share.
"""

from __future__ import annotations

import contextlib
import uuid

import psycopg2
import psycopg2.extras
import pytest

pytestmark = pytest.mark.integration

# psycopg2 does not adapt `uuid.UUID` or return `uuid` columns as UUID objects
# until this is called. It is needed here only because this suite passes UUID
# objects; the API's restricted pool (#413, api/db.py) deliberately does not
# register it and passes every id as a string instead, matching the owner pool.
psycopg2.extras.register_uuid()

APP_ROLE = "monelu_app_user"

# Seeded by tests/integration/conftest.py.
DEPUTY_A = "PA001"
DEPUTY_B = "PA002"
VOTE_A = "VTANR5L17V0001"
VOTE_B = "VTANR5L17V0002"


@contextlib.contextmanager
def as_app_user(conn, user_id):
    """Run statements as the restricted role with `app.user_id` set, then roll back.

    `SET LOCAL` for both the role and the GUC is the shape ADR-040 mandates: on
    Supabase the API talks to PgBouncer in transaction pooling mode, so a
    session-scoped `SET` would outlive the request and hand the next caller on
    that connection the previous caller's identity.
    """
    with conn.cursor() as cur:
        cur.execute("BEGIN")
        try:
            cur.execute(f"SET LOCAL ROLE {APP_ROLE}")
            if user_id is not None:
                cur.execute("SET LOCAL app.user_id = %s", (str(user_id),))
            yield cur
        finally:
            cur.execute("ROLLBACK")


@pytest.fixture(scope="module")
def accounts(db_conn):
    """Two complete profiles, A and B, each with one row in every child table."""
    profile_a, profile_b = uuid.uuid4(), uuid.uuid4()

    with db_conn.cursor() as cur:
        for profile_id, deputy_id, vote_id, theme in (
            (profile_a, DEPUTY_A, VOTE_A, "economie-budget"),
            (profile_b, DEPUTY_B, VOTE_B, "sante-social"),
        ):
            cur.execute(
                """
                INSERT INTO app_private.profiles
                    (id, auth_user_id, display_name, department_code, circonscription)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (profile_id, uuid.uuid4(), f"Profil {profile_id.hex[:6]}", "83", "1"),
            )
            cur.execute(
                "INSERT INTO app_private.followed_deputies (profile_id, deputy_id) VALUES (%s, %s)",
                (profile_id, deputy_id),
            )
            cur.execute(
                "INSERT INTO app_private.followed_themes (profile_id, theme_slug) VALUES (%s, %s)",
                (profile_id, theme),
            )
            cur.execute(
                "INSERT INTO app_private.bookmarks (profile_id, vote_id) VALUES (%s, %s)",
                (profile_id, vote_id),
            )
            cur.execute(
                """
                INSERT INTO app_private.notification_preferences
                    (profile_id, followed_deputy_votes)
                VALUES (%s, TRUE)
                """,
                (profile_id,),
            )

    yield {"a": profile_a, "b": profile_b}

    with db_conn.cursor() as cur:
        # ON DELETE CASCADE removes every child row - the same single statement
        # #414's account deletion relies on.
        cur.execute(
            "DELETE FROM app_private.profiles WHERE id = ANY(%s)",
            ([profile_a, profile_b],),
        )


# --- the core claim -------------------------------------------------------


def test_unfiltered_select_returns_only_the_signed_in_profile(db_conn, accounts):
    """No `WHERE` clause anywhere in this query. That is the point."""
    with as_app_user(db_conn, accounts["a"]) as cur:
        cur.execute("SELECT id FROM app_private.profiles")
        rows = cur.fetchall()

    assert [row["id"] for row in rows] == [accounts["a"]]


@pytest.mark.parametrize(
    "table",
    [
        "followed_deputies",
        "followed_themes",
        "bookmarks",
        "notification_preferences",
    ],
)
def test_unfiltered_select_on_child_tables_is_scoped(db_conn, accounts, table):
    with as_app_user(db_conn, accounts["b"]) as cur:
        cur.execute(f"SELECT profile_id FROM app_private.{table}")
        rows = cur.fetchall()

    assert [row["profile_id"] for row in rows] == [accounts["b"]]


def test_missing_identity_returns_nothing(db_conn, accounts):
    """Fails closed: `current_setting(…, true)` is NULL, so the policy is false."""
    with as_app_user(db_conn, None) as cur:
        cur.execute("SELECT id FROM app_private.profiles")
        assert cur.fetchall() == []


def test_empty_identity_returns_nothing_instead_of_erroring(db_conn, accounts):
    """The reason the policies wrap the GUC in NULLIF: an empty string would
    otherwise raise on the uuid cast instead of filtering to nothing."""
    with as_app_user(db_conn, "") as cur:
        cur.execute("SELECT id FROM app_private.profiles")
        assert cur.fetchall() == []


# --- writes ---------------------------------------------------------------


def test_update_cannot_reach_another_profile(db_conn, accounts):
    with as_app_user(db_conn, accounts["a"]) as cur:
        cur.execute(
            "UPDATE app_private.profiles SET display_name = 'pwned' WHERE id = %s",
            (accounts["b"],),
        )
        assert cur.rowcount == 0

    with db_conn.cursor() as cur:
        cur.execute("SELECT display_name FROM app_private.profiles WHERE id = %s", (accounts["b"],))
        assert cur.fetchone()["display_name"] != "pwned"


def test_delete_cannot_reach_another_profile(db_conn, accounts):
    with as_app_user(db_conn, accounts["a"]) as cur:
        cur.execute("DELETE FROM app_private.bookmarks WHERE profile_id = %s", (accounts["b"],))
        assert cur.rowcount == 0

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM app_private.bookmarks WHERE profile_id = %s",
            (accounts["b"],),
        )
        assert cur.fetchone()["n"] == 1


def test_insert_on_behalf_of_another_profile_is_rejected(db_conn, accounts):
    """What `WITH CHECK` buys on top of `USING`: a write cannot be addressed to
    someone else's profile even though the row does not exist yet.

    A failed RLS `WITH CHECK` raises InsufficientPrivilege (42501, "new row
    violates row-level security policy"), not CheckViolation - a table CHECK
    constraint is what raises the latter. The distinction matters for #414, which
    has to map this to a 403/404 rather than to a validation error.
    """
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        with as_app_user(db_conn, accounts["a"]) as cur:
            cur.execute(
                "INSERT INTO app_private.followed_themes (profile_id, theme_slug) VALUES (%s, %s)",
                (accounts["b"], "agriculture"),
            )


def test_own_write_succeeds(db_conn, accounts):
    """The policies must not be so tight that the feature cannot work."""
    with as_app_user(db_conn, accounts["a"]) as cur:
        cur.execute(
            "INSERT INTO app_private.followed_themes (profile_id, theme_slug) VALUES (%s, %s)",
            (accounts["a"], "agriculture"),
        )
        assert cur.rowcount == 1


# --- the role itself ------------------------------------------------------


def test_role_lacks_bypassrls_and_superuser(db_conn):
    """Either attribute would make every policy above decoration."""
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = %s",
            (APP_ROLE,),
        )
        role = cur.fetchone()

    assert role is not None, f"{APP_ROLE} does not exist - migration 013 did not run"
    assert role["rolsuper"] is False
    assert role["rolbypassrls"] is False
    # NOLOGIN until an operator sets a password out of band, so no credential for
    # this role lives in the repository (ADR-040).
    assert role["rolcanlogin"] is False


def test_role_owns_nothing(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.relname
            FROM pg_class c
            JOIN pg_roles r ON r.oid = c.relowner
            WHERE r.rolname = %s
            """,
            (APP_ROLE,),
        )
        assert cur.fetchall() == [], "the restricted role must own nothing - owners bypass RLS"


def test_role_cannot_write_public_civic_tables(db_conn):
    """It gets SELECT on deputies and votes for display joins, and nothing else."""
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        with as_app_user(db_conn, uuid.uuid4()) as cur:
            cur.execute("UPDATE deputies SET full_name = 'x' WHERE deputy_id = %s", (DEPUTY_A,))


def test_role_can_read_public_civic_tables(db_conn):
    with as_app_user(db_conn, uuid.uuid4()) as cur:
        cur.execute("SELECT deputy_id FROM deputies WHERE deputy_id = %s", (DEPUTY_A,))
        assert cur.fetchone()["deputy_id"] == DEPUTY_A


def test_owner_connection_still_bypasses_rls(db_conn, accounts):
    """Recorded rather than fixed: this is exactly why the account routes must use
    the restricted pool (#413). The owner sees both profiles, so a policy alone
    would protect nothing if an account query ran on the existing connection.
    """
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM app_private.profiles WHERE id = ANY(%s)",
            ([accounts["a"], accounts["b"]],),
        )
        assert cur.fetchone()["n"] == 2


# --- schema exposure ------------------------------------------------------


def test_only_the_restricted_role_can_reach_the_private_schema(db_conn):
    """Enumerates every non-superuser role on the cluster and asserts none but
    `monelu_app_user` holds USAGE on `app_private`.

    This replaced a version that asked specifically about `anon` and
    `authenticated` and skipped when they were absent - which was everywhere it
    could ever run, since those roles exist only on Supabase and
    tests/integration/conftest.py refuses to connect to a Supabase host at all.
    A test that can never execute is not coverage. Phrased this way it runs
    locally and in CI, and catches the mistake that actually matters: a stray
    GRANT handing the schema to a role that should not see personal data.
    """
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT rolname
            FROM pg_roles
            WHERE NOT rolsuper
              AND rolname NOT LIKE 'pg\\_%'
              AND has_schema_privilege(rolname, 'app_private', 'USAGE')
            ORDER BY rolname
            """
        )
        holders = {row["rolname"] for row in cur.fetchall()}

    # The schema owner is whoever ran the migration; it is allowed and is the
    # connection the rest of the app already uses.
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT nspowner::regrole::text AS owner "
            "FROM pg_namespace WHERE nspname = 'app_private'"
        )
        owner = cur.fetchone()["owner"]

    assert holders - {APP_ROLE, owner} == set(), (
        f"unexpected roles hold USAGE on app_private: {sorted(holders - {APP_ROLE, owner})}"
    )


def test_supabase_postgrest_roles_hold_nothing_when_they_exist(db_conn):
    """The Supabase-specific half, kept as an explicit assertion for the
    databases that have those roles (production). It is a no-op elsewhere rather
    than a skip, so it never reports as coverage it did not provide.
    """
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
        )
        present = [row["rolname"] for row in cur.fetchall()]

        for role in present:
            cur.execute(
                "SELECT has_schema_privilege(%s, 'app_private', 'USAGE') AS has_usage",
                (role,),
            )
            assert cur.fetchone()["has_usage"] is False, f"{role} can reach app_private"


def test_updated_at_is_maintained_by_the_database(db_conn, accounts):
    """The trigger exists so the column cannot drift out of truth when #414's
    endpoints (plural writers) forget to set it."""
    with db_conn.cursor() as cur:
        cur.execute("SELECT updated_at FROM app_private.profiles WHERE id = %s", (accounts["a"],))
        before = cur.fetchone()["updated_at"]

        cur.execute(
            "UPDATE app_private.profiles SET display_name = %s WHERE id = %s",
            ("Renommé", accounts["a"]),
        )
        cur.execute("SELECT updated_at FROM app_private.profiles WHERE id = %s", (accounts["a"],))
        after = cur.fetchone()["updated_at"]

    assert after > before, "updated_at did not move on UPDATE - is the trigger present?"


def test_account_deletion_cascades(db_conn):
    """RGPD article 17 in one statement, which #414 depends on."""
    profile_id, auth_id = uuid.uuid4(), uuid.uuid4()

    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_private.profiles (id, auth_user_id) VALUES (%s, %s)",
            (profile_id, auth_id),
        )
        cur.execute(
            "INSERT INTO app_private.followed_deputies (profile_id, deputy_id) VALUES (%s, %s)",
            (profile_id, DEPUTY_A),
        )
        cur.execute(
            "INSERT INTO app_private.bookmarks (profile_id, vote_id) VALUES (%s, %s)",
            (profile_id, VOTE_A),
        )

        cur.execute("DELETE FROM app_private.profiles WHERE id = %s", (profile_id,))

        for table in ("followed_deputies", "bookmarks"):
            cur.execute(
                f"SELECT COUNT(*) AS n FROM app_private.{table} WHERE profile_id = %s",
                (profile_id,),
            )
            assert cur.fetchone()["n"] == 0, f"{table} rows survived the profile delete"
