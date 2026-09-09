"""
scripts/backfill_dossier_ids.py

Repairs votes.dossier_id rows that hold the Python repr() of the AN
``objet.dossierLegislatif`` dict instead of its ``dossierRef`` (MON-258).

Why this exists: until commit 7e29131 (2026-07-13) ingest_votes.py stringified
the whole ``{libelle, dossierRef}`` dict. The parser is fixed, but the upsert
only heals rows that fall inside the ingestion ``--since`` window, and the daily
cron uses 30 days - so every scrutin ingested between 2026-01 and 2026-06 kept
its corrupt value. The frontend (``frontend/src/lib/an.ts``) validates the value
before building the dossier URL, so the "Voir le dossier officiel" link was
silently absent on ~1 570 votes rather than visibly broken.

The stored text is parsed with a narrow regex, never ``eval``/``ast.literal_eval``:
the only thing wanted out of it is the reference, and it is stored data whose
shape is dictated upstream.

Rows whose text carries no extractable reference are reported, not guessed at -
re-ingest them with a wide window instead:

    python scripts/ingest_votes.py --since 2026-01-01

Idempotent: it only ever touches rows failing ``^DLR[A-Za-z0-9]+$``, so a second
run finds nothing to do.

Usage:
    python -m scripts.backfill_dossier_ids            # report only
    python -m scripts.backfill_dossier_ids --apply    # write the repairs
"""

from __future__ import annotations

import argparse
import os
import re

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

load_dotenv()

# The reference as it appears inside the stringified dict. Anchored on the key
# so a libelle that happens to contain "DLR…" cannot be mistaken for the ref.
EMBEDDED_REF_RE = re.compile(r"'dossierRef':\s*'(DLR[A-Za-z0-9]+)'")

SELECT_CORRUPT_SQL = """
SELECT vote_id, dossier_id
FROM votes
WHERE dossier_id IS NOT NULL
  AND dossier_id !~ '^DLR[A-Za-z0-9]+$'
ORDER BY vote_id
"""

UPDATE_SQL = "UPDATE votes SET dossier_id = %s WHERE vote_id = %s"


def extract_embedded_ref(stored: str) -> str | None:
    """Pull the dossier reference out of a stringified dossierLegislatif dict."""
    match = EMBEDDED_REF_RE.search(stored)
    return match.group(1) if match else None


def compute_repairs(
    rows: list[tuple[str, str]],
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Split corrupt rows into (repairable as (vote_id, ref), unrepairable)."""
    repairs: list[tuple[str, str]] = []
    unrepairable: list[tuple[str, str]] = []
    for vote_id, stored in rows:
        ref = extract_embedded_ref(stored)
        if ref:
            repairs.append((vote_id, ref))
        else:
            unrepairable.append((vote_id, stored))
    return repairs, unrepairable


def backfill(apply: bool) -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(SELECT_CORRUPT_SQL)
            rows = cur.fetchall()

        repairs, unrepairable = compute_repairs(rows)

        print(f"Corrupt dossier_id rows : {len(rows)}")
        print(f"Repairable by extraction: {len(repairs)}")
        print(f"Unrepairable            : {len(unrepairable)}\n")
        for vote_id, ref in repairs[:10]:
            print(f"  {vote_id} → {ref}")
        if len(repairs) > 10:
            print(f"  … and {len(repairs) - 10} more")
        for vote_id, stored in unrepairable:
            print(f"  UNREPAIRABLE {vote_id}: {stored[:120]!r}")
        if unrepairable:
            print(
                "\nRe-ingest the unrepairable rows: "
                "python scripts/ingest_votes.py --since 2026-01-01"
            )

        if apply and repairs:
            with conn.cursor() as cur:
                execute_batch(
                    cur,
                    UPDATE_SQL,
                    [(ref, vote_id) for vote_id, ref in repairs],
                    page_size=500,
                )
            conn.commit()
            print(f"\nCommitted {len(repairs)} repairs.")
            print("Re-run `dbt run` so marts pick up the refs, and revalidate the CDN cache.")
        elif not apply:
            print("\nDry run - re-run with --apply to write.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Repair stringified votes.dossier_id values.")
    parser.add_argument("--apply", action="store_true", help="write repairs (default: dry run)")
    args = parser.parse_args()
    backfill(apply=args.apply)
