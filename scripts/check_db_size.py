"""
check_db_size.py
Diagnostic script — prints table sizes, row counts, total DB size,
and whether pgvector is installed.

Usage:
    python scripts/check_db_size.py
"""

import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

TABLES = ["deputies", "votes", "vote_positions", "document_chunks"]


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with conn.cursor() as cur:
            # ── Per-table sizes ───────────────────────────────────────────────
            cur.execute("""
                SELECT
                    relname                                          AS table_name,
                    n_live_tup                                       AS row_count,
                    pg_size_pretty(pg_total_relation_size(relid))    AS total_size
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(relid) DESC
            """)
            rows = cur.fetchall()

        print("\nTable sizes:")
        for row in rows:
            print(f"  {row['table_name']:<25} {row['row_count']:>8,} rows   {row['total_size']}")

        with conn.cursor() as cur:
            # ── Total DB size ─────────────────────────────────────────────────
            cur.execute("SELECT pg_size_pretty(pg_database_size(current_database())) AS total")
            total = cur.fetchone()["total"]

        print(f"\nTotal DB size: {total}")

        with conn.cursor() as cur:
            # ── pgvector check ────────────────────────────────────────────────
            cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            ext = cur.fetchone()

        print(f"pgvector installed: {'YES' if ext else 'NO'}")
        print()

    finally:
        conn.close()


if __name__ == "__main__":
    main()
