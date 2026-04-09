"""
ingest_votes.py
Downloads the Scrutins ZIP export from the Assemblée Nationale open-data portal
and upserts each scrutin into the votes table.

Usage:
    python scripts/ingest_votes.py                      # default: since 2025-01-01
    python scripts/ingest_votes.py --since 2024-07-07   # full legislature 17
    python scripts/ingest_votes.py --since 2026-01-01   # current year only
"""

import argparse
import io
import json
import logging
import os
import time
import zipfile

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

SCRUTINS_ZIP_PATH = "/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"

MAX_RETRIES = 5
BACKOFF_BASE = 2


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------


def download_with_retry(url: str) -> bytes:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 429:
                wait = BACKOFF_BASE**attempt
                log.warning("Rate-limited (429). Retrying in %ss…", wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = BACKOFF_BASE**attempt
                log.warning("Server error %s. Retrying in %ss…", resp.status_code, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            wait = BACKOFF_BASE**attempt
            log.warning("Request failed (%s). Retrying in %ss…", exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to download {url} after {MAX_RETRIES} attempts")


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_all_scrutins(since: str | None = None) -> list[dict]:
    """Download ZIP and return scrutins, optionally filtered to dateScrutin >= since."""
    url = f"{AN_BASE_URL}{SCRUTINS_ZIP_PATH}"
    log.info("Downloading scrutins ZIP from %s…", url)
    raw = download_with_retry(url)

    items = []
    skipped = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        scrutin_files = [n for n in zf.namelist() if n.startswith("json/") and n.endswith(".json")]
        log.info("ZIP contains %d scrutin files.", len(scrutin_files))
        for name in scrutin_files:
            with zf.open(name) as f:
                data = json.load(f)
            scrutin = data.get("scrutin") or data
            if since:
                date_raw = (scrutin.get("dateScrutin") or "")[:10]
                if date_raw and date_raw < since:
                    skipped += 1
                    continue
            items.append(scrutin)

    if since:
        log.info("Loaded %d scrutins since %s (skipped %d older).", len(items), since, skipped)
    else:
        log.info("Total scrutins loaded: %d", len(items))
    return items


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def _to_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def parse_vote(item: dict) -> dict | None:
    try:
        uid = item.get("uid") or ""
        if not uid:
            return None

        date_raw = item.get("dateScrutin") or ""
        voted_at = date_raw[:10] if date_raw else None

        titre = item.get("titre") or ""
        if isinstance(titre, dict):
            titre = titre.get("#text") or titre.get("libelle") or ""
        vote_title = str(titre).strip()

        type_vote = item.get("typeVote") or {}
        vote_type = type_vote.get("codeTypeVote") if isinstance(type_vote, dict) else str(type_vote)

        sort = item.get("sort") or {}
        result = sort.get("code") if isinstance(sort, dict) else str(sort)

        syn = item.get("syntheseVote") or {}
        decompte = syn.get("decompte") or {}
        votes_for = _to_int(decompte.get("pour"))
        votes_against = _to_int(decompte.get("contre"))
        abstentions = _to_int(decompte.get("abstentions"))
        total_voters = _to_int(syn.get("nombreVotants"))

        dossier_ref = item.get("dossierRef") or None
        if isinstance(dossier_ref, dict):
            dossier_ref = dossier_ref.get("#text") or dossier_ref.get("ref")
        # Also check objet.dossierLegislatif
        if not dossier_ref:
            obj = item.get("objet") or {}
            dossier_ref = obj.get("dossierLegislatif") or None

        return {
            "vote_id": uid,
            "voted_at": voted_at,
            "vote_title": vote_title,
            "vote_type": str(vote_type) if vote_type else None,
            "result": str(result) if result else None,
            "votes_for": votes_for,
            "votes_against": votes_against,
            "abstentions": abstentions,
            "total_voters": total_voters,
            "dossier_id": str(dossier_ref) if dossier_ref else None,
        }
    except Exception as exc:
        log.debug("Could not parse scrutin %s — %s", item.get("uid"), exc)
        return None


# ---------------------------------------------------------------------------
# Upsert
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
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=500)
        log.info("Upsert complete — %d votes written.", len(records))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN scrutins into MonÉlu DB")
    parser.add_argument(
        "--since",
        default="2025-07-01",
        help="Only ingest votes on or after this date (YYYY-MM-DD). Default: 2025-07-01",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting vote ingestion (since %s) ===", args.since)
    raw_items = fetch_all_scrutins(since=args.since)

    records = [r for item in raw_items if (r := parse_vote(item)) is not None]
    log.info(
        "Parsed %d valid records (skipped %d unparseable).",
        len(records),
        len(raw_items) - len(records),
    )

    upsert_votes(records)
    log.info("=== Vote ingestion finished ===")


if __name__ == "__main__":
    main()
