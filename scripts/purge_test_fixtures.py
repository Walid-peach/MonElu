"""
scripts/purge_test_fixtures.py

Removes integration-test fixture data that leaked into a real database
(incident 2026-07: `pytest tests/integration/` was run with DATABASE_URL
pointing at production Supabase; the teardown TRUNCATE never ran).

Fingerprints — must stay in sync with tests/integration/conftest.py:
  - votes:     vote_title LIKE 'Vote de test%'  (vote_ids VTANR5L17V0001-0025)
  - deputies:  deputy_id IN ('PA001','PA002','PA003','PA004')
  - plus their vote_positions, mart rows, and document_chunks

Dry-run by default; pass --apply to delete. After an --apply run that
removed document_chunks source rows, rebuild the RAG index
(`make rag-index`) so the embeddings match the tables again.

Usage:
    python -m scripts.purge_test_fixtures            # report only
    python -m scripts.purge_test_fixtures --apply    # delete
"""

import argparse
import os
import sys

import psycopg2
from dotenv import load_dotenv

load_dotenv()

FIXTURE_DEPUTY_IDS = ["PA001", "PA002", "PA003", "PA004"]
FIXTURE_VOTE_TITLE_PATTERN = "Vote de test%"

# (label, count SQL, delete SQL) — deletes ordered so FK children go first.
STATEMENTS = [
    (
        "vote_positions of fixture votes",
        """SELECT COUNT(*) FROM vote_positions
           WHERE vote_id IN (SELECT vote_id FROM votes WHERE vote_title LIKE %(title)s)""",
        """DELETE FROM vote_positions
           WHERE vote_id IN (SELECT vote_id FROM votes WHERE vote_title LIKE %(title)s)""",
    ),
    (
        "vote_positions of fixture deputies",
        "SELECT COUNT(*) FROM vote_positions WHERE deputy_id = ANY(%(ids)s)",
        "DELETE FROM vote_positions WHERE deputy_id = ANY(%(ids)s)",
    ),
    (
        "fixture votes",
        "SELECT COUNT(*) FROM votes WHERE vote_title LIKE %(title)s",
        "DELETE FROM votes WHERE vote_title LIKE %(title)s",
    ),
    (
        "fixture deputies",
        "SELECT COUNT(*) FROM deputies WHERE deputy_id = ANY(%(ids)s)",
        "DELETE FROM deputies WHERE deputy_id = ANY(%(ids)s)",
    ),
    (
        "mart_deputy_scorecard fixture rows",
        "SELECT COUNT(*) FROM analytics_marts.mart_deputy_scorecard WHERE deputy_id = ANY(%(ids)s)",
        "DELETE FROM analytics_marts.mart_deputy_scorecard WHERE deputy_id = ANY(%(ids)s)",
    ),
    (
        "mart_party_alignment fixture rows",
        "SELECT COUNT(*) FROM analytics_marts.mart_party_alignment WHERE deputy_id = ANY(%(ids)s)",
        "DELETE FROM analytics_marts.mart_party_alignment WHERE deputy_id = ANY(%(ids)s)",
    ),
    (
        "document_chunks of fixture deputies",
        "SELECT COUNT(*) FROM document_chunks WHERE metadata->>'deputy_id' = ANY(%(ids)s)",
        "DELETE FROM document_chunks WHERE metadata->>'deputy_id' = ANY(%(ids)s)",
    ),
    (
        "document_chunks of fixture votes",
        """SELECT COUNT(*) FROM document_chunks
           WHERE metadata->>'vote_id' IN (SELECT vote_id FROM votes WHERE vote_title LIKE %(title)s)""",
        """DELETE FROM document_chunks
           WHERE metadata->>'vote_id' IN (SELECT vote_id FROM votes WHERE vote_title LIKE %(title)s)""",
    ),
]


def purge(apply: bool) -> int:
    """Report (and optionally delete) fixture rows. Returns total rows found."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    params = {"ids": FIXTURE_DEPUTY_IDS, "title": FIXTURE_VOTE_TITLE_PATTERN}
    total = 0
    try:
        with conn.cursor() as cur:
            for label, count_sql, delete_sql in STATEMENTS:
                try:
                    cur.execute(count_sql, params)
                    n = cur.fetchone()[0]
                except psycopg2.errors.UndefinedTable:
                    conn.rollback()
                    print(f"  {label:<42} table absent — skipped")
                    continue
                total += n
                marker = "DELETE" if (apply and n) else "found "
                print(f"  {label:<42} {marker} {n}")
                if apply and n:
                    cur.execute(delete_sql, params)
        if apply:
            conn.commit()
            print("\nCommitted. Rebuild the RAG index now: make rag-index")
        else:
            conn.rollback()
            if total:
                print(f"\nDry run — {total} rows would be deleted. Re-run with --apply.")
            else:
                print("\nClean — no fixture rows found.")
    finally:
        conn.close()
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge leaked integration-test fixture rows.")
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    args = parser.parse_args()
    print(f"Target: {os.environ.get('DATABASE_URL', '?').split('@')[-1]}")
    print(f"Mode:   {'APPLY' if args.apply else 'dry run'}\n")
    found = purge(apply=args.apply)
    sys.exit(0 if (args.apply or found == 0) else 1)
