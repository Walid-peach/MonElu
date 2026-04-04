"""
ingest_positions.py
Reads the same Scrutins ZIP and extracts individual deputy positions
(pour / contre / abstention / nonVotant) into the vote_positions table.

Usage:
    python scripts/ingest_positions.py
"""

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
# DB connection with retry (handles transient proxy drops on Railway)
# ---------------------------------------------------------------------------

def connect_with_retry() -> psycopg2.extensions.connection:
    for attempt in range(MAX_RETRIES):
        try:
            return psycopg2.connect(DATABASE_URL)
        except psycopg2.OperationalError as exc:
            wait = BACKOFF_BASE ** attempt
            log.warning("DB connection failed (%s). Retrying in %ss…", exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"Could not connect to DB after {MAX_RETRIES} attempts")


# ---------------------------------------------------------------------------
# HTTP helper (same pattern as ingest_deputies / ingest_votes)
# ---------------------------------------------------------------------------

def download_with_retry(url: str) -> bytes:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=60)
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
            return resp.content
        except requests.RequestException as exc:
            wait = BACKOFF_BASE ** attempt
            log.warning("Request failed (%s). Retrying in %ss…", exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to download {url} after {MAX_RETRIES} attempts")


# ---------------------------------------------------------------------------
# Position extraction helpers
# ---------------------------------------------------------------------------

def _votants(block) -> list[str]:
    """Return a list of acteurRef strings from a pours/contres/abstentions block."""
    if not block:
        return []
    votant = block.get("votant")
    if not votant:
        return []
    if isinstance(votant, dict):
        votant = [votant]
    return [v.get("acteurRef") for v in votant if v.get("acteurRef")]


def extract_positions(scrutin: dict) -> list[dict]:
    """
    Walk the ventilationVotes tree and return a flat list of:
        { vote_id, deputy_id, position }
    position is normalised to: pour | contre | abstention | nonVotant
    """
    uid = scrutin.get("uid") or ""
    if not uid:
        return []

    positions: list[dict] = []
    seen: set[str] = set()  # one position per deputy per scrutin

    ventil = scrutin.get("ventilationVotes") or {}
    organe = ventil.get("organe") or {}
    groupes_block = organe.get("groupes") or {}
    groupes = groupes_block.get("groupe") or []
    if isinstance(groupes, dict):
        groupes = [groupes]

    for groupe in groupes:
        vote_block = groupe.get("vote") or {}
        dn = vote_block.get("decompteNominatif") or {}

        mapping = {
            "pour": _votants(dn.get("pours")),
            "contre": _votants(dn.get("contres")),
            "abstention": _votants(dn.get("abstentions")),
            "nonVotant": _votants(dn.get("nonVotants")),
        }

        for position, deputy_ids in mapping.items():
            for deputy_id in deputy_ids:
                if deputy_id in seen:
                    continue
                seen.add(deputy_id)
                positions.append({
                    "vote_id": uid,
                    "deputy_id": deputy_id,
                    "position": position,
                })

    return positions


# ---------------------------------------------------------------------------
# Fetch ZIP (reuse same file if already cached)
# ---------------------------------------------------------------------------

def fetch_scrutin_zip() -> bytes:
    url = f"{AN_BASE_URL}{SCRUTINS_ZIP_PATH}"
    log.info("Downloading scrutins ZIP from %s…", url)
    return download_with_retry(url)


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO vote_positions (vote_id, deputy_id, position, ingested_at)
VALUES (%(vote_id)s, %(deputy_id)s, %(position)s, NOW())
ON CONFLICT (vote_id, deputy_id) DO UPDATE SET
    position    = EXCLUDED.position,
    ingested_at = NOW();
"""


def upsert_positions(records: list[dict]) -> None:
    """Open a fresh connection per batch — avoids proxy timeouts on long-running ingestions."""
    conn = connect_with_retry()
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=500)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    raw = fetch_scrutin_zip()

    # Pre-load the set of known vote_ids and deputy_ids to skip orphan positions
    log.info("Loading known vote_ids and deputy_ids…")
    conn = connect_with_retry()
    with conn.cursor() as cur:
        cur.execute("SELECT vote_id FROM votes")
        known_votes: set[str] = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT deputy_id FROM deputies")
        known_deputies: set[str] = {r[0] for r in cur.fetchall()}
    conn.close()
    log.info("Known votes: %d  Known deputies: %d", len(known_votes), len(known_deputies))

    log.info("=== Starting position ingestion ===")
    total_written = 0
    total_skipped = 0
    batch: list[dict] = []

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        scrutin_files = [n for n in zf.namelist() if n.startswith("json/") and n.endswith(".json")]
        log.info("ZIP contains %d scrutin files.", len(scrutin_files))

        for name in scrutin_files:
            with zf.open(name) as f:
                data = json.load(f)
            scrutin = data.get("scrutin") or data

            # Skip if this vote wasn't ingested (FK constraint)
            vote_id = scrutin.get("uid") or ""
            if vote_id not in known_votes:
                total_skipped += 1
                continue

            positions = extract_positions(scrutin)
            for pos in positions:
                if pos["deputy_id"] in known_deputies:
                    batch.append(pos)
                else:
                    total_skipped += 1

            if len(batch) >= 2000:
                upsert_positions(batch)
                total_written += len(batch)
                log.info("Upserted %d positions so far…", total_written)
                batch = []

    # Flush remainder
    if batch:
        upsert_positions(batch)
        total_written += len(batch)

    log.info("Upsert complete — %d positions written, %d skipped.", total_written, total_skipped)
    log.info("=== Position ingestion finished ===")


if __name__ == "__main__":
    main()
