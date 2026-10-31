"""
scripts/generate_vote_summaries.py

Generate plain-language summaries and theme classifications for votes that
don't yet have one. Runs against the production Supabase DB.

Usage:
    python -m scripts.generate_vote_summaries
    python -m scripts.generate_vote_summaries --since 2025-07-01
    python -m scripts.generate_vote_summaries --dry-run   # print without writing
    python -m scripts.generate_vote_summaries --limit 100
    python -m scripts.generate_vote_summaries --backlog   # print the pending count
    python -m scripts.generate_vote_summaries --clear-legacy-amendments
    python -m scripts.generate_vote_summaries --clear-legacy-articles
"""

import argparse
import hashlib
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
        DECLINED_PATTERN,
        MAX_TOKENS,
        MODEL,
        OFFICIAL_TEXT_MAX_TOKENS,
        amendment_user_message,
        article_user_message,
        call_groq,
        detect_motion_type,
        is_procedural,
        parse_response,
        rejection_reason,
    )
except ImportError:  # running as a plain file: python scripts/generate_vote_summaries.py
    from _cache_scope import write_changed_ids
    from _summaries import (
        BATCH_SIZE,
        DECLINED_PATTERN,
        MAX_TOKENS,
        MODEL,
        OFFICIAL_TEXT_MAX_TOKENS,
        amendment_user_message,
        article_user_message,
        call_groq,
        detect_motion_type,
        is_procedural,
        parse_response,
        rejection_reason,
    )

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BASIS_OFFICIAL_TEXT = "official_text"
BASIS_REJECTED = "rejected"
# Different texts sharing one sentence on this scale means the prompt or the
# source has broken, not that a few amendments happen to read alike.
MIN_DUPLICATES_TO_FAIL = 5
MAX_DUPLICATE_RATE = 0.2

# An amendment or article vote is only ever summarized from its official text
# (#630, ADR-043; #642, ADR-044): with no source row it makes no LLM call and
# keeps its title.
SQL_PENDING = """
FROM votes v
LEFT JOIN vote_amendments a ON a.vote_id = v.vote_id
LEFT JOIN vote_articles art ON art.vote_id = v.vote_id
WHERE v.voted_at >= %(since)s
  AND (
    (v.scrutin_kind = 'amendement' AND a.vote_id IS NOT NULL AND v.summary_basis IS NULL)
    OR (v.scrutin_kind = 'article' AND art.vote_id IS NOT NULL AND v.summary_basis IS NULL)
    OR (v.scrutin_kind IS DISTINCT FROM 'amendement'
        AND v.scrutin_kind IS DISTINCT FROM 'article' AND v.summary_plain IS NULL)
  )
"""

# Articles go before the amendment backlog: there are few of them and each one
# carries more of a law than an amendment does.
SQL_PENDING_ROWS = f"""
SELECT v.vote_id, v.vote_title, v.result, v.scrutin_kind,
       a.is_sub_amendment, a.dispositif, a.expose_sommaire,
       art.article_label, art.article_text
{SQL_PENDING}
ORDER BY v.summary_plain IS NULL DESC, v.scrutin_kind = 'article' DESC NULLS LAST, v.voted_at DESC
"""

SQL_STORED_SOURCED_SUMMARIES = """
SELECT v.summary_plain, COALESCE(a.dispositif, art.article_text) AS source
FROM votes v
LEFT JOIN vote_amendments a ON a.vote_id = v.vote_id
LEFT JOIN vote_articles art ON art.vote_id = v.vote_id
WHERE v.summary_basis = 'official_text'
"""

# Summaries written from a title alone. Clearing them is safe to repeat: the
# title stays on the page, and the sweep rewrites those with official text.
SQL_CLEAR_LEGACY = """
UPDATE votes SET summary_plain = NULL
WHERE scrutin_kind = %s AND summary_basis IS NULL AND summary_plain IS NOT NULL
"""


def source_key(dispositif: str) -> str:
    return hashlib.sha256(dispositif.encode()).hexdigest()


def duplicate_of_other_source(summary: str, source: str, seen: dict[str, str]) -> bool:
    """True when another text already has this sentence; identical amendments may share it."""
    return seen.setdefault(summary, source) != source


