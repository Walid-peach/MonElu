"""
scripts/generate_agenda_summaries.py

Generate plain-French one-liners and theme classifications for upcoming agenda
items that don't yet have one (MON-211, ADR-030 §5). Mirrors
scripts/generate_vote_summaries.py, sharing its model, prompts, theme
vocabulary and retry/parse logic via scripts/_summaries.py.

Two things differ from the vote generator, both from ADR-030:

* **Stubs get no LLM call.** 16 % of ODJ points have an `objet` whose entire
  content is "Discussion" or "Questions au Gouvernement". Sending one word to
  an LLM would invent specifics on a civic-transparency site, so these keep
  `summary_plain IS NULL` and the frontend renders `point_type` instead
  (frontend/src/lib/agenda.ts:agendaHeadline).
* **Regeneration is driven by the ingest upsert, not by this script.**
  `ingest_agenda.py` nulls `summary_plain`/`theme` when an item's `objet_hash`
  changes, so a reworded item simply reappears in this script's
  `summary_plain IS NULL` sweep. Nothing here compares hashes.

Only items the API can actually surface are summarized - latest ingestion run,
not cancelled, not in the past - so the spend tracks what readers see.

Usage:
    python -m scripts.generate_agenda_summaries
    python -m scripts.generate_agenda_summaries --since 2026-01-01
    python -m scripts.generate_agenda_summaries --dry-run   # print without writing
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import date

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import connect_with_retry
    from scripts._summaries import (
        BATCH_SIZE,
        call_groq,
        detect_motion_type,
        is_procedural,
        parse_response,
    )
except ImportError:  # running as a plain file: python scripts/generate_agenda_summaries.py
    from _http import connect_with_retry
    from _summaries import (
        BATCH_SIZE,
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

# An objet at or below this length carries no summarizable content: the whole
# value is "Discussion" or "Questions au Gouvernement". Measured across the
# full export by the MON-208 spike (scripts/explore_agenda.py).
STUB_OBJET_MAX_LEN = 30

_CANCELLED_STATES = ("Annulé", "Supprimé")

# Mirrors api/routers/agenda.py's visibility filter: summarizing an item the
# API hides is spend with nothing to show for it.
CANDIDATE_SQL = """
    SELECT point_uid, objet, point_type
    FROM agenda_items
    WHERE summary_plain IS NULL
      AND objet IS NOT NULL
      AND last_seen_at = (SELECT MAX(last_seen_at) FROM agenda_items)
      AND reunion_etat NOT IN %s
      AND (point_etat IS NULL OR point_etat NOT IN %s)
      AND sitting_start >= %s
    ORDER BY sitting_start ASC, point_uid ASC
"""


def is_stub(objet: str | None, point_type: str | None = None) -> bool:
    """Is this objet too thin to summarize without inventing content?

    Three shapes, all of which ADR-030 §5 says must get no LLM call:
    an absent objet, one that merely repeats the point type, and one short
    enough that its whole value is a bare label.
    """
    text = (objet or "").strip()
    if not text:
        return True
    if point_type and text.casefold() == point_type.strip().casefold():
        return True
    return len(text) <= STUB_OBJET_MAX_LEN


def process_batch(client, batch: list[dict], dry_run: bool, conn, stats: dict) -> None:
    # Imported here, not at module scope, so the module stays importable (and
    # unit-testable) without rag/ on the path - the same shape the vote
    # generator uses.
    from rag.chain.prompts import SUMMARY_PROMPT, SUMMARY_PROMPT_PROCEDURAL

    updates = []
    for item in batch:
        point_uid = item["point_uid"]
        objet = item["objet"]

        if is_stub(objet, item.get("point_type")):
            # No call, no write: the row keeps summary_plain IS NULL by design.
            stats["stubs"] += 1
            continue

        procedural = is_procedural(objet)
        if procedural:
            system = SUMMARY_PROMPT_PROCEDURAL
            user_msg = f'Type de motion : {detect_motion_type(objet)}\nTitre : "{objet}"'
        else:
            system = SUMMARY_PROMPT
            user_msg = f'Titre : "{objet}"'

        raw = call_groq(client, system, user_msg)
        if raw is None:
            stats["errors"] += 1
            continue

        parsed = parse_response(raw)
        if parsed is None:
            log.warning("Could not parse response for %s: %r", point_uid, raw[:120])
            stats["errors"] += 1
            continue

        summary, theme = parsed
        if dry_run:
            proc_flag = " [PROCEDURAL]" if procedural else ""
            log.info("[DRY-RUN]%s %s | theme=%s | %s", proc_flag, point_uid, theme, summary[:80])
        else:
            updates.append((summary, theme, point_uid))
        stats["generated"] += 1

    if updates and not dry_run:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE agenda_items SET summary_plain = %s, theme = %s WHERE point_uid = %s",
                updates,
            )
        conn.commit()
        log.info("Committed %d summaries", len(updates))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate agenda item summaries via Groq")
    parser.add_argument(
        "--since",
        # The agenda is forward-looking: past sittings are history the page no
        # longer shows, so today is the useful default rather than a rolling
        # lookback like the vote generator's.
        default=date.today().isoformat(),
        help="Summarize items sitting on or after this date (YYYY-MM-DD). Default: today.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print summaries without writing to DB.",
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

    conn = connect_with_retry(database_url)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(CANDIDATE_SQL, (_CANCELLED_STATES, _CANCELLED_STATES, args.since))
        rows = [dict(r) for r in cur.fetchall()]

    log.info(
        "Found %d agenda items without summaries (sitting on or after %s)%s",
        len(rows),
        args.since,
        " — DRY RUN" if args.dry_run else "",
    )

    if not rows:
        log.info("Nothing to do.")
        conn.close()
        return

    stats = {"generated": 0, "errors": 0, "stubs": 0}
    total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        log.info("Batch %d/%d (%d items)…", batch_num, total_batches, len(batch))
        process_batch(client, batch, args.dry_run, conn, stats)
        if i + BATCH_SIZE < len(rows):
            time.sleep(2.0)  # ~15 req/min conservative → avoids 429 cascade

    conn.close()
    log.info(
        "Done — generated: %d, stubs skipped: %d, errors: %d (will retry on next run)",
        stats["generated"],
        stats["stubs"],
        stats["errors"],
    )


if __name__ == "__main__":
    main()
