"""
scripts/ingest_bills.py
Attach the official text of a bill to the whole-text scrutins that decided it
(#645, ADR-046), so a vote summary says what the bill's articles do rather than
what a model guesses from its title.

The bill comes from the scrutin title and the document list in the dossiers
export, as for article votes (ADR-044). A vote with no certain match gets no row
and therefore no generated summary.

Usage:
    python scripts/ingest_bills.py
    python scripts/ingest_bills.py --since 2025-07-01
    python scripts/ingest_bills.py --zip-path /tmp/Dossiers_Legislatifs.json.zip
"""

import argparse
import logging
import os
import re
import sys
from datetime import date, timedelta

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import connect_with_retry
    from scripts._summaries import queue_sourced_votes
    from scripts.ingest_articles import (
        MIN_ARTICLE_CHARS,
        MIN_VOTES_FOR_YIELD,
        _normalize,
        load_texts,
        page_loader,
    )
except ImportError:  # running as a plain file: python scripts/ingest_bills.py
    from _http import connect_with_retry
    from _summaries import queue_sourced_votes
    from ingest_articles import (
        MIN_ARTICLE_CHARS,
        MIN_VOTES_FOR_YIELD,
        _normalize,
        load_texts,
        page_loader,
    )

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# Shared out across the articles, so a long bill is not read from its first
# articles alone.
MAX_BILL_CHARS = 6000

# "l'ensemble du projet de loi X (première lecture)." Some whole-text votes carry
# no "l'ensemble", and "la proposition du Gouvernement de prolonger la séance" is
# not a bill.
TITLE_RE = re.compile(
    r"^(?:l.ensemble\s+(?:de la|du|de l.)\s*|l[ae]\s+)"
    r"(?P<bill>(?:proposition|projet)\s+de\s.+?)\s*(?:\([^()]*\)\s*)*\.?$",
    re.IGNORECASE,
)

SQL_PENDING_VOTES = """
SELECT v.vote_id, v.vote_title, v.voted_at::date AS voted_on,
       b.vote_id IS NOT NULL AS has_text
FROM votes v
LEFT JOIN vote_bills b ON b.vote_id = v.vote_id
WHERE v.scrutin_kind IN ('ensemble', 'autre') AND v.voted_at >= %s
"""

SQL_UPSERT = """
INSERT INTO vote_bills (vote_id, text_uid, bill_text)
VALUES (%(vote_id)s, %(text_uid)s, %(bill_text)s)
ON CONFLICT (vote_id) DO UPDATE SET
    text_uid = EXCLUDED.text_uid,
    bill_text = EXCLUDED.bill_text,
    ingested_at = NOW(),
    changed_at = CASE
        WHEN vote_bills.bill_text IS DISTINCT FROM EXCLUDED.bill_text
        THEN NOW() ELSE vote_bills.changed_at
    END
"""


def parse_title(title: str) -> str | None:
    """The normalized bill a whole-text scrutin names, None for any other vote."""
    match = TITLE_RE.match(title.replace("’", "'"))
    return _normalize(match["bill"]) if match else None


def build_bill_text(articles: dict[str, dict]) -> str | None:
    """Every article that still has content, None when none does."""
    bodies = [(a["label"], " ".join(a["body"])) for a in articles.values()]
    kept = [(label, body) for label, body in bodies if len(body) >= MIN_ARTICLE_CHARS]
    if not kept:
        return None
    share = MAX_BILL_CHARS // len(kept)
    return "\n".join(f"{label} : {body[:share]}" for label, body in kept)


def find_bill(bill: str, voted_on: date, index: dict, load_page) -> tuple[str, str] | None:
    """(text uid, text) of the bill as last examined before the vote.

    Only the newest text counts: an older reading is not what was voted.
    """
    for text in index.get(bill, []):
        if date.fromisoformat(text["published_on"]) <= voted_on:
            built = build_bill_text(load_page(text["uid"]))
            return (text["uid"], built) if built else None
    return None


def check_bill_yield(texts: int, with_text: int, window_votes: int) -> None:
    """Exit 1 on an upstream shape change (the MON-220 rule every parser follows)."""
    if texts == 0:
        log.error("Dossiers export held no examined text - its layout has changed.")
        sys.exit(1)
    if window_votes >= MIN_VOTES_FOR_YIELD and with_text == 0:
        log.error("None of %d whole-text votes has official text.", window_votes)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Attach official bill text to votes")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Match whole-text votes on or after this date (YYYY-MM-DD).",
    )
    parser.add_argument("--zip-path", help="Use a local export instead of downloading it.")
    args = parser.parse_args()

    conn = connect_with_retry(os.environ["DATABASE_URL"])
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SQL_PENDING_VOTES, (args.since,))
        votes = [dict(row) for row in cur.fetchall()]
    window = [vote for vote in votes if parse_title(vote["vote_title"])]
    pending = [vote for vote in window if not vote["has_text"]]
    log.info("%d bill votes since %s, %d without text", len(window), args.since, len(pending))
    if not pending:
        conn.close()
        return

    index = load_texts(args.zip_path)
    load_page = page_loader()

    rows = []
    for vote in pending:
        bill = parse_title(vote["vote_title"])
        found = find_bill(bill, vote["voted_on"], index, load_page)
        if found:
            text_uid, bill_text = found
            rows.append({"vote_id": vote["vote_id"], "text_uid": text_uid, "bill_text": bill_text})

    check_bill_yield(len(index), len(window) - len(pending) + len(rows), len(window))
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, SQL_UPSERT, rows, page_size=100)
        # A source is what a summary waits for (#681): no_source -> queued.
        queued = queue_sourced_votes(cur, "vote_bills")
    conn.commit()
    conn.close()
    log.info("Queued %d votes for a summary", queued)
    log.info("Done - matched %d of %d pending votes", len(rows), len(pending))


if __name__ == "__main__":
    main()
