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
)


def _write(tmp_path, name: str, body: str) -> str:
    path = tmp_path / name
    path.write_text(body)
    return str(path)


def test_current_migration_files_pass():
    """Every table the live migrations create has RLS enabled somewhere."""
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    assert_rls_on_created_tables(migration_files)


def test_all_eleven_tables_are_covered():
    """Pins the actual table set, so a future migration that creates a table
    and forgets RLS fails here rather than only in the generic check."""
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    from scripts.migrate import CREATE_TABLE_RE, ENABLE_RLS_RE, _strip_sql_comments

    created, secured = set(), set()
    for migration_file in migration_files:
        with open(migration_file) as f:
            sql_text = _strip_sql_comments(f.read())
        created.update(t.lower() for t in CREATE_TABLE_RE.findall(sql_text))
        secured.update(t.lower() for t in ENABLE_RLS_RE.findall(sql_text))

    assert created == {
        "deputies",
        "votes",
        "vote_positions",
        "document_chunks",
        "api_keys",
        "api_key_usage",
        "feedback",
        "verifications",
        "chat_shares",
        "quiz_shares",
        "agenda_items",
    }
    assert created <= secured


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


def test_ledger_table_is_secured_at_its_creation_site():
    """`schema_migrations` is created from Python, not from a .sql file, so
    assert_rls_on_created_tables structurally cannot cover it. Its CREATE and its
    ENABLE ROW LEVEL SECURITY must therefore sit together in migrate.py."""
    source = (Path(scripts.migrate.__file__)).read_text()
    create_at = source.index("CREATE TABLE IF NOT EXISTS schema_migrations")
    rls_at = source.index("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY")
    assert rls_at > create_at, "RLS must be enabled after the ledger table is created"
