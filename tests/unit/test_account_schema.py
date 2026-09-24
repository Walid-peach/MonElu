"""
Source-level guards on data/migrations/013_account_schema.sql (#412, ADR-040).

tests/integration/test_account_rls.py proves the policies work against a real
Postgres; this file runs in the unit tier, with no database, and pins the
properties that would be silently lost in an edit: no anon-readable policy on
personal data, every table carrying a policy that covers writes as well as
reads, deletion cascading, and the theme list staying in step with
api/themes_data.py.
"""

import re
from pathlib import Path

import pytest

from api.themes_data import THEME_NAMES

MIGRATION = (
    Path(__file__).parents[2] / "data" / "migrations" / "013_account_schema.sql"
).read_text()

SQL_COMMENT_RE = re.compile(r"--[^\n]*|/\*.*?\*/", re.DOTALL)
SQL = SQL_COMMENT_RE.sub(" ", MIGRATION)

ACCOUNT_TABLES = [
    "profiles",
    "followed_deputies",
    "followed_themes",
    "bookmarks",
    "notification_preferences",
]

CHILD_TABLES = [t for t in ACCOUNT_TABLES if t != "profiles"]


def test_every_table_is_created_in_the_private_schema():
    """`public` is served by PostgREST; personal data must not live there."""
    created = re.findall(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w.]*)", SQL, re.IGNORECASE
    )
    assert created, "no CREATE TABLE found - did the migration move?"
    for table in created:
        assert table.lower().startswith("app_private."), f"{table} is not in app_private"


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
def test_every_table_enables_rls(table):
    assert re.search(
        rf"ALTER\s+TABLE\s+app_private\.{table}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
        SQL,
        re.IGNORECASE,
    ), f"{table} does not enable RLS"


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
def test_every_table_has_a_policy_covering_reads_and_writes(table):
    """`FOR ALL` with both USING and WITH CHECK. USING alone would filter reads
    and still let a write be addressed to another profile."""
    policy = re.search(
        rf"CREATE\s+POLICY\s+\w+\s+ON\s+app_private\.{table}\b(.*?);",
        SQL,
        re.IGNORECASE | re.DOTALL,
    )
    assert policy, f"{table} has no policy"
    body = policy.group(1)
    assert re.search(r"FOR\s+ALL", body, re.IGNORECASE), f"{table} policy is not FOR ALL"
    assert re.search(r"\bUSING\b", body, re.IGNORECASE), f"{table} policy has no USING"
    assert re.search(r"WITH\s+CHECK", body, re.IGNORECASE), f"{table} policy has no WITH CHECK"


@pytest.mark.parametrize("table", ACCOUNT_TABLES)
def test_policies_read_the_transaction_scoped_guc_and_fail_closed(table):
    """The identity must come from `app.user_id` via current_setting(…, true) -
    the missing-GUC case then yields NULL, every comparison is false, and the
    query returns nothing. NULLIF keeps an empty string on that same path instead
    of raising on the uuid cast.
    """
    policy = re.search(
        rf"CREATE\s+POLICY\s+\w+\s+ON\s+app_private\.{table}\b(.*?);",
        SQL,
        re.IGNORECASE | re.DOTALL,
    )
    body = policy.group(1)
    assert body.count("current_setting('app.user_id', true)") == 2, (
        f"{table} policy must read app.user_id in both USING and WITH CHECK"
    )
    assert body.count("NULLIF(current_setting('app.user_id', true), '')") == 2, (
        f"{table} policy must wrap the GUC in NULLIF so an empty value fails closed"
    )


def test_no_public_read_policy_anywhere():
    """001_init.sql gives the civic tables `public_read` policies because that
    data is public by design. Nothing here is."""
    assert "public_read" not in SQL.lower()
    assert not re.search(r"USING\s*\(\s*true\s*\)", SQL, re.IGNORECASE), (
        "a USING (true) policy would expose personal data to any role with a grant"
    )


@pytest.mark.parametrize("table", CHILD_TABLES)
def test_child_tables_cascade_from_the_profile(table):
    """Account deletion is one statement (RGPD article 17), so every child row
    must follow the profile out."""
    block = re.search(
        rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?app_private\.{table}\s*\((.*?)\n\);",
        SQL,
        re.IGNORECASE | re.DOTALL,
    )
    assert block, f"{table} definition not found"
    assert re.search(
        r"REFERENCES\s+app_private\.profiles\(id\)\s+ON\s+DELETE\s+CASCADE",
        block.group(1),
        re.IGNORECASE,
    ), f"{table} does not cascade from profiles(id)"