def process_batch(
    client,
    batch: list[dict],
    dry_run: bool,
    conn,
    stats: dict,
    changed_ids_out: str | None = None,
) -> None:
    from rag.chain.prompts import (
        SUMMARY_PROMPT,
        SUMMARY_PROMPT_AMENDMENT,
        SUMMARY_PROMPT_ARTICLE,
        SUMMARY_PROMPT_PROCEDURAL,
    )

    updates = []
    for vote in batch:
        vote_id = vote["vote_id"]
        title = vote["vote_title"]
        result = vote["result"] or "inconnu"

        is_amendment = vote.get("scrutin_kind") == "amendement"
        is_article = vote.get("scrutin_kind") == "article"
        from_official_text = is_amendment or is_article
        if is_amendment:
            system = SUMMARY_PROMPT_AMENDMENT
            user_msg = amendment_user_message(vote)
        elif is_article:
            system = SUMMARY_PROMPT_ARTICLE
            user_msg = article_user_message(vote)
        elif is_procedural(title):
            motion_type = detect_motion_type(title)
            system = SUMMARY_PROMPT_PROCEDURAL
            user_msg = (
                f'Type de motion : {motion_type}\nTitre : "{title}"\nRésultat du vote : {result}'
            )
        else:
            system = SUMMARY_PROMPT
            user_msg = f'Titre : "{title}"\nRésultat : {result}'

        max_tokens = OFFICIAL_TEXT_MAX_TOKENS if from_official_text else MAX_TOKENS
        raw = call_groq(client, system, user_msg, max_tokens=max_tokens)
        if raw is None:
            stats["errors"] += 1
            continue

        parsed = parse_response(raw)
        if parsed is None and from_official_text and DECLINED_PATTERN.search(raw):
            parsed = ("", None)
        if parsed is None:
            log.warning("Could not parse response for %s: %r", vote_id, raw[:120])
            stats["errors"] += 1
            continue

        summary, theme = parsed
        basis = None
        if from_official_text:
            reason = rejection_reason(summary, title)
            source = source_key(vote["dispositif"] if is_amendment else vote["article_text"])
            seen = stats.setdefault("seen_summaries", {})
            if reason is None and duplicate_of_other_source(summary, source, seen):
                reason = "duplicate"
            if reason:
                log.warning("Rejected %s (%s): %s", vote_id, reason, summary[:120])
                rejected = stats.setdefault("rejected", {})
                rejected[reason] = rejected.get(reason, 0) + 1
                summary, basis = None, BASIS_REJECTED
            else:
                basis = BASIS_OFFICIAL_TEXT

        if dry_run:
            proc_flag = " [PROCEDURAL]" if is_procedural(title) else ""
            log.info("[DRY-RUN]%s %s | theme=%s | %s", proc_flag, vote_id, theme, summary)
        else:
            updates.append((summary, theme, basis, vote_id))
        if basis != BASIS_REJECTED:
            stats["generated"] += 1

    if updates and not dry_run:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE votes SET summary_plain = %s, theme = %s, summary_basis = %s "
                "WHERE vote_id = %s",
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
        stats.setdefault("summarized_vote_ids", []).extend(update[-1] for update in updates)
        # Rewritten after every committed batch, not once at the end: a run that
        # commits 40 summaries and then dies (a Groq 429 cascade, a job timeout)
        # must not leave those 40 vote pages stale with nothing reporting it.
        write_changed_ids(changed_ids_out, stats["summarized_vote_ids"])


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


def check_duplicate_rate(stats: dict) -> None:
    """Exit 1 when many votes drew one sentence for different texts (#630)."""
    duplicates = stats.get("rejected", {}).get("duplicate", 0)
    attempted = stats["generated"] + sum(stats.get("rejected", {}).values())
    if duplicates >= MIN_DUPLICATES_TO_FAIL and duplicates / attempted > MAX_DUPLICATE_RATE:
        log.error("%d of %d summaries duplicated another text.", duplicates, attempted)
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
        "--limit",
        type=int,
        help="Stop after this many votes, so a long sweep stays inside Groq's daily quota.",
    )
    parser.add_argument(
        "--backlog",
        action="store_true",
        help="Print how many votes are pending, then exit. Needs no Groq key.",
    )
    parser.add_argument(
        "--clear-legacy-amendments",
        action="store_true",
        help="Clear amendment summaries written from a title alone, then exit (#630).",
    )
    parser.add_argument(
        "--clear-legacy-articles",
        action="store_true",
        help="Clear article summaries written from a title alone, then exit (#642).",
    )
    parser.add_argument(
        "--changed-ids-out",
        default=os.getenv("MONELU_CHANGED_IDS_OUT"),
        help=(
            "Write the vote_ids that got a summary, one per line, for the caller's "
            "cache-invalidation scope (GH #353). Rewritten after every committed "
            "batch, so a crash mid-sweep still reports what was already written; "
            "an absent file means the run died before committing anything, which "
            "run_ingestion_prod.py turns into a full purge."
        ),
    )
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("DATABASE_URL is not set.")

    if args.backlog or args.clear_legacy_amendments or args.clear_legacy_articles:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            if args.clear_legacy_amendments:
                cur.execute(SQL_CLEAR_LEGACY, ("amendement",))
                log.info("Cleared %d legacy amendment summaries", cur.rowcount)
            elif args.clear_legacy_articles:
                cur.execute(SQL_CLEAR_LEGACY, ("article",))
                log.info("Cleared %d legacy article summaries", cur.rowcount)
            else:
                cur.execute(f"SELECT COUNT(*) {SQL_PENDING}", {"since": args.since})
                print(cur.fetchone()[0])
        conn.commit()
        conn.close()
        return

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise EnvironmentError("GROQ_API_KEY is not set.")

    import warnings

    warnings.filterwarnings("ignore")
    from groq import Groq

    # max_retries=0: disable SDK-level retries so call_groq is the sole backoff controller.
    client = Groq(api_key=groq_api_key, max_retries=0)

    conn = psycopg2.connect(database_url)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SQL_PENDING_ROWS, {"since": args.since})
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(SQL_STORED_SOURCED_SUMMARIES)
        seen = {r["summary_plain"]: source_key(r["source"]) for r in cur.fetchall()}
    if args.limit:
        rows = rows[: args.limit]

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

    stats: dict = {
        "generated": 0,
        "errors": 0,
        "summarized_vote_ids": [],
        "seen_summaries": seen,
        "rejected": {},
    }
    total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        log.info("Batch %d/%d (%d votes)…", batch_num, total_batches, len(batch))
        process_batch(client, batch, args.dry_run, conn, stats, args.changed_ids_out)
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
    if stats["rejected"]:
        log.info("Rejected by reason: %s", stats["rejected"])
    check_summary_yield(stats)
    check_duplicate_rate(stats)


if __name__ == "__main__":
    main()
