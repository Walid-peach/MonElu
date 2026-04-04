"""
migrate.py
Applies data/migrations/001_init.sql against DATABASE_URL.
Safe to run multiple times — all statements use CREATE TABLE IF NOT EXISTS.

Usage:
    python scripts/migrate.py
"""

import logging
import os

import psycopg2
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
    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        log.info("Migration applied successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
