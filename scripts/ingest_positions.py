"""
ingest_positions.py
Reads the same Scrutins ZIP and extracts individual deputy positions
(pour / contre / abstention / nonVotant) into the vote_positions table.

Usage:
    python scripts/ingest_positions.py                    # all known votes
    python scripts/ingest_positions.py --since 2026-04-18 # only votes on/after date
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import zipfile

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_positions.py
    from _http import connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

SCRUTINS_ZIP_PATH = "/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"


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
                positions.append(
                    {
                        "vote_id": uid,
                        "deputy_id": deputy_id,
                        "position": position,
                    }
                )

    return positions


# ---------------------------------------------------------------------------
# Fetch ZIP (reuse same file if already cached)
# ---------------------------------------------------------------------------


def fetch_scrutin_zip(zip_path: str | None = None) -> bytes:
    if zip_path:
        log.info("Reading scrutins ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            return fh.read()
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
    parser = argparse.ArgumentParser(description="Ingest deputy positions from scrutins ZIP")
    parser.add_argument(
        "--since",
        default=None,
        help=(
            "Only ingest positions for votes on/after this date (YYYY-MM-DD). "
            "Default: all known votes."
        ),
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded Scrutins.json.zip (skips the download).",
    )
    args = parser.parse_args()

    if args.since:
        try:
            from datetime import date as _date

            _date.fromisoformat(args.since)
        except ValueError:
            parser.error(f"--since must be YYYY-MM-DD, got: {args.since!r}")

    run(since=args.since, zip_path=args.zip_path)


def run(since: str | None = None, zip_path: str | None = None) -> None:
    """Programmatic entry point for Airflow — skips argparse."""
    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")
    if since:
        from datetime import date as _date

        try:
            _date.fromisoformat(since)
        except ValueError as exc:
            raise ValueError(f"since must be YYYY-MM-DD, got: {since!r}") from exc

    raw = fetch_scrutin_zip(zip_path=zip_path)

    log.info("Loading known vote_ids and deputy_ids…")
    conn = connect_with_retry()
    with conn.cursor() as cur:
        if since:
            cur.execute("SELECT vote_id FROM votes WHERE voted_at >= %s", (since,))
        else:
            cur.execute("SELECT vote_id FROM votes")
        known_votes: set[str] = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT deputy_id FROM deputies")
        known_deputies: set[str] = {r[0] for r in cur.fetchall()}
    conn.close()
    log.info(
        "Known votes: %d  Known deputies: %d%s",
        len(known_votes),
        len(known_deputies),
        f"  (since {since})" if since else "",
    )

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

            # Cheap date guard: skip the ventilationVotes tree-walk for scrutins
            # outside the window, regardless of DB state.
            if since:
                date_raw = (scrutin.get("dateScrutin") or "")[:10]
                if date_raw and date_raw < since:
                    total_skipped += 1
                    continue

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

    if batch:
        upsert_positions(batch)
        total_written += len(batch)

    log.info("Upsert complete — %d positions written, %d skipped.", total_written, total_skipped)
    log.info("=== Position ingestion finished ===")


if __name__ == "__main__":
    main()
