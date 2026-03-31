"""
ingest_votes.py
Fetches votes (scrutins) from the last 90 days from the Assemblée Nationale
Open Data API and upserts them into the votes table.

Usage:
    python scripts/ingest_votes.py
    python scripts/ingest_votes.py --days 180
"""

import argparse
import logging
import os
import time
from datetime import datetime, timedelta, timezone

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_API_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

MAX_RETRIES = 5
BACKOFF_BASE = 2  # seconds


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def get_with_retry(url: str, params: dict | None = None) -> dict:
    """GET with exponential backoff on 429 / 5xx."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                wait = BACKOFF_BASE ** attempt
                log.warning("Rate-limited (429). Retrying in %ss…", wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = BACKOFF_BASE ** attempt
                log.warning("Server error %s. Retrying in %ss…", resp.status_code, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            wait = BACKOFF_BASE ** attempt
            log.warning("Request failed (%s). Retrying in %ss…", exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to GET {url} after {MAX_RETRIES} attempts")


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

def fetch_votes_since(days: int) -> list[dict]:
    """Paginate /api/v2/scrutins and return all vote items within the window."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    url = f"{AN_API_BASE_URL}/api/v2/scrutins"
    page = 1
    all_items: list[dict] = []

    while True:
        log.info("Fetching votes page %d (cutoff: %s)…", page, cutoff)
        data = get_with_retry(url, params={"page": page, "limit": 100, "dateMin": cutoff})

        items = (
            data.get("items")
            or data.get("scrutins", {}).get("scrutin")
            or data.get("data")
            or []
        )
        if isinstance(items, dict):
            items = [items]

        if not items:
            break

        # Stop early if results are ordered newest-first and we've passed the cutoff
        oldest_on_page = None
        for item in items:
            date_raw = item.get("dateScrutin") or item.get("date") or ""
            if date_raw:
                oldest_on_page = date_raw[:10]

        all_items.extend(items)

        if oldest_on_page and oldest_on_page < cutoff:
            log.info("Reached cutoff date — stopping pagination.")
            break

        total = data.get("total") or data.get("totalItems") or 0
        if total and len(all_items) >= total:
            break
        if len(items) < 100:
            break

        page += 1

    log.info("Total vote records fetched: %d", len(all_items))
    return all_items


# ---------------------------------------------------------------------------
# Transformation
# ---------------------------------------------------------------------------

def parse_vote(item: dict) -> dict | None:
    """Normalise a raw AN scrutin object into the votes table shape."""
    try:
        uid = item.get("uid", {}).get("#text") or item.get("uid") or ""
        if not uid:
            return None

        date_raw = item.get("dateScrutin") or item.get("date") or ""
        voted_at = date_raw[:10] if date_raw else None

        title_block = item.get("titre") or item.get("objet", {}).get("libelle") or ""
        if isinstance(title_block, dict):
            vote_title = title_block.get("#text") or title_block.get("libelle") or ""
        else:
            vote_title = str(title_block)

        vote_type = item.get("typeVote", {}).get("codeTypeVote") or item.get("typeVote") or None

        sort_block = item.get("sort", {})
        result = sort_block.get("code") or sort_block.get("libelle") if isinstance(sort_block, dict) else str(sort_block)

        syn = item.get("syntheseVote", {}) or {}
        votes_for = _to_int(syn.get("nombrePour"))
        votes_against = _to_int(syn.get("nombreContre"))
        abstentions = _to_int(syn.get("nombreAbstentions"))
        total_voters = _to_int(syn.get("nombreVotants"))

        dossier_ref = item.get("dossierRef") or item.get("refDossier") or None
        if isinstance(dossier_ref, dict):
            dossier_ref = dossier_ref.get("#text") or dossier_ref.get("ref")

        return {
            "vote_id": uid,
            "voted_at": voted_at,
            "vote_title": vote_title.strip(),
            "vote_type": str(vote_type) if vote_type else None,
            "result": str(result) if result else None,
            "votes_for": votes_for,
            "votes_against": votes_against,
            "abstentions": abstentions,
            "total_voters": total_voters,
            "dossier_id": str(dossier_ref) if dossier_ref else None,
        }
    except Exception as exc:
        log.debug("Could not parse vote item: %s — %s", item, exc)
        return None


def _to_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Database upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO votes (
    vote_id, voted_at, vote_title, vote_type, result,
    votes_for, votes_against, abstentions, total_voters,
    dossier_id, ingested_at
) VALUES (
    %(vote_id)s, %(voted_at)s, %(vote_title)s, %(vote_type)s, %(result)s,
    %(votes_for)s, %(votes_against)s, %(abstentions)s, %(total_voters)s,
    %(dossier_id)s, NOW()
)
ON CONFLICT (vote_id) DO UPDATE SET
    voted_at      = EXCLUDED.voted_at,
    vote_title    = EXCLUDED.vote_title,
    vote_type     = EXCLUDED.vote_type,
    result        = EXCLUDED.result,
    votes_for     = EXCLUDED.votes_for,
    votes_against = EXCLUDED.votes_against,
    abstentions   = EXCLUDED.abstentions,
    total_voters  = EXCLUDED.total_voters,
    dossier_id    = EXCLUDED.dossier_id,
    ingested_at   = NOW();
"""


def upsert_votes(records: list[dict]) -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                for i, rec in enumerate(records, start=1):
                    cur.execute(UPSERT_SQL, rec)
                    if i % 50 == 0:
                        log.info("Upserted %d / %d votes…", i, len(records))
        log.info("Upsert complete — %d votes written.", len(records))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN votes into MonÉlu DB")
    parser.add_argument("--days", type=int, default=90, help="Look-back window in days (default: 90)")
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting vote ingestion (last %d days) ===", args.days)
    raw_items = fetch_votes_since(args.days)

    records = [r for item in raw_items if (r := parse_vote(item)) is not None]
    log.info("Parsed %d valid records (skipped %d unparseable).", len(records), len(raw_items) - len(records))

    upsert_votes(records)
    log.info("=== Vote ingestion finished ===")


if __name__ == "__main__":
    main()
