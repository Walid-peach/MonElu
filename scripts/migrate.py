"""
migrate.py
Applies data/migrations/001_init.sql against DATABASE_URL.
Safe to run multiple times — all statements use CREATE TABLE/INDEX IF NOT EXISTS.

Usage:
    python scripts/migrate.py
"""

import logging
import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATION_FILE = os.path.join(PROJECT_ROOT, "data", "migrations", "001_init.sql")


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    with open(MIGRATION_FILE) as f:
        sql = f.read()

    log.info("Connecting to database…")
    conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        log.info("Migration applied successfully.")

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
            log.warning(
                "pgvector extension is NOT installed. "
                "The document_chunks table and embedding index were created but will not be "
                "functional until pgvector is enabled. On Supabase: "
                "Database → Extensions → search 'vector' → enable."
            )

    finally:
        conn.close()


if __name__ == "__main__":
    main()
