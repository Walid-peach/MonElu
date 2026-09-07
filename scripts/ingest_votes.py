"""
ingest_votes.py
Downloads the Scrutins ZIP export from the Assemblée Nationale open-data portal
and upserts each scrutin into the votes table.

Usage:
    python scripts/ingest_votes.py                      # default: rolling 12 months
    python scripts/ingest_votes.py --since 2024-07-07   # full legislature 17
    python scripts/ingest_votes.py --since 2026-01-01   # current year only
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
import zipfile
from datetime import date, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_votes.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

SCRUTINS_ZIP_PATH = "/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"

# Shape of an AN dossier législatif reference, e.g. "DLR5L17N52985". Mirrored by
# frontend/src/lib/an.ts::DOSSIER_REF, which refuses to build the "Voir le dossier
# officiel" link for anything else (MON-258).
DOSSIER_REF_RE = re.compile(r"^DLR[A-Za-z0-9]+$")


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_all_scrutins(since: str | None = None, zip_path: str | None = None) -> list[dict]:
    """Load scrutins from a local ZIP (zip_path) or download one.

    Filtered to dateScrutin >= since.
    """
    if zip_path:
        log.info("Reading scrutins ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
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


def extract_dossier_ref(item: dict) -> str | None:
    """Dossier reference carried by a scrutin, exactly as published.

    Returned unvalidated on purpose: ``parse_vote`` drops a non-conforming value
    and ``check_dossier_refs`` reports it, so the two callers see the same raw
    string rather than one silently repairing what the other is meant to detect.
    """
    dossier_ref = item.get("dossierRef") or None
    if isinstance(dossier_ref, dict):
        dossier_ref = dossier_ref.get("#text") or dossier_ref.get("ref")
    # Also check objet.dossierLegislatif - the only populated location since 2026-03.
    if not dossier_ref:
        obj = item.get("objet") or {}
        dossier_ref = obj.get("dossierLegislatif") or None
        if isinstance(dossier_ref, dict):
            dossier_ref = dossier_ref.get("dossierRef") or dossier_ref.get("#text")
    return str(dossier_ref) if dossier_ref else None


def is_dossier_ref(value: str | None) -> bool:
    return bool(value) and DOSSIER_REF_RE.match(value) is not None


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

        dossier_ref = extract_dossier_ref(item)

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
            "dossier_id": dossier_ref if is_dossier_ref(dossier_ref) else None,
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


def _upsert_records(records: list[dict]) -> None:
    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=500)
        log.info("Upsert complete — %d votes written.", len(records))
    finally:
        conn.close()


def check_dossier_refs(raw_items: list[dict]) -> None:
    """Exit 1 when the dossier reference stops looking like a dossier reference.

    ``objet.dossierLegislatif`` is a ``{libelle, dossierRef}`` dict, and until
    commit 7e29131 the parser stringified the whole dict instead of reading
    ``dossierRef``. Nothing failed: the corrupt value was upserted, the frontend
    regex in ``an.ts`` rejected it, and the "Voir le dossier officiel" link was
    simply not rendered on 1 570 production votes for four months (MON-258).

    A shape change on that subtree fails the same silent way, so the check is on
    the *share* of dossier-carrying scrutins whose reference is malformed rather
    than on the parse succeeding at all. Scrutins with no dossier are not counted:
    the AN published none before 2026-03 (ADR-035), so an all-null run is normal
    history, not a regression.
    """
    seen = 0
    malformed: list[tuple[str, str]] = []
    for item in raw_items:
        raw = extract_dossier_ref(item)
        if raw is None:
            continue
        seen += 1
        if not is_dossier_ref(raw):
            malformed.append((str(item.get("uid") or "?"), raw))

    if not malformed:
        log.info(
            "Dossier references: %d/%d scrutins carry one, all well-formed.", seen, len(raw_items)
        )
        return

    rate = len(malformed) / seen
    log.error(
        "Malformed dossier references: %d/%d (%.0f%%). First offenders: %s",
        len(malformed),
        seen,
        rate * 100,
        "; ".join(f"{uid}={raw[:80]!r}" for uid, raw in malformed[:3]),
    )
    if rate > SKIP_RATE_THRESHOLD:
        # Abort before upserting: these rows would be written with a NULL
        # dossier_id, which reads downstream as "this scrutin has no bill"
        # rather than as a broken feed.
        sys.exit(1)


def upsert_votes(raw_items: list[dict]) -> int:
    """Parse raw scrutin dicts and upsert into votes table. Returns count written."""
    records = [r for item in raw_items if (r := parse_vote(item)) is not None]
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
    check_dossier_refs(raw_items)
    _upsert_records(records)
    return len(records)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN scrutins into MonÉlu DB")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Only ingest votes on or after this date (YYYY-MM-DD). Default: rolling 12 months.",
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded Scrutins.json.zip (skips the download).",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting vote ingestion (since %s) ===", args.since)
    raw_items = fetch_all_scrutins(since=args.since, zip_path=args.zip_path)
    upsert_votes(raw_items)
    log.info("=== Vote ingestion finished ===")


if __name__ == "__main__":
    main()
