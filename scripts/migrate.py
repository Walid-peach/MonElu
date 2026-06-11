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
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(PROJECT_ROOT, "data", "migrations")


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
