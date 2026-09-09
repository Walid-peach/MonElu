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
import tempfile
import time
from datetime import date, timedelta

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql

try:
    from scripts._http import download_with_retry
except ImportError:  # running as a plain file: python scripts/run_ingestion_prod.py
    from _http import download_with_retry

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

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
SCRUTINS_ZIP_PATH = "/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"
DEPUTIES_ZIP_PATH = (
    "/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes"
    "/AMO10_deputes_actifs_mandats_actifs_organes.json.zip"
)


def _download_zips(tmp_dir: str) -> tuple[str, str]:
    """Download each AN ZIP once; the steps read them via --zip-path."""
    scrutins_path = os.path.join(tmp_dir, "Scrutins.json.zip")
    deputies_path = os.path.join(tmp_dir, "AMO10_deputes.json.zip")

    log.info("Downloading scrutins ZIP once for votes + positions…")
    with open(scrutins_path, "wb") as fh:
        fh.write(download_with_retry(f"{AN_BASE_URL}{SCRUTINS_ZIP_PATH}"))

    log.info("Downloading deputies/organes ZIP once for deputies + party fix…")
    with open(deputies_path, "wb") as fh:
        fh.write(download_with_retry(f"{AN_BASE_URL}{DEPUTIES_ZIP_PATH}", timeout=120))

    return scrutins_path, deputies_path


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


def run_step(
    label: str, script: str, extra_args: list[str] | None = None, critical: bool = True
) -> float | None:
    """Run a script file as a subprocess, streaming its output. Returns elapsed seconds.

    Non-critical steps (party/department enrichment, vote summaries) must not take
    down the whole pipeline: deputies/votes/positions have already committed by the
    time these run, and a crash here previously aborted main() before the `new_votes`
    GITHUB_OUTPUT was written, which silently skipped the downstream RAG rebuild and
    dbt run/test/snapshot workflow steps too (2026-07 incident: an unrelated organeRef
    parsing bug in the party step blocked mart refreshes for days even though votes
    and positions had ingested fine). A non-critical failure logs a `::error::`
    annotation, visible in the run summary, and returns None instead of raising.
    """
    script_path = os.path.join(PROJECT_ROOT, "scripts", script)
    cmd = [sys.executable, script_path] + (extra_args or [])
    log.info("━━━ Starting: %s ━━━", label)
    t0 = time.perf_counter()
    env = {**os.environ, "PYTHONPATH": PROJECT_ROOT}
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, env=env)
    elapsed = time.perf_counter() - t0
    if result.returncode != 0:
        message = f"{label} failed with exit code {result.returncode}"
        if critical:
            raise RuntimeError(message)
        print(f"::error::{message} (non-critical - pipeline continues)")
        log.error("━━━ Failed (non-critical): %s ━━━", label)
        return None
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

    soft_failures: list[str] = []

    def _fmt(elapsed: float | None) -> str:
        return f"{elapsed:5.1f}s" if elapsed is not None else " skip "

    try:
        votes_before = row_count(lock_conn, "votes")

        with tempfile.TemporaryDirectory() as tmp_dir:
            scrutins_zip, deputies_zip = _download_zips(tmp_dir)

            t_deputies = run_step("Deputies", "ingest_deputies.py", ["--zip-path", deputies_zip])
            t_votes = run_step(
                "Votes", "ingest_votes.py", ["--since", args.since, "--zip-path", scrutins_zip]
            )
            t_positions = run_step(
                "Positions",
                "ingest_positions.py",
                ["--since", args.since, "--zip-path", scrutins_zip],
            )
            t_party = run_step(
                "Fix party + department names",
                "update_party.py",
                ["--zip-path", deputies_zip],
                critical=False,
            )
            if t_party is None:
                soft_failures.append("Fix party + department names")

            # Non-critical: the agenda export is a separate feed (MON-210,
            # ADR-030) from the scrutins/deputies ZIPs above, so a failure here
            # must not block core votes/deputies/positions ingestion.
            #
            # Deliberately still non-critical now that the step can exit 1 on a
            # feed reshape (MON-249): a hard exit is not silent here — run_step
            # emits an ::error:: annotation, the step name lands in the
            # soft_failures GITHUB_OUTPUT, and ingest_prod.yml turns that into a
            # step-summary warning plus a notification email. Promoting agenda to
            # critical would let an upstream agenda-only change block the votes
            # and positions ingestion that ADR-030 explicitly separated it from.
            t_agenda = run_step(
                "Agenda", "ingest_agenda.py", ["--since", args.since], critical=False
            )
            if t_agenda is None:
                soft_failures.append("Agenda")

        n_deputies = row_count(lock_conn, "deputies")
        n_votes = row_count(lock_conn, "votes")
        n_positions = row_count(lock_conn, "vote_positions")

        new_votes = n_votes - votes_before
        log.info("New votes ingested this run: %d", new_votes)

        # Write new_votes as soon as it is known — a summaries failure below must
        # not lose this signal for downstream workflow steps.
        github_output = os.getenv("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write(f"new_votes={new_votes}\n")

        # Always run summaries: the `summary_plain IS NULL` query no-ops when there is
        # nothing to do, and this retries any failure from *this run's* --since window
        # without waiting for the next new vote. It is not the full retry backstop —
        # summarize_backfill.yml (07:00 UTC daily) is the one that sweeps every vote
        # with summary_plain IS NULL regardless of window, so a summary that fails here
        # still gets picked up there even if it falls outside `args.since`. Do not
        # remove summarize_backfill.yml as "redundant" with this step. Non-critical: a
        # Groq/OpenAI outage here must not block the dbt run/RAG rebuild that follows
        # this script.
        t_summaries = run_step(
            "Vote summaries",
            "generate_vote_summaries.py",
            ["--since", args.since],
            critical=False,
        )
        if t_summaries is None:
            soft_failures.append("Vote summaries")

        # soft_failures is only fully known once every non-critical step has run,
        # so it is written last, separately from new_votes above.
        if github_output:
            with open(github_output, "a") as f:
                f.write(f"soft_failures={','.join(soft_failures)}\n")

        total_elapsed = time.perf_counter() - total_start

        log.info("")
        log.info("╔══════════════════════════════════════╗")
        log.info("║         INGESTION COMPLETE           ║")
        log.info("╠══════════════════════════════════════╣")
        log.info("║  Deputies  : %6d   (%5.1fs)      ║", n_deputies, t_deputies)
        log.info("║  Votes     : %6d   (%5.1fs)      ║", n_votes, t_votes)
        log.info("║  Positions : %6d   (%5.1fs)      ║", n_positions, t_positions)
        log.info("║  Party fix :          (%s)      ║", _fmt(t_party))
        log.info("║  Agenda    :          (%s)      ║", _fmt(t_agenda))
        log.info("║  Summaries :          (%s)      ║", _fmt(t_summaries))
        log.info("╠══════════════════════════════════════╣")
        log.info("║  Total time: %.1fs                   ║", total_elapsed)
        log.info("╚══════════════════════════════════════╝")

        if soft_failures:
            print(
                f"::warning::Ingestion completed with non-critical failures: "
                f"{', '.join(soft_failures)}. Core data (deputies/votes/positions) is fine; "
                f"these steps should be re-run or fixed."
            )
    except Exception:
        log.error("Ingestion failed — see above for details.")
        raise
    finally:
        lock_conn.close()


if __name__ == "__main__":
    main()
