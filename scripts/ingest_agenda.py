"""
ingest_agenda.py
Downloads the Agenda ZIP export from the Assemblée Nationale open-data portal
and upserts each séance publique ODJ point into the agenda_items table
(MON-210, ADR-030).

Only réunions of @xsi:type "seance_type" (séance publique) are ingested;
commission réunions are skipped by design (ADR-030 decision 3).

Refresh is soft-state: every touched row is upserted with last_seen_at
stamped, nothing is ever deleted. A réunion that becomes Annulé/Supprimé
still has its rows upserted with the new état — the API (MON-212) is
responsible for hiding cancelled/stale items, not this script.

Usage:
    python scripts/ingest_agenda.py                       # default: rolling 90 days
    python scripts/ingest_agenda.py --since 2026-01-01     # current year only
    python scripts/ingest_agenda.py --zip-path /tmp/Agenda.json.zip
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import os
import sys
import zipfile
from datetime import date, timedelta

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_agenda.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

AGENDA_ZIP_PATH = "/static/openData/repository/17/vp/reunions/Agenda.json.zip"

SEANCE_XSI_TYPE = "seance_type"


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_all_reunions(zip_path: str | None = None) -> list[dict]:
    """Load every réunion record from a local ZIP or the AN portal."""
    if zip_path:
        log.info("Reading agenda ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
        url = f"{AN_BASE_URL}{AGENDA_ZIP_PATH}"
        log.info("Downloading agenda ZIP from %s…", url)
        raw = download_with_retry(url)

    reunions = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = [n for n in zf.namelist() if n.startswith("json/reunion/") and n.endswith(".json")]
        log.info("ZIP contains %d réunion files.", len(names))
        for name in names:
            with zf.open(name) as f:
                data = json.load(f)
            reunion = data.get("reunion") or data
            reunions.append(reunion)
    return reunions


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def _odj_points(reunion: dict) -> list[dict]:
    """Return the réunion's ODJ points.

    pointODJ is a bare object when the sitting has a single point and a list
    when it has several — both shapes occur in the feed.
    """
    points = ((reunion.get("ODJ") or {}).get("pointsODJ") or {}).get("pointODJ")
    if points is None:
        return []
    return points if isinstance(points, list) else [points]


def _as_date(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10]


def _first_ref(value) -> str | None:
    """dossierRef (and similar) may arrive as a bare string, a dict with
    #text, or a list when several apply — always take the first plain ref."""
    if value is None:
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        return value.get("#text") or value.get("ref")
    return str(value) if value else None


def _dossier_id(point: dict) -> str | None:
    refs = point.get("dossiersLegislatifsRefs") or {}
    return _first_ref(refs.get("dossierRef"))


def parse_point(reunion: dict, point: dict) -> dict | None:
    """Flatten one réunion + one of its ODJ points into an agenda_items row."""
    try:
        point_uid = point.get("uid") or ""
        reunion_uid = reunion.get("uid") or ""
        if not point_uid or not reunion_uid:
            return None

        sitting_start = reunion.get("timeStampDebut") or None
        if not sitting_start:
            return None
        sitting_end = reunion.get("timeStampFin") or None

        reunion_life = reunion.get("cycleDeVie") or {}
        reunion_etat = reunion_life.get("etat") or ""
        reunion_chrono = reunion_life.get("chrono") or {}

        # point_etat is stored as-is from the feed and is not guaranteed to be
        # updated in lockstep with reunion_etat when a sitting is cancelled —
        # readers (MON-212) should treat reunion_etat as the authoritative
        # cancellation signal and point_etat as a secondary, point-level one.
        point_life = point.get("cycleDeVie") or {}
        point_etat = point_life.get("etat") or None
        point_chrono = point_life.get("chrono") or reunion_chrono

        objet = point.get("objet") or None
        if isinstance(objet, dict):
            objet = objet.get("#text")
        objet = str(objet).strip() if objet else None

        procedure = point.get("procedure") or None
        if isinstance(procedure, dict):
            procedure = procedure.get("libelle") or procedure.get("#text")

        return {
            "point_uid": point_uid,
            "reunion_uid": reunion_uid,
            "sitting_start": sitting_start,
            "sitting_end": sitting_end,
            "objet": objet,
            "point_type": point.get("typePointODJ") or None,
            "travaux_nature": point.get("natureTravauxODJ") or None,
            "procedure_label": str(procedure) if procedure else None,
            "dossier_id": _dossier_id(point),
            "reunion_etat": reunion_etat,
            "point_etat": point_etat,
            "published_at": _as_date(point_chrono.get("creation")),
            "cancelled_at": _as_date(point_chrono.get("cloture")),
            "objet_hash": hashlib.sha256(objet.encode("utf-8")).hexdigest() if objet else None,
        }
    except Exception as exc:
        # WARNING, not DEBUG: basicConfig(level=INFO) never emitted the debug
        # line, so a feed reshape produced zero records with no visible signal
        # anywhere in the run log (MON-249).
        log.warning("Could not parse ODJ point %s — %s", point.get("uid"), exc)
        return None


