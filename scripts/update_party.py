"""
scripts/update_party.py

Steps 3 + 4:
  - Updates deputies.party using the GP mapping from ingest_organes.py
  - Backfills deputies.department for any row still holding a raw code

Run: venv/bin/python3 scripts/update_party.py [--zip-path /path/to/AMO10.json.zip]
"""

import os
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.departments_data import DEPT_NAMES  # noqa: E402

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def update_parties(conn, deputy_map: dict[str, str]) -> None:
    from scripts.backfill_party_labels import CANONICAL_LABELS, CANONICAL_SHORT_LABELS

    # Never write a non-canonical label: the PARPOL fallback in
    # build_deputy_party_map can produce party spellings ("Renaissance",
    # "Parti socialiste") that fragment the party dimension and fail the
    # dbt accepted_values gate the next day. Warn and keep the old value.
    skipped = {
        deputy_id: party for deputy_id, party in deputy_map.items() if party not in CANONICAL_LABELS
    }
    for deputy_id, party in skipped.items():
        print(f"  WARNING: skipping non-canonical label {party!r} for {deputy_id}")
    deputy_map = {k: v for k, v in deputy_map.items() if k not in skipped}

    # party_short is derived from the same canonical label used for party,
    # not from the AN organe abbreviation — this guarantees it matches the
    # keys the frontend's partyHex()/partyShort() already use, instead of
    # depending on a separately-resolved string that could drift.
    print(f"\nUpdating party for {len(deputy_map)} deputies …")
    rows = [
        (party, CANONICAL_SHORT_LABELS[party], deputy_id) for deputy_id, party in deputy_map.items()
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET party = %s, party_short = %s WHERE deputy_id = %s",
            rows,
            page_size=200,
        )
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM deputies WHERE party IS NULL")
        null_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM deputies WHERE party IS NOT NULL")
        filled_count = cur.fetchone()[0]

    print(f"  Updated : {filled_count}")
    print(f"  Still NULL: {null_count}")


def update_departments(conn) -> None:
    """Defensive backfill only (MON-219): ingest_deputies.py now expands the
    department code to its full name at insert time via the same DEPT_NAMES
    map, so this step is normally a no-op — it only touches rows still
    holding a raw code (e.g. from before that fix shipped, or a deputy
    ingested by a run that predates it)."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT deputy_id, department FROM deputies")
        deputies = cur.fetchall()

    to_update = []
    for d in deputies:
        code = (d["department"] or "").strip()
        full_name = DEPT_NAMES.get(code)
        if full_name:
            to_update.append((full_name, d["deputy_id"]))

    print(f"\nUpdating department names for {len(to_update)} deputies …")
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET department = %s WHERE deputy_id = %s",
            to_update,
            page_size=200,
        )
    conn.commit()
    print(f"  Done — {len(to_update)} departments expanded to full names.")


def print_summary(conn) -> None:
    print(f"\n{'=' * 56}")
    print("  VERIFICATION")
    print(f"{'=' * 56}")

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        print("\n  Party breakdown:")
        cur.execute("SELECT party, COUNT(*) as n FROM deputies GROUP BY party ORDER BY n DESC")
        for r in cur.fetchall():
            label = r["party"] or "(NULL)"
            print(f"    {label:<50}  {r['n']}")

        print("\n  Top 10 departments:")
        cur.execute(
            "SELECT department, COUNT(*) as n FROM deputies "
            "GROUP BY department ORDER BY n DESC LIMIT 10"
        )
        for r in cur.fetchall():
            print(f"    {(r['department'] or 'NULL'):<35}  {r['n']}")

        print("\n  Yaël Braun-Pivet:")
        cur.execute(
            "SELECT full_name, party, department FROM deputies WHERE full_name LIKE '%Braun-Pivet%'"
        )
        for r in cur.fetchall():
            print(f"    name       : {r['full_name']}")
            print(f"    party      : {r['party']}")
            print(f"    department : {r['department']}")


if __name__ == "__main__":
    # Import here so the ZIP is only downloaded once
    import argparse
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from scripts.ingest_organes import build_deputy_party_map, build_gp_map, download_zip

    parser = argparse.ArgumentParser(description="Resolve deputy party + department names")
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded AMO10 deputies ZIP (skips the download).",
    )
    args = parser.parse_args()

    zf = download_zip(zip_path=args.zip_path)
    gp_map = build_gp_map(zf)
    deputy_map = build_deputy_party_map(zf, gp_map)

    print(f"\n  GP map: {len(gp_map)} organes")
    print(f"  Deputy→party: {len(deputy_map)} resolved")

    conn = psycopg2.connect(DATABASE_URL)
    try:
        update_parties(conn, deputy_map)
        update_departments(conn)
        print_summary(conn)
    finally:
        conn.close()

    print("\nDone.")
