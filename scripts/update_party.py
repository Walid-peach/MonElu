"""
scripts/update_party.py

Steps 3 + 4:
  - Updates deputies.party using the GP mapping from ingest_organes.py
  - Derives every row's party_short from its party label (#517)
  - Backfills deputies.department for any row still holding a raw code
  - Exits 1 when a row still holds a raw AN code (check_deputy_labels, #517)

Run: venv/bin/python3 scripts/update_party.py [--zip-path /path/to/AMO10.json.zip]
"""

import os
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.departments_data import department_name  # noqa: E402
from api.groups_data import CANONICAL_SHORT_LABELS  # noqa: E402

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
    #
    # The IS DISTINCT FROM guard and the changed_at bump are what make a party
    # change visible to the cache-invalidation scope (GH #353): this step runs
    # after ingest_deputies.py, which never writes a party label, so without the
    # bump a deputy who switched groups would not appear in the changed set and
    # their page would keep serving the old group for up to a day. The guard is
    # the other half - it keeps the normal no-change run from marking all 577.
    # `ingested_at` is deliberately untouched (as it always was here): it is
    # dbt's source-freshness field, and ingest_deputies.py has already stamped
    # it for this run.
    rows = [
        (party, CANONICAL_SHORT_LABELS[party], deputy_id, party, CANONICAL_SHORT_LABELS[party])
        for deputy_id, party in deputy_map.items()
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET party = %s, party_short = %s, changed_at = NOW() "
            "WHERE deputy_id = %s AND (party, party_short) IS DISTINCT FROM (%s, %s)",
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
        stored = (d["department"] or "").strip()
        full_name = department_name(stored) if stored else stored
        if full_name and full_name != stored:
            to_update.append((full_name, d["deputy_id"], full_name))

    print(f"\nUpdating department names for {len(to_update)} deputies …")
    # Same guard + changed_at bump as update_parties above (GH #353). This step
    # is a no-op in the normal case, so without the guard it would be a no-op
    # that still reported every matched deputy as changed.
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET department = %s, changed_at = NOW() "
            "WHERE deputy_id = %s AND department IS DISTINCT FROM %s",
            to_update,
            page_size=200,
        )
    conn.commit()
    print(f"  Done — {len(to_update)} departments expanded to full names.")


# A raw AN organe uid, and a department still held as a bare code.
RAW_ORGANE_PATTERN = r"^PO[0-9]+$"
RAW_DEPARTMENT_PATTERN = r"^[0-9]+[AB]?$"


def normalize_party_short(conn) -> None:
    """Derive every row's party_short from its party label (#517).

    update_parties only reaches the deputies AMO10 lists as active, and skips a
    non-canonical label, so a former deputy - or a current one whose PARPOL
    label was overridden by backfill_party_labels.py - could keep a raw organe
    uid ("PO838901") from before MON-119. This step rewrites party_short from
    the canonical label for every row, and clears a raw organe uid on a row
    with no label, so the abbreviation can never disagree with the party.
    """
    rows = list(CANONICAL_SHORT_LABELS.items())
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE deputies SET party_short = %s, changed_at = NOW() "
            "WHERE party = %s AND party_short IS DISTINCT FROM %s",
            [(short, label, short) for label, short in rows],
            page_size=200,
        )
        cur.execute(
            "UPDATE deputies SET party_short = NULL, changed_at = NOW() "
            "WHERE party IS NULL AND party_short ~ %s",
            (RAW_ORGANE_PATTERN,),
        )
    conn.commit()


CHECK_LABELS_SQL = """
SELECT deputy_id, full_name, party_short, department
FROM deputies
WHERE party_short ~ %(organe)s OR department ~* %(department)s
ORDER BY deputy_id
"""


def check_deputy_labels(conn) -> list[dict]:
    """Rows still holding a raw AN code where a label belongs (#517).

    Run after the backfills above: anything left is a code the label maps do
    not know, which the app and the website would print as is, so the step
    exits 1 rather than ship it (the same rule as the parser guards, MON-220).
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            CHECK_LABELS_SQL,
            {"organe": RAW_ORGANE_PATTERN, "department": RAW_DEPARTMENT_PATTERN},
        )
        return cur.fetchall()


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
        normalize_party_short(conn)
        update_departments(conn)
        print_summary(conn)
        raw = check_deputy_labels(conn)
    finally:
        conn.close()

    if raw:
        print(f"\n::error::{len(raw)} deputies still hold a raw AN code:")
        for r in raw:
            codes = f"{r['party_short']!r} / {r['department']!r}"
            print(f"    {r['deputy_id']} {r['full_name']}: {codes}")
        sys.exit(1)

    print("\nDone.")
