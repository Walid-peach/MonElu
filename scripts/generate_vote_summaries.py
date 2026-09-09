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
import json
import logging
import os
import re
import time
from datetime import date, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BATCH_SIZE = 5
MODEL = "openai/gpt-oss-120b"
TEMPERATURE = 0.1
MAX_TOKENS = 150
# gpt-oss is a reasoning model and reasoning tokens count against MAX_TOKENS.
# At default effort a 150-token budget was fully consumed by reasoning and the
# summary came back truncated mid-sentence ("Le Parlement a"). "low" lands at
# ~70 tokens for a two-sentence summary, well inside the budget.
REASONING_EFFORT = "low"

VALID_THEMES = {
    "Économie & Budget",
    "Santé & Social",
    "Justice & Sécurité",
    "Énergie & Environnement",
    "Éducation & Culture",
    "Agriculture",
    "Transport & Logement",
    "Institutions",
    "International",
    "Autre",
}

PROCEDURAL_PATTERNS = re.compile(
    r"motion de rejet pr[ée]alable"
    r"|question pr[ée]alable"
    r"|motion de renvoi en commission"
    r"|motion r[ée]f[ée]rendaire"
    r"|motion de censure"
    r"|exception d.irrecevabilit[ée]",
    re.IGNORECASE,
)


def is_procedural(title: str) -> bool:
    return bool(PROCEDURAL_PATTERNS.search(title))


def _detect_motion_type(title: str) -> str:
    """Return a human-readable motion label for the procedural prompt."""
    lower = title.lower()
    if "motion de rejet" in lower:
        return "motion de rejet préalable"
    if "question préalable" in lower or "question prealable" in lower:
        return "question préalable"
    if "renvoi en commission" in lower:
        return "motion de renvoi en commission"
    if "motion référendaire" in lower or "motion referendaire" in lower:
        return "motion référendaire"
    if "motion de censure" in lower:
        return "motion de censure"
    if "exception d'irrecevabilité" in lower or "exception dirrecevabilite" in lower:
        return "exception d'irrecevabilité"
    return "motion procédurale"


def _call_groq(client, system: str, user: str, max_retries: int = 6) -> str | None:
    """Call Groq with exponential backoff on 429. SDK retries are disabled (max_retries=0
    on the client) so this is the sole retry controller."""
    for attempt in range(max_retries):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
                reasoning_effort=REASONING_EFFORT,
            )
            return resp.choices[0].message.content.strip()
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status == 429 and attempt < max_retries - 1:
                wait = min(2**attempt, 60)
                log.warning(
                    "Rate limited — retrying in %ds (attempt %d/%d)", wait, attempt + 1, max_retries
                )
                time.sleep(wait)
            else:
                log.warning("Groq error: %s", exc)
                return None
    return None


def _parse_response(raw: str) -> tuple[str, str] | None:
    """Parse JSON response from Groq. Returns (summary, theme) or None on failure."""
    try:
        # Extract JSON object even if surrounded by markdown fences
        match = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
        if not match:
            return None
        parsed = json.loads(match.group())
        summary = parsed.get("summary", "").strip()
        theme = parsed.get("theme", "").strip()
        if not summary or not theme:
            return None
        if theme not in VALID_THEMES:
            log.warning("Invalid theme %r — remapping to 'Autre'", theme)
            theme = "Autre"
        return summary, theme
    except (json.JSONDecodeError, AttributeError):
        return None


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
            motion_type = _detect_motion_type(title)
            system = SUMMARY_PROMPT_PROCEDURAL
            user_msg = (
                f'Type de motion : {motion_type}\nTitre : "{title}"\nRésultat du vote : {result}'
            )
        else:
            system = SUMMARY_PROMPT
            user_msg = f'Titre : "{title}"\nRésultat : {result}'

        raw = _call_groq(client, system, user_msg)
        if raw is None:
            stats["errors"] += 1
            continue

        parsed = _parse_response(raw)
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

    # max_retries=0: disable SDK-level retries so _call_groq is the sole backoff controller.
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
        conn.close()
        return

    stats = {"generated": 0, "errors": 0}
    total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        log.info("Batch %d/%d (%d votes)…", batch_num, total_batches, len(batch))
        process_batch(client, batch, args.dry_run, conn, stats)
        if i + BATCH_SIZE < len(rows):
            time.sleep(2.0)  # ~15 req/min conservative → avoids 429 cascade

    conn.close()
    log.info(
        "Done — generated: %d, errors: %d (will retry on next run)",
        stats["generated"],
        stats["errors"],
    )


if __name__ == "__main__":
    main()
