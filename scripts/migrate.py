"""
migrate.py
Applies data/migrations/*.sql files (in order) against DATABASE_URL.

A schema_migrations ledger records applied files so each migration runs
exactly once — re-deploys skip them. Files should still be written
idempotently as a safety net (the ledger row is only written on success).

Usage:
    python scripts/migrate.py
"""

import glob
import logging
import os
import re
import sys
from collections import defaultdict

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(PROJECT_ROOT, "data", "migrations")

MIGRATION_PREFIX_RE = re.compile(r"^(\d{3})_")

CREATE_TABLE_RE = re.compile(
    r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
ENABLE_RLS_RE = re.compile(
    r"\bALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
    re.IGNORECASE,
)
SQL_COMMENT_RE = re.compile(r"--[^\n]*|/\*.*?\*/", re.DOTALL)

# 005_feedback.sql / 005_verifications.sql were both already applied before this
# check existed. Renaming applied files would re-run them under the filename-keyed
# ledger, so they're grandfathered here rather than fixed (MON-226) - this set
# must never gain new entries.
GRANDFATHERED_DUPLICATE_PREFIXES = {"005"}


def _strip_sql_comments(sql_text: str) -> str:
    """Every migration opens with a `-- Idempotent: CREATE TABLE IF NOT EXISTS`
    header comment. Matching statements without stripping comments first reads
    those as real DDL."""
    return SQL_COMMENT_RE.sub(" ", sql_text)


def assert_unique_numeric_prefixes(migration_files: list[str]) -> None:
    """Numeric prefixes are the ordering contract humans read - two files sharing
    one collide silently once a later migration depends on ordering (MON-226)."""
    by_prefix = defaultdict(list)
    for migration_file in migration_files:
        filename = os.path.basename(migration_file)
        match = MIGRATION_PREFIX_RE.match(filename)
        if match:
            by_prefix[match.group(1)].append(filename)

    duplicates = {
        prefix: names
        for prefix, names in by_prefix.items()
        if len(names) > 1 and prefix not in GRANDFATHERED_DUPLICATE_PREFIXES
    }
    if duplicates:
        details = "; ".join(f"{prefix}: {names}" for prefix, names in sorted(duplicates.items()))
        raise AssertionError(f"Duplicate migration numeric prefixes found - {details}")


def assert_rls_on_created_tables(migration_files: list[str]) -> None:
    """Every table a migration creates in `public` must also have RLS enabled by
    some migration (MON-248).

    On Supabase, `public` is exposed through PostgREST and the anon role holds
    default privileges there, so RLS is the only gate between an anon key and
    the table. 001_init.sql established this; migrations 004-009 silently
    dropped it and shipped seven unguarded tables, including `api_keys`.

    The check is cumulative across all migration files, not per-file: enabling
    RLS in a later backfill migration is a valid way to satisfy it.
    """
    created: dict[str, str] = {}
    secured: set[str] = set()

    for migration_file in migration_files:
        filename = os.path.basename(migration_file)
        with open(migration_file) as f:
            sql_text = _strip_sql_comments(f.read())
        for table in CREATE_TABLE_RE.findall(sql_text):
            created.setdefault(table.lower(), filename)
        secured.update(table.lower() for table in ENABLE_RLS_RE.findall(sql_text))

    unguarded = {table: origin for table, origin in created.items() if table not in secured}
    if unguarded:
        details = "; ".join(
            f"{table} (created in {origin})" for table, origin in sorted(unguarded.items())
        )
        raise AssertionError(
            f"Tables created without ENABLE ROW LEVEL SECURITY - {details}. "
            "Add it in the creating migration, or in a backfill migration."
        )


def _applied_migrations(conn) -> set[str]:
    """Ensure the ledger table exists and return the filenames already applied."""
    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename   TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            # The ledger lives in `public` too, so it needs the same gate as the
            # migration-created tables (MON-248) — and assert_rls_on_created_tables
            # cannot cover it, since it only reads the .sql files. The read side is
            # dull (filenames and timestamps); the write side is not: an anon INSERT
            # of a not-yet-applied filename would make migrate.py skip that
            # migration forever. rag/pipeline/index_manager.py does the same for
            # document_chunks_staging, the other Python-created public table.
            cur.execute("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY")
            cur.execute("SELECT filename FROM schema_migrations")
            return {row["filename"] for row in cur.fetchall()}


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    if not migration_files:
        log.error("No migration files found in %s", MIGRATIONS_DIR)
        sys.exit(1)

    try:
        assert_unique_numeric_prefixes(migration_files)
        assert_rls_on_created_tables(migration_files)
    except AssertionError as exc:
        log.error(str(exc))
        sys.exit(1)

    log.info("Connecting to database…")
    conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        applied = _applied_migrations(conn)

        for migration_file in migration_files:
            filename = os.path.basename(migration_file)
            if filename in applied:
                log.info("Skipped %s (already applied)", filename)
                continue
            with open(migration_file) as f:
                sql = f.read()
            try:
                # One transaction per migration: the SQL and its ledger row
                # commit together, so a failed file is retried next run.
                with conn:
                    with conn.cursor() as cur:
                        cur.execute(sql)
                        cur.execute(
                            "INSERT INTO schema_migrations (filename) VALUES (%s)",
                            (filename,),
                        )
            except psycopg2.Error as exc:
                if "vector" in str(exc).lower():
                    log.error(
                        "pgvector extension is not available. "
                        "Enable it on Supabase: Database → Extensions → search 'vector' → enable. "
                        "On local Docker, use the pgvector/pgvector:pg15 image."
                    )
                    sys.exit(1)
                raise
            log.info("Applied %s", filename)
        log.info("All migrations applied successfully.")

        # ── Table summary ────────────────────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name, COUNT(column_name) AS column_count
                FROM information_schema.columns
                WHERE table_schema = 'public'
                GROUP BY table_name
                ORDER BY table_name
            """)
            rows = cur.fetchall()

        log.info("Tables in public schema:")
        for row in rows:
            log.info("  %-25s %d columns", row["table_name"], row["column_count"])

        # ── pgvector check ───────────────────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            ext = cur.fetchone()

        if ext:
            log.info("pgvector extension: INSTALLED")
        else:
            log.error(
                "pgvector extension is NOT installed. "
                "Enable it on Supabase: Database → Extensions → search 'vector' → enable. "
                "On local Docker, use the pgvector/pgvector:pg15 image."
            )
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
