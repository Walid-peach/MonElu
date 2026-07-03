"""
ingest_deputies.py
Fetches all current deputies from the Assemblée Nationale Open Data portal
(static ZIP export) and upserts them into the deputies table.

Usage:
    python scripts/ingest_deputies.py
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import zipfile

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_deputies.py
    from _http import download_with_retry

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
# Data fetch
# ---------------------------------------------------------------------------


def fetch_all_deputies(zip_path: str | None = None) -> list[dict]:
    """Load the ZIP export (local path or download) and return raw acteur dicts."""
    if zip_path:
        log.info("Reading deputies ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
        url = f"{AN_API_BASE_URL}{DEPUTIES_ZIP_PATH}"
        log.info("Downloading deputies ZIP from %s…", url)
        raw = download_with_retry(url)

    all_items = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        actor_files = [
            n for n in zf.namelist() if n.startswith("json/acteur/") and n.endswith(".json")
        ]
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

        numeric_id = uid.lstrip("PA")
        photo_url = (
            f"https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/{numeric_id}.jpg"
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
        log.warning("Could not parse deputy item (uid=%s): %s", item.get("uid"), exc)
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
    -- AMO10 has no inline party; this script always inserts NULL and
    -- update_party.py fills it afterwards. COALESCE keeps the previous
    -- label instead of wiping it, so a run where update_party fails (or
    -- a deputy leaves between the two steps) can't NULL out the party.
    party           = COALESCE(EXCLUDED.party, deputies.party),
    party_short     = EXCLUDED.party_short,
    circonscription = EXCLUDED.circonscription,
    department      = EXCLUDED.department,
    mandate_start   = EXCLUDED.mandate_start,
    mandate_end     = EXCLUDED.mandate_end,
    photo_url       = EXCLUDED.photo_url,
    ingested_at     = NOW();
"""


def _upsert_records(records: list[dict]) -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=200)
        log.info("Upsert complete — %d deputies written.", len(records))
    finally:
        conn.close()


def upsert_deputies(raw_items: list[dict]) -> int:
    """Parse raw acteur dicts and upsert into deputies table. Returns count written."""
    records = [r for item in raw_items if (r := parse_deputy(item)) is not None]
    skipped = len(raw_items) - len(records)
    skip_rate = skipped / len(raw_items) if raw_items else 0.0
    log.info("Parsed %d valid records (skipped %d unparseable).", len(records), skipped)
    if skip_rate > 0.05:
        log.error(
            "High parse failure rate: %d/%d records skipped (%.0f%%). "
            "Check the AN data format for unexpected changes.",
            skipped,
            len(raw_items),
            skip_rate * 100,
        )
    _upsert_records(records)
    return len(records)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN deputies into MonÉlu DB")
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded AMO10 deputies ZIP (skips the download).",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting deputy ingestion ===")
    raw_items = fetch_all_deputies(zip_path=args.zip_path)
    upsert_deputies(raw_items)
    log.info("=== Deputy ingestion finished ===")


if __name__ == "__main__":
    main()
