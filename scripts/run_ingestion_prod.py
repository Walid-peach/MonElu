"""
run_ingestion_prod.py
Runs all three ingestion steps in sequence: deputies → votes → positions.
Designed to be triggered as a one-off Railway job or run locally.

Usage:
    python scripts/run_ingestion_prod.py                      # default: since 2025-01-01
    python scripts/run_ingestion_prod.py --since 2024-07-07   # full legislature 17
    python scripts/run_ingestion_prod.py --since 2026-01-01   # current year only
"""

import argparse
import logging
import os
import subprocess
import sys
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# Resolve the project root (one level up from this script)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def row_count(conn, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
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
        default="2025-07-01",
        help="Only ingest votes on or after this date (YYYY-MM-DD). Default: 2025-07-01",
    )
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    log.info("Ingestion window: since %s", args.since)
    total_start = time.perf_counter()

    t_deputies = run_step("Deputies", "ingest_deputies.py")
    t_votes = run_step("Votes", "ingest_votes.py", ["--since", args.since])
    t_positions = run_step("Positions", "ingest_positions.py")

    total_elapsed = time.perf_counter() - total_start

    conn = psycopg2.connect(database_url)
    n_deputies = row_count(conn, "deputies")
    n_votes = row_count(conn, "votes")
    n_positions = row_count(conn, "vote_positions")
    conn.close()

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


if __name__ == "__main__":
    main()
