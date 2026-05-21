"""
run_ingestion_prod.py
Runs all three ingestion steps in sequence: deputies → votes → positions.
Designed to be triggered as a one-off Railway job or run locally.

Usage:
    python scripts/run_ingestion_prod.py                      # default: rolling 12 months
    python scripts/run_ingestion_prod.py --since 2024-07-07   # full legislature 17
    python scripts/run_ingestion_prod.py --since 2026-01-01   # current year only
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from datetime import date, timedelta

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# Resolve the project root (one level up from this script)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Arbitrary app-specific key — must be unique across all pg_advisory_lock callers in this DB.
_INGESTION_LOCK_KEY = 7_391_204

_ALLOWED_TABLES = {"deputies", "votes", "vote_positions", "document_chunks"}


def _try_acquire_lock(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", (_INGESTION_LOCK_KEY,))
        return cur.fetchone()[0]


def row_count(conn, table: str) -> int:
    if table not in _ALLOWED_TABLES:
        raise ValueError(f"Unknown table: {table!r}")
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
        return cur.fetchone()[0]


def run_step(label: str, script: str, extra_args: list[str] | None = None) -> float:
    """Run a script file as a subprocess, streaming its output. Returns elapsed seconds."""
    script_path = os.path.join(PROJECT_ROOT, "scripts", script)
    cmd = [sys.executable, script_path] + (extra_args or [])
    log.info("━━━ Starting: %s ━━━", label)
    t0 = time.perf_counter()
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, env={**os.environ})
    elapsed = time.perf_counter() - t0
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed with exit code {result.returncode}")
    log.info("━━━ Done: %s (%.1fs) ━━━", label, elapsed)
    return elapsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Run full MonÉlu ingestion pipeline")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Only ingest votes on or after this date (YYYY-MM-DD). Default: rolling 12 months.",
    )
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    log.info("Ingestion window: since %s", args.since)

    # Hold this connection open for the full pipeline — advisory lock is session-scoped
    # and auto-releases when the connection closes.
    lock_conn = psycopg2.connect(database_url)
    if not _try_acquire_lock(lock_conn):
        log.warning("Another ingestion job is already running — exiting to avoid conflicts.")
        lock_conn.close()
        sys.exit(0)

    log.info("Advisory lock acquired (key=%d).", _INGESTION_LOCK_KEY)
    total_start = time.perf_counter()

    try:
        votes_before = row_count(lock_conn, "votes")

        t_deputies = run_step("Deputies", "ingest_deputies.py")
        t_votes = run_step("Votes", "ingest_votes.py", ["--since", args.since])
        t_positions = run_step("Positions", "ingest_positions.py", ["--since", args.since])

        total_elapsed = time.perf_counter() - total_start

        n_deputies = row_count(lock_conn, "deputies")
        n_votes = row_count(lock_conn, "votes")
        n_positions = row_count(lock_conn, "vote_positions")

        new_votes = n_votes - votes_before
        log.info("New votes ingested this run: %d", new_votes)

        github_output = os.getenv("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write(f"new_votes={new_votes}\n")

        log.info("")
        log.info("╔══════════════════════════════════════╗")
        log.info("║         INGESTION COMPLETE           ║")
        log.info("╠══════════════════════════════════════╣")
        log.info("║  Deputies  : %6d   (%5.1fs)      ║", n_deputies, t_deputies)
        log.info("║  Votes     : %6d   (%5.1fs)      ║", n_votes, t_votes)
        log.info("║  Positions : %6d   (%5.1fs)      ║", n_positions, t_positions)
        log.info("╠══════════════════════════════════════╣")
        log.info("║  Total time: %.1fs                   ║", total_elapsed)
        log.info("╚══════════════════════════════════════╝")
    except Exception:
        log.error("Ingestion failed — see above for details.")
        raise
    finally:
        lock_conn.close()


if __name__ == "__main__":
    main()
