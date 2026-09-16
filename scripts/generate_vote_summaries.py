"""
scripts/generate_vote_summaries.py

Generate plain-language summaries and theme classifications for votes that
don't yet have one. Runs against the production Supabase DB.

Usage:
    python -m scripts.generate_vote_summaries
    python -m scripts.generate_vote_summaries --since 2025-07-01
    python -m scripts.generate_vote_summaries --dry-run   # print without writing
"""

import argparse
import logging
import os
import sys
import time
from datetime import date, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._cache_scope import write_changed_ids
    from scripts._summaries import (
        BATCH_SIZE,
        MODEL,
        call_groq,
        detect_motion_type,
        is_procedural,
        parse_response,
    )
except ImportError:  # running as a plain file: python scripts/generate_vote_summaries.py
    from _cache_scope import write_changed_ids
    from _summaries import (
        BATCH_SIZE,
        MODEL,
        call_groq,
        detect_motion_type,
        is_procedural,
        parse_response,
    )

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def process_batch(
    client,
    batch: list[dict],
    dry_run: bool,
    conn,
    stats: dict,
) -> None:
    from rag.chain.prompts import SUMMARY_PROMPT, SUMMARY_PROMPT_PROCEDURAL

    updates = []
    for vote in batch:
        vote_id = vote["vote_id"]
        title = vote["vote_title"]
        result = vote["result"] or "inconnu"

        if is_procedural(title):
            motion_type = detect_motion_type(title)
            system = SUMMARY_PROMPT_PROCEDURAL
            user_msg = (
                f'Type de motion : {motion_type}\nTitre : "{title}"\nRésultat du vote : {result}'
            )
        else:
            system = SUMMARY_PROMPT
            user_msg = f'Titre : "{title}"\nRésultat : {result}'

        raw = call_groq(client, system, user_msg)
        if raw is None:
            stats["errors"] += 1
            continue

        parsed = parse_response(raw)
        if parsed is None:
            log.warning("Could not parse response for %s: %r", vote_id, raw[:120])
            stats["errors"] += 1
            continue

        summary, theme = parsed
        if dry_run:
            proc_flag = " [PROCEDURAL]" if is_procedural(title) else ""
            log.info("[DRY-RUN]%s %s | theme=%s | %s", proc_flag, vote_id, theme, summary[:80])
        else:
            updates.append((summary, theme, vote_id))
        stats["generated"] += 1

    if updates and not dry_run:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE votes SET summary_plain = %s, theme = %s WHERE vote_id = %s",
                updates,
            )
        conn.commit()
        log.info("Committed %d summaries", len(updates))
        # Which scrutins to purge from the frontend cache (GH #353). Recorded
        # here rather than rediscovered with a query because this UPDATE
        # deliberately leaves `ingested_at` alone: that column means "the AN
        # record changed", which is what the dbt staging layer and the change
        # detection in run_ingestion_prod.py both read it as. A summary is our
        # own text, not a new record from upstream.
        stats.setdefault("summarized_vote_ids", []).extend(vote_id for _, _, vote_id in updates)


def check_summary_yield(stats: dict) -> None:
    """Exit 1 when the run attempted work and none of it succeeded (GH #384).

    ``call_groq`` and ``parse_response`` swallow every per-vote failure into a
    WARNING so one bad vote cannot abort a backfill of a thousand. Correct on
    its own, but it makes a run where *every single call* failed
    indistinguishable from a run with nothing to do: six consecutive green
    daily runs against an expired API key, with 1 243 votes sitting unsummarized,
    are what this guard turns red.

    Only the unambiguous shape exits: work was attempted and nothing was
    generated. A partial failure stays green on purpose, unlike the
    ``SKIP_RATE_THRESHOLD`` ratio the four ingestion parsers apply (MON-220,
    MON-249). Those parse a fixed upstream export where a raised skip rate means
    the format moved under us; this job is idempotent and self-healing - the
    next run re-selects the same ``summary_plain IS NULL`` rows - and its daily
    backlog is usually a handful of votes, where a single transient 429 is
    already past 5% and would redden a run that fixes itself the next morning.
    The error count is still reported by the caller either way.
    """
    if stats["errors"] > 0 and stats["generated"] == 0:
        log.error(
            "All %d summary attempts failed and nothing was generated. "
            "Check the Groq API key and the configured model (%s).",
            stats["errors"],
            MODEL,
        )
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate vote summaries via Groq")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Process votes on or after this date (YYYY-MM-DD). Default: rolling 12 months.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print summaries without writing to DB.",
    )
    parser.add_argument(
        "--changed-ids-out",
        default=os.getenv("MONELU_CHANGED_IDS_OUT"),
        help=(
            "Write the vote_ids that got a summary, one per line, for the caller's "
            "cache-invalidation scope (GH #353). Written even when empty, so an "
            "absent file means the run died rather than generated nothing."
        ),
    )
    args = parser.parse_args()

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise EnvironmentError("GROQ_API_KEY is not set.")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    import warnings

    warnings.filterwarnings("ignore")
    from groq import Groq

    # max_retries=0: disable SDK-level retries so call_groq is the sole backoff controller.
    client = Groq(api_key=groq_api_key, max_retries=0)

    conn = psycopg2.connect(database_url)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT vote_id, vote_title, result
            FROM votes
            WHERE summary_plain IS NULL
              AND voted_at >= %s
            ORDER BY voted_at DESC
            """,
            (args.since,),
        )
        rows = [dict(r) for r in cur.fetchall()]

    log.info(
        "Found %d votes without summaries (since %s)%s",
        len(rows),
        args.since,
        " — DRY RUN" if args.dry_run else "",
    )

    if not rows:
        log.info("Nothing to do.")
        write_changed_ids(args.changed_ids_out, [])
        conn.close()
        return

    stats: dict = {"generated": 0, "errors": 0, "summarized_vote_ids": []}
    total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        log.info("Batch %d/%d (%d votes)…", batch_num, total_batches, len(batch))
        process_batch(client, batch, args.dry_run, conn, stats)
        if i + BATCH_SIZE < len(rows):
            time.sleep(2.0)  # ~15 req/min conservative → avoids 429 cascade

    conn.close()
    write_changed_ids(args.changed_ids_out, stats["summarized_vote_ids"])
    # The "Done —" line is what summarize_backfill.yml greps for its generated/
    # errors step outputs, so it must be logged before the guard can exit.
    log.info(
        "Done — generated: %d, errors: %d (will retry on next run)",
        stats["generated"],
        stats["errors"],
    )
    check_summary_yield(stats)


if __name__ == "__main__":
    main()
