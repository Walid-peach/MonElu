"""
Guards the RLS contract on migration-created tables (MON-248): on Supabase the
`public` schema is exposed through PostgREST and the anon role holds default
privileges there, so RLS is the only gate. 001_init.sql set the pattern;
004-009 dropped it and shipped seven unguarded tables, including `api_keys`.
"""

import glob
import os
from pathlib import Path

import pytest

import scripts.migrate
from scripts.migrate import (
    MIGRATIONS_DIR,
    assert_rls_on_created_tables,
    qualify_table,
    scan_tables,
)


def _write(tmp_path, name: str, body: str) -> str:
    path = tmp_path / name
    path.write_text(body)
    return str(path)


def test_current_migration_files_pass():
    """Every table the live migrations create has RLS enabled somewhere."""
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    assert_rls_on_created_tables(migration_files)


def test_the_full_table_set_is_covered():
    """Pins the actual table set, so a future migration that creates a table
    and forgets RLS fails here rather than only in the generic check.

    Names are schema-qualified since #412: the account tables live in
    `app_private`, and an unqualified set could not tell them apart from a
    same-named table in `public`.
    """
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    created, secured = scan_tables(migration_files)

    assert set(created) == {
        "public.deputies",
        "public.votes",
        "public.vote_positions",
        "public.document_chunks",
        "public.api_keys",
        "public.api_key_usage",
        "public.feedback",
        "public.verifications",
        "public.chat_shares",
        "public.quiz_shares",
        "public.agenda_items",
        "app_private.profiles",
        "app_private.followed_deputies",
        "app_private.followed_themes",
        "app_private.bookmarks",
        "app_private.notification_preferences",
    }
    assert set(created) <= secured


def test_table_created_without_rls_is_rejected(tmp_path):
    path = _write(tmp_path, "001_x.sql", "CREATE TABLE IF NOT EXISTS widgets (id TEXT);")
    with pytest.raises(AssertionError, match="widgets"):
        assert_rls_on_created_tables([path])


def test_rls_in_the_creating_migration_passes(tmp_path):
    path = _write(
        tmp_path,
        "001_x.sql",
        "CREATE TABLE IF NOT EXISTS widgets (id TEXT);\n"
        "ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;",
    )
    assert_rls_on_created_tables([path])


def test_rls_in_a_later_backfill_migration_passes(tmp_path):
    """The 010_rls_backfill.sql shape: create in one file, secure in another."""
    created = _write(tmp_path, "001_x.sql", "CREATE TABLE IF NOT EXISTS widgets (id TEXT);")
    secured = _write(tmp_path, "010_rls.sql", "ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;")
    assert_rls_on_created_tables([created, secured])


def test_case_and_whitespace_variants_are_matched(tmp_path):
    path = _write(
        tmp_path,
        "001_x.sql",
        "create table Widgets (id TEXT);\n"
        "alter   table   widgets   enable   row   level   security;",
    )
    assert_rls_on_created_tables([path])


def test_create_table_without_if_not_exists_is_still_checked(tmp_path):
    path = _write(tmp_path, "001_x.sql", "CREATE TABLE widgets (id TEXT);")
    with pytest.raises(AssertionError, match="widgets"):
        assert_rls_on_created_tables([path])


def test_error_names_the_creating_migration(tmp_path):
    path = _write(tmp_path, "004_keys.sql", "CREATE TABLE IF NOT EXISTS api_keys (id TEXT);")
    with pytest.raises(AssertionError, match="004_keys.sql"):
        assert_rls_on_created_tables([path])


def test_commented_out_ddl_is_ignored(tmp_path):
    """Every migration opens with a `-- Idempotent: CREATE TABLE IF NOT EXISTS`
    header. Reading those as real DDL invented a table literally named `if`."""
    path = _write(
        tmp_path,
        "001_x.sql",
        "-- Idempotent: CREATE TABLE IF NOT EXISTS - safe to re-run.\n"
        "/* CREATE TABLE ghosts (id TEXT); */\n"
        "CREATE TABLE IF NOT EXISTS widgets (id TEXT);\n"
        "ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;",
    )
    assert_rls_on_created_tables([path])


def test_commented_out_rls_does_not_satisfy_the_check(tmp_path):
    path = _write(
        tmp_path,
        "001_x.sql",
        "CREATE TABLE IF NOT EXISTS widgets (id TEXT);\n"
        "-- ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;",
    )
    with pytest.raises(AssertionError, match="widgets"):
        assert_rls_on_created_tables([path])


def test_unqualified_names_normalise_to_public():
    assert qualify_table("Widgets") == "public.widgets"
    assert qualify_table("app_private.Profiles") == "app_private.profiles"


def test_schema_qualified_table_is_matched(tmp_path):
    """The pre-#412 patterns captured "app_private" as the table name here and
    never matched the ALTER, so a fully-guarded migration failed the check while
    naming a table that does not exist."""
    path = _write(
        tmp_path,
        "013_x.sql",
        "CREATE TABLE IF NOT EXISTS app_private.widgets (id UUID);\n"
        "ALTER TABLE app_private.widgets ENABLE ROW LEVEL SECURITY;",
    )
    assert_rls_on_created_tables([path])


def test_schema_qualified_table_without_rls_is_rejected(tmp_path):
    path = _write(tmp_path, "013_x.sql", "CREATE TABLE app_private.widgets (id UUID);")
    with pytest.raises(AssertionError, match="app_private.widgets"):
        assert_rls_on_created_tables([path])


def test_rls_on_a_same_named_public_table_does_not_cover_the_private_one(tmp_path):
    """The reason names are compared qualified rather than by bare table name."""
    path = _write(
        tmp_path,
        "013_x.sql",
        "CREATE TABLE app_private.widgets (id UUID);\n"
        "ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;",
    )
    with pytest.raises(AssertionError, match="app_private.widgets"):
        assert_rls_on_created_tables([path])


def test_ledger_table_is_secured_at_its_creation_site():
    """`schema_migrations` is created from Python, not from a .sql file, so
    assert_rls_on_created_tables structurally cannot cover it. Its CREATE and its
    ENABLE ROW LEVEL SECURITY must therefore sit together in migrate.py."""
    source = (Path(scripts.migrate.__file__)).read_text()
    create_at = source.index("CREATE TABLE IF NOT EXISTS schema_migrations")
    rls_at = source.index("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY")
    assert rls_at > create_at, "RLS must be enabled after the ledger table is created"
