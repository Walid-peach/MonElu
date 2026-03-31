"""
ingest_deputies.py
Fetches all current deputies from the Assemblée Nationale Open Data portal
(static ZIP export) and upserts them into the deputies table.

Usage:
    python scripts/ingest_deputies.py
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

AN_API_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

# Static export — one ZIP, one JSON file per deputy
DEPUTIES_ZIP_PATH = (
    "/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes"
    "/AMO10_deputes_actifs_mandats_actifs_organes.json.zip"
)

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

MAX_RETRIES = 5
BACKOFF_BASE = 2  # seconds


def download_with_retry(url: str) -> bytes:
    """GET with exponential backoff on 429 / 5xx; returns raw bytes."""
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
# Data fetch
# ---------------------------------------------------------------------------

def fetch_all_deputies() -> list[dict]:
    """Download the ZIP export and return a list of raw acteur dicts."""
    url = f"{AN_API_BASE_URL}{DEPUTIES_ZIP_PATH}"
    log.info("Downloading deputies ZIP from %s…", url)
    raw = download_with_retry(url)

    all_items = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        actor_files = [n for n in zf.namelist() if n.startswith("json/acteur/") and n.endswith(".json")]
        log.info("ZIP contains %d actor files.", len(actor_files))
        for name in actor_files:
            with zf.open(name) as f:
                data = json.load(f)
            # Each file is {"acteur": {...}}
            acteur = data.get("acteur") or data
            all_items.append(acteur)

    log.info("Total deputies fetched: %d", len(all_items))
    return all_items


# ---------------------------------------------------------------------------
# Transformation
# ---------------------------------------------------------------------------

def parse_deputy(item: dict) -> dict | None:
    """
    Normalise a raw AN API actor object into the deputies table shape.
    Returns None if the item cannot be parsed.
    """
    try:
        uid = item.get("uid", {}).get("#text") or item.get("uid") or ""
        if not uid:
            return None

        ec = item.get("etatCivil", {})
        ident = ec.get("ident", {})
        first_name = ident.get("prenom", "")
        last_name = ident.get("nom", "")
        full_name = f"{first_name} {last_name}".strip()

        mandate = item.get("mandats", {}).get("mandat")
        if isinstance(mandate, list):
            # Take the first active AN mandate
            mandat = next(
                (m for m in mandate if m.get("typeOrgane") == "ASSEMBLEE"),
                mandate[0] if mandate else {},
            )
        elif isinstance(mandate, dict):
            mandat = mandate
        else:
            mandat = {}

        mandat_start_raw = mandat.get("dateDebut")
        mandat_end_raw = mandat.get("dateFin")
        mandate_start = mandat_start_raw[:10] if mandat_start_raw else None
        mandate_end = mandat_end_raw[:10] if mandat_end_raw else None

        organe_ref = mandat.get("organes", {}).get("organeRef")
        if isinstance(organe_ref, list):
            organe_ref = organe_ref[0] if organe_ref else None

        # Circonscription / department
        place = mandat.get("election", {}).get("lieu", {})
        circonscription = place.get("numCirco")
        department = place.get("numDepartement")

        # Party (groupe politique) — separate call not available inline; store organeRef as party_short
        party = None
        party_short = organe_ref

        photo_url = (
            f"https://www.assemblee-nationale.fr/dyn/static/tribun/photos/{uid}.jpg"
        )

        return {
            "deputy_id": uid,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "party": party,
            "party_short": party_short,
            "circonscription": str(circonscription) if circonscription else None,
            "department": str(department) if department else None,
            "mandate_start": mandate_start,
            "mandate_end": mandate_end,
            "photo_url": photo_url,
        }
    except Exception as exc:
        log.debug("Could not parse deputy item: %s — %s", item, exc)
        return None


# ---------------------------------------------------------------------------
# Database upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO deputies (
    deputy_id, full_name, first_name, last_name,
    party, party_short, circonscription, department,
    mandate_start, mandate_end, photo_url, ingested_at
) VALUES (
    %(deputy_id)s, %(full_name)s, %(first_name)s, %(last_name)s,
    %(party)s, %(party_short)s, %(circonscription)s, %(department)s,
    %(mandate_start)s, %(mandate_end)s, %(photo_url)s, NOW()
)
ON CONFLICT (deputy_id) DO UPDATE SET
    full_name       = EXCLUDED.full_name,
    first_name      = EXCLUDED.first_name,
    last_name       = EXCLUDED.last_name,
    party           = EXCLUDED.party,
    party_short     = EXCLUDED.party_short,
    circonscription = EXCLUDED.circonscription,
    department      = EXCLUDED.department,
    mandate_start   = EXCLUDED.mandate_start,
    mandate_end     = EXCLUDED.mandate_end,
    photo_url       = EXCLUDED.photo_url,
    ingested_at     = NOW();
"""


def upsert_deputies(records: list[dict]) -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                for i, rec in enumerate(records, start=1):
                    cur.execute(UPSERT_SQL, rec)
                    if i % 50 == 0:
                        log.info("Upserted %d / %d deputies…", i, len(records))
        log.info("Upsert complete — %d deputies written.", len(records))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting deputy ingestion ===")
    raw_items = fetch_all_deputies()

    records = [r for item in raw_items if (r := parse_deputy(item)) is not None]
    log.info("Parsed %d valid records (skipped %d unparseable).", len(records), len(raw_items) - len(records))

    upsert_deputies(records)
    log.info("=== Deputy ingestion finished ===")


if __name__ == "__main__":
    main()
