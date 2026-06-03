"""
rag/pipeline/index_manager.py

Manages the document_chunks vector index lifecycle.

CLI:
    python -m rag.pipeline.index_manager build
    python -m rag.pipeline.index_manager stats
    python -m rag.pipeline.index_manager clear
"""

import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

from rag.pipeline.chunker import (  # noqa: E402
    chunk_all,
    chunk_deputies,
    chunk_global_stats,
    chunk_notable_deputies,
    chunk_party_summaries,
    chunk_votes,
)
from rag.pipeline.embedder import embed_and_store  # noqa: E402

DATABASE_URL = os.getenv("DATABASE_URL")


def _get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def build_index(since: str | None = None) -> None:
    """Build or incrementally update the document_chunks index.

    Without `since`: full rebuild (truncate + re-embed everything).
    With `since`: only embed new votes, refresh affected deputy chunks,
    and always refresh the small aggregate chunks (party/global/notable).
    """
    if since is None:
        print("Clearing existing index...")
        clear_index()

        print("Step 1/3: Building base chunks...")
        chunks = chunk_all()
        print(f"Starting embedding — {len(chunks)} chunks to process.\n")
        embed_and_store(chunks)

        print("\nStep 2/3: Building notable deputy chunks...")
        from rag.pipeline.chunk_notable_deputies import build_notable_deputy_index

        build_notable_deputy_index(100)

        print("\nStep 3/3: Building law summary chunks...")
        from rag.pipeline.chunk_law_summaries import build_law_summary_index

        build_law_summary_index(20)

        print("\nIndex build complete.")
        get_index_stats()
        return

    # --- Incremental path ---
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Vote IDs present in votes but not yet in document_chunks
            cur.execute(
                """
                SELECT v.vote_id
                FROM votes v
                WHERE v.voted_at >= %s
                  AND NOT EXISTS (
                      SELECT 1 FROM document_chunks dc
                      WHERE dc.metadata->>'chunk_type' = 'vote'
                        AND dc.metadata->>'vote_id' = v.vote_id
                  )
                """,
                (since,),
            )
            new_vote_ids = {r["vote_id"] for r in cur.fetchall()}

            if new_vote_ids:
                cur.execute(
                    "SELECT DISTINCT deputy_id FROM vote_positions WHERE vote_id = ANY(%s)",
                    (list(new_vote_ids),),
                )
                affected_deputy_ids = {r["deputy_id"] for r in cur.fetchall()}
            else:
                affected_deputy_ids = set()
    finally:
        conn.close()

    chunks: list[dict] = []

    if new_vote_ids:
        print(
            f"New votes to index: {len(new_vote_ids)}  Affected deputies: {len(affected_deputy_ids)}"
        )
        chunks += chunk_votes(vote_ids=new_vote_ids)
        # Delete stale deputy chunks and rebuild for affected deputies only
        _delete_chunks_by_ids("deputy", "deputy_id", affected_deputy_ids)
        chunks += chunk_deputies(deputy_ids=affected_deputy_ids)
    else:
        print(f"No new votes since {since} — skipping vote and deputy chunks.")

    # Aggregate chunks are always small (~15 total) and always stale after a run
    _delete_aggregate_chunks()
    chunks += chunk_party_summaries()
    chunks += chunk_global_stats()
    chunks += chunk_notable_deputies()

    if chunks:
        print(f"Embedding {len(chunks)} chunks...\n")
        embed_and_store(chunks)
    else:
        print("Nothing to embed.")


def _delete_chunks_by_ids(chunk_type: str, id_key: str, ids: set[str]) -> None:
    if not ids:
        return
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_chunks WHERE metadata->>'chunk_type' = %s AND metadata->>%s = ANY(%s)",
                (chunk_type, id_key, list(ids)),
            )
        conn.commit()
    finally:
        conn.close()


def _delete_aggregate_chunks() -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_chunks WHERE metadata->>'chunk_type' = ANY(%s)",
                (["party", "global_stats", "notable_deputy"],),
            )
        conn.commit()
    finally:
        conn.close()


def clear_index() -> None:
    """Truncate document_chunks and reset the sequence."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE document_chunks RESTART IDENTITY")
        conn.commit()
        print("document_chunks truncated.")
    finally:
        conn.close()


def get_index_stats() -> None:
    """Print chunk counts and average content length by chunk_type."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    metadata->>'chunk_type'      AS chunk_type,
                    COUNT(*)                     AS total_chunks,
                    ROUND(AVG(LENGTH(content)))  AS avg_content_chars
                FROM document_chunks
                GROUP BY metadata->>'chunk_type'
                ORDER BY chunk_type
                """
            )
            rows = cur.fetchall()

            cur.execute("SELECT COUNT(*) AS total FROM document_chunks")
            grand_total = cur.fetchone()["total"]
    finally:
        conn.close()

    if not rows:
        print("document_chunks is empty.")
        return

    print(f"\n{'chunk_type':<12} {'total_chunks':>14} {'avg_chars':>12}")
    print("-" * 42)
    for row in rows:
        print(
            f"{row['chunk_type'] or 'NULL':<12} "
            f"{row['total_chunks']:>14,} "
            f"{row['avg_content_chars']:>12}"
        )
    print("-" * 42)
    print(f"{'TOTAL':<12} {grand_total:>14,}")
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(prog="rag.pipeline.index_manager")
    sub = parser.add_subparsers(dest="command", required=True)

    build_p = sub.add_parser("build", help="Build or incrementally update the index")
    build_p.add_argument(
        "--since",
        default=None,
        metavar="YYYY-MM-DD",
        help="Incremental mode: only embed votes on/after this date",
    )
    sub.add_parser("stats", help="Print chunk counts by type")
    sub.add_parser("clear", help="Truncate document_chunks")

    args = parser.parse_args()

    if args.command == "build":
        if args.since:
            from datetime import date as _date

            try:
                _date.fromisoformat(args.since)
            except ValueError:
                parser.error(f"--since must be YYYY-MM-DD, got: {args.since!r}")
        build_index(since=args.since)
    elif args.command == "stats":
        get_index_stats()
    elif args.command == "clear":
        clear_index()
