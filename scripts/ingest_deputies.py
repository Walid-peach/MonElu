"""
ingest_deputies.py
Fetches all current deputies from the Assemblée Nationale Open Data portal
(static ZIP export) and upserts them into the deputies table, then closes the
mandate of every deputy who has left since (#621).

Usage:
    python scripts/ingest_deputies.py
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import zipfile

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.departments_data import department_name  # noqa: E402

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_deputies.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

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

# Every deputy, senator and minister of the legislature with all of their
# mandates, ended ones included. AMO10 lists sitting deputies only, so a deputy
# who leaves simply drops out of it; this is the export that says when (#621).
ALL_MANDATES_ZIP_PATH = (
    "/static/openData/repository/17/amo/deputes_senateurs_ministres_legislature"
    "/AMO20_dep_sen_min_tous_mandats_et_organes.json.zip"
)

LEGISLATURE = "17"

# ---------------------------------------------------------------------------
# Data fetch
# ---------------------------------------------------------------------------


def _read_acteurs(raw: bytes) -> list[dict]:
    """The acteur dicts of an AMO ZIP export (one JSON file per acteur)."""
    acteurs = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        actor_files = [
            n for n in zf.namelist() if n.startswith("json/acteur/") and n.endswith(".json")
        ]
        log.info("ZIP contains %d actor files.", len(actor_files))
        for name in actor_files:
            with zf.open(name) as f:
                data = json.load(f)
            # Each file is {"acteur": {...}}
            acteurs.append(data.get("acteur") or data)
    return acteurs


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

    all_items = _read_acteurs(raw)
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

        # Circonscription / department — expand the raw AN code ("75", "2A")
        # to its full name at insert time (MON-219): department used to reach
        # the DB as a raw code and rely on the separate, non-critical
        # update_party.py step to expand it, so a soft-failed update_party
        # run left every deputy showing raw codes until the next successful
        # run. The AN zero-pads some codes ("099" for deputies elected
        # abroad), which a plain DEPT_NAMES lookup missed (#517). Codes absent
        # from DEPT_NAMES fall back to the raw code, and update_party.py's
        # check_deputy_labels fails the run on one.
        place = mandat.get("election", {}).get("lieu", {})
        circonscription = place.get("numCirco")
        department_code = str(place.get("numDepartement")) if place.get("numDepartement") else None
        department = department_name(department_code) if department_code else None

        # Party (groupe politique) — not available inline in AMO10; both
        # left NULL here and filled by update_party.py, which resolves them
        # from the same canonical label so party_short never regresses to
        # a raw organeRef (see MON-119).
        party = None
        party_short = None

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
            "department": department,
            "mandate_start": mandate_start,
            "mandate_end": mandate_end,
            "photo_url": photo_url,
        }
    except Exception as exc:
        log.warning("Could not parse deputy item (uid=%s): %s", item.get("uid"), exc)
        return None


def acteur_uid(item: dict) -> str:
    return (
        item.get("uid", {}).get("#text") if isinstance(item.get("uid"), dict) else item.get("uid")
    )


def an_mandate_end(acteur: dict) -> str | None:
    """When the acteur's legislature-17 seat in the Assemblée ended, or None.

    None while any of those mandates is still running, and when there is none
    at all. A deputy can hold several: one ended by a ministerial appointment
    and a second when they came back, both starting on election day (#621), so
    the answer is the latest end date, never the mandate that started last.
    """
    mandats = (acteur.get("mandats") or {}).get("mandat") or []
    if isinstance(mandats, dict):
        mandats = [mandats]
    seats = [
        m
        for m in mandats
        if m.get("typeOrgane") == "ASSEMBLEE" and str(m.get("legislature")) == LEGISLATURE
    ]
    if not seats or any(not m.get("dateFin") for m in seats):
        return None
    return max(m["dateFin"][:10] for m in seats)


# ---------------------------------------------------------------------------
# Database upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO deputies (
    deputy_id, full_name, first_name, last_name,
    party, party_short, circonscription, department,
    mandate_start, mandate_end, photo_url, ingested_at, changed_at
) VALUES (
    %(deputy_id)s, %(full_name)s, %(first_name)s, %(last_name)s,
    %(party)s, %(party_short)s, %(circonscription)s, %(department)s,
    %(mandate_start)s, %(mandate_end)s, %(photo_url)s, NOW(), NOW()
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
    party_short     = COALESCE(EXCLUDED.party_short, deputies.party_short),
    circonscription = EXCLUDED.circonscription,
    department      = EXCLUDED.department,
    mandate_start   = EXCLUDED.mandate_start,
    mandate_end     = EXCLUDED.mandate_end,
    photo_url       = EXCLUDED.photo_url,
    ingested_at     = NOW(),
    -- This row in particular must keep writing `ingested_at` on every run:
    -- all 577 deputies are re-upserted whether the AN changed anything or not,
    -- which is exactly why sources.yml makes this the "cron silently died"
    -- detector at error_after 7 days. `changed_at` carries the change signal
    -- instead (GH #353, migration 011) - see ingest_votes.py for the full note.
    -- The party columns are compared against the same COALESCE expressions the
    -- SET clause writes, not against raw EXCLUDED: AMO10 always supplies NULL
    -- there, so a raw comparison would mark every deputy changed on every run.
    changed_at      = CASE WHEN (
                          deputies.full_name, deputies.first_name, deputies.last_name,
                          deputies.party, deputies.party_short, deputies.circonscription,
                          deputies.department, deputies.mandate_start, deputies.mandate_end,
                          deputies.photo_url
                        ) IS DISTINCT FROM (
                          EXCLUDED.full_name, EXCLUDED.first_name, EXCLUDED.last_name,
                          COALESCE(EXCLUDED.party, deputies.party),
                          COALESCE(EXCLUDED.party_short, deputies.party_short),
                          EXCLUDED.circonscription, EXCLUDED.department,
                          EXCLUDED.mandate_start, EXCLUDED.mandate_end, EXCLUDED.photo_url
                        ) THEN NOW() ELSE deputies.changed_at END;
"""


# Rows still marked as sitting that the active export no longer lists.
SELECT_DEPARTED_SQL = """
SELECT deputy_id FROM deputies
WHERE mandate_end IS NULL AND NOT (deputy_id = ANY(%(active_ids)s))
"""

# A write like any other: `ingested_at` and `changed_at` both move, so the
# cache scope purges the deputy's pages (GH #353, ADR-039).
CLOSE_MANDATE_SQL = """
UPDATE deputies
SET mandate_end = %(mandate_end)s, ingested_at = NOW(), changed_at = NOW()
WHERE deputy_id = %(deputy_id)s AND mandate_end IS NULL
"""


def close_departed_mandates(
    active_ids: list[str], fetch_all_mandates=None
) -> dict[str, str | None]:
    """Give every deputy who has left the Assemblée their mandate end date (#621).

    AMO10 lists sitting deputies only, so a deputy who leaves drops out of it
    and the upsert never touches their row again: without this they stay
    "sitting" forever, two to a seat. AMO20 is downloaded only on a run that
    finds such a row. A deputy AMO20 does not show as departed is left alone
    and reported; the dbt test `assert_one_sitting_deputy_per_seat` then fails
    the daily run's data-quality gate.

    Never raises: this runs inside a critical step, and a failure here must
    not block votes ingestion (it is caught by the same dbt test instead).
    Returns {deputy_id: end date or None} for the rows it looked at.
    """
    conn = None
    try:
        conn = connect_with_retry(DATABASE_URL)
        with conn:
            with conn.cursor() as cur:
                cur.execute(SELECT_DEPARTED_SQL, {"active_ids": active_ids})
                departed = [r[0] for r in cur.fetchall()]
                if not departed:
                    return {}
                log.info("%d deputies left since the last run: %s", len(departed), departed)
                acteurs = (fetch_all_mandates or fetch_all_mandates_export)()
                by_id = {acteur_uid(a): a for a in acteurs}
                ends = {d: an_mandate_end(by_id[d]) if d in by_id else None for d in departed}
                closed = [{"deputy_id": d, "mandate_end": e} for d, e in ends.items() if e]
                psycopg2.extras.execute_batch(cur, CLOSE_MANDATE_SQL, closed)
        log.info("Closed %d mandates.", len(closed))
        unresolved = sorted(d for d, e in ends.items() if not e)
        if unresolved:
            log.error(
                "No end date in AMO20 for deputies missing from the active export: %s",
                unresolved,
            )
        return ends
    except Exception as exc:
        log.error("Could not close departed mandates (%s): %s", type(exc).__name__, exc)
        return {}
    finally:
        if conn is not None:
            conn.close()


def fetch_all_mandates_export() -> list[dict]:
    url = f"{AN_API_BASE_URL}{ALL_MANDATES_ZIP_PATH}"
    log.info("Downloading all-mandates ZIP from %s…", url)
    return _read_acteurs(download_with_retry(url))


def _upsert_records(records: list[dict]) -> None:
    conn = connect_with_retry(DATABASE_URL)
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
    if skip_rate > SKIP_RATE_THRESHOLD:
        log.error(
            "High parse failure rate: %d/%d records skipped (%.0f%%). "
            "Check the AN data format for unexpected changes.",
            skipped,
            len(raw_items),
            skip_rate * 100,
        )
        # Abort without upserting: writing the surviving records would still
        # stamp them with a fresh ingested_at, masking the failure from dbt
        # source freshness checks (MON-220).
        sys.exit(1)
    _upsert_records(records)
    close_departed_mandates([r["deputy_id"] for r in records])
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