def test_theme_check_matches_the_api_theme_taxonomy():
    """The CHECK pins ten slugs in SQL. api/themes_data.py is the source of truth
    for them, and a new theme must be a migration rather than a silent divergence
    that rejects valid writes at runtime."""
    block = re.search(r"theme_slug\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\((.*?)\)\)", SQL, re.DOTALL)
    assert block, "theme_slug CHECK not found"
    slugs_in_sql = set(re.findall(r"'([a-z-]+)'", block.group(1)))
    assert slugs_in_sql == set(THEME_NAMES), (
        "013_account_schema.sql's theme list has drifted from api/themes_data.py"
    )


def test_profile_key_is_monelus_own_uuid_not_the_providers():
    """ADR-040: leaving Supabase Auth must be one column, not a migration of
    every follow and bookmark."""
    block = re.search(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?app_private\.profiles\s*\((.*?)\n\);",
        SQL,
        re.IGNORECASE | re.DOTALL,
    )
    body = block.group(1)
    assert re.search(r"id\s+UUID\s+PRIMARY\s+KEY", body, re.IGNORECASE)
    assert re.search(r"auth_user_id\s+UUID\s+NOT\s+NULL\s+UNIQUE", body, re.IGNORECASE), (
        "the Supabase user id belongs beside the key as a unique attribute, not as the key"
    )


@pytest.mark.parametrize("table", ["profiles", "notification_preferences"])
def test_tables_with_updated_at_get_a_trigger(table):
    """Both tables carrying `updated_at` have several writers once #414 lands, so
    the timestamp is maintained by the database rather than by caller discipline.
    A `BEFORE UPDATE` trigger is the only thing that keeps the column honest."""
    assert re.search(
        rf"CREATE\s+TRIGGER\s+touch_{table}_updated_at\s+BEFORE\s+UPDATE\s+ON\s+"
        rf"app_private\.{table}",
        SQL,
        re.IGNORECASE,
    ), f"{table} has no BEFORE UPDATE trigger for updated_at"


def test_the_updated_at_trigger_is_idempotent():
    """`CREATE TRIGGER` has no IF NOT EXISTS, so a re-run needs the DROP first -
    every migration in this project must survive being applied twice."""
    assert SQL.count("DROP TRIGGER IF EXISTS") == 2
    assert "CREATE OR REPLACE FUNCTION app_private.touch_updated_at()" in SQL


def test_role_creation_explains_a_missing_createrole_privilege():
    """migrate.py is Railway's start hook (`migrate.py && uvicorn`), so a failure
    here stops the API from starting. A bare "permission denied to create role" is
    a bad way to discover that."""
    assert "EXCEPTION WHEN insufficient_privilege" in SQL
    assert "CREATEROLE" in SQL


def test_role_is_created_without_login_and_carries_no_password():
    """No credential for the restricted role lives in the repository: it is
    NOLOGIN until an operator sets a password out of band."""
    assert re.search(r"CREATE\s+ROLE\s+monelu_app_user\s+NOLOGIN", SQL, re.IGNORECASE)
    assert not re.search(r"PASSWORD\s+'", SQL, re.IGNORECASE), "a password literal is in the SQL"


def test_role_attributes_are_verified_rather_than_altered():
    """`ALTER ROLE … NOSUPERUSER/NOBYPASSRLS` needs a real superuser, which
    Supabase's `postgres` role is not - it would pass locally and fail the
    production deploy. The migration raises instead."""
    assert not re.search(
        r"ALTER\s+ROLE\s+monelu_app_user\s+.*(NO)?(SUPERUSER|BYPASSRLS)", SQL, re.IGNORECASE
    ), "this statement requires superuser and will fail on Supabase"
    assert "RAISE EXCEPTION" in SQL, "the rolsuper/rolbypassrls check must fail loudly"


def test_role_gets_no_write_privilege_on_public():
    """It reads deputies and votes for display joins. Nothing else, and no writes:
    ingestion owns those tables."""
    grants = re.findall(r"GRANT\s+(.*?)\s+ON\s+(.*?)\s+TO\s+monelu_app_user", SQL, re.DOTALL)
    public_grants = [(privs, target) for privs, target in grants if "public." in target]
    assert public_grants, "expected an explicit SELECT grant on the civic tables"
    for privs, target in public_grants:
        assert privs.strip().upper() == "SELECT", f"unexpected privilege {privs!r} on {target!r}"