def parse_reunions(reunions: list[dict], since: str | None = None) -> list[dict]:
    """Filter to séance publique réunions and flatten every ODJ point."""
    records: list[dict] = []
    skipped_type = 0
    skipped_date = 0
    points_seen = 0
    for reunion in reunions:
        if reunion.get("@xsi:type") != SEANCE_XSI_TYPE:
            skipped_type += 1
            continue
        sitting_date = (reunion.get("timeStampDebut") or "")[:10]
        if since and sitting_date and sitting_date < since:
            skipped_date += 1
            continue
        for point in _odj_points(reunion):
            points_seen += 1
            record = parse_point(reunion, point)
            if record is not None:
                records.append(record)

    unparsed = points_seen - len(records)
    log.info(
        "Parsed %d/%d ODJ points from séance publique réunions "
        "(skipped %d non-séance réunions, %d before --since).",
        len(records),
        points_seen,
        skipped_type,
        skipped_date,
    )
    check_agenda_yield(parsed=len(records), points_seen=points_seen, unparsed=unparsed)
    return records


def check_agenda_yield(parsed: int, points_seen: int, unparsed: int) -> None:
    """Exit 1 when in-window séance points exist but do not survive parsing (MON-249).

    An empty record list is a silent no-op downstream: ``upsert_agenda_items([])``
    writes nothing, ``last_seen_at`` never advances, and ``GET /agenda`` keeps
    serving the previous run's rows forever because its visibility filter is
    ``last_seen_at = (SELECT MAX(last_seen_at) ...)``. Nothing in the run log or
    the API says the feed stopped parsing.

    ``points_seen`` counts only points from séance publique réunions inside the
    ``--since`` window, so a recess (or a narrow window with no sittings) yields
    ``points_seen == 0`` and is correctly not treated as a failure.
    """
    if points_seen == 0:
        log.info("No in-window séance publique ODJ points in the feed — nothing to guard.")
        return

    if parsed == 0:
        log.error(
            "All %d in-window séance publique ODJ points failed to parse. "
            "Check the AN agenda export for format changes.",
            points_seen,
        )
        sys.exit(1)

    skip_rate = unparsed / points_seen
    if skip_rate > SKIP_RATE_THRESHOLD:
        log.error(
            "High parse failure rate: %d/%d ODJ points skipped (%.0f%%). "
            "Check the AN agenda export for format changes.",
            unparsed,
            points_seen,
            skip_rate * 100,
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO agenda_items (
    point_uid, reunion_uid, sitting_start, sitting_end,
    objet, point_type, travaux_nature, procedure_label, dossier_id,
    reunion_etat, point_etat, published_at, cancelled_at, objet_hash,
    last_seen_at, ingested_at
) VALUES (
    %(point_uid)s, %(reunion_uid)s, %(sitting_start)s, %(sitting_end)s,
    %(objet)s, %(point_type)s, %(travaux_nature)s, %(procedure_label)s, %(dossier_id)s,
    %(reunion_etat)s, %(point_etat)s, %(published_at)s, %(cancelled_at)s, %(objet_hash)s,
    NOW(), NOW()
)
ON CONFLICT (point_uid) DO UPDATE SET
    reunion_uid     = EXCLUDED.reunion_uid,
    sitting_start   = EXCLUDED.sitting_start,
    sitting_end     = EXCLUDED.sitting_end,
    objet           = EXCLUDED.objet,
    point_type      = EXCLUDED.point_type,
    travaux_nature  = EXCLUDED.travaux_nature,
    procedure_label = EXCLUDED.procedure_label,
    dossier_id      = EXCLUDED.dossier_id,
    reunion_etat    = EXCLUDED.reunion_etat,
    point_etat      = EXCLUDED.point_etat,
    published_at    = EXCLUDED.published_at,
    cancelled_at    = EXCLUDED.cancelled_at,
    objet_hash      = EXCLUDED.objet_hash,
    last_seen_at    = NOW();
"""


def upsert_agenda_items(records: list[dict]) -> None:
    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=500)
        log.info("Upsert complete — %d agenda items written.", len(records))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN séance publique agenda into MonÉlu DB")
    parser.add_argument(
        "--since",
        # Matches ingest_votes.py / run_ingestion_prod.py's default so a
        # standalone run behaves the same as the orchestrated one — the
        # orchestrator always passes --since explicitly, but this default is
        # what you get running the script directly with no flag.
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Only ingest réunions on or after this date (YYYY-MM-DD). Default: rolling 12 months.",
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded Agenda.json.zip (skips the download).",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting agenda ingestion (since %s) ===", args.since)
    reunions = fetch_all_reunions(zip_path=args.zip_path)
    records = parse_reunions(reunions, since=args.since)
    upsert_agenda_items(records)
    log.info("=== Agenda ingestion finished ===")


if __name__ == "__main__":
    main()
