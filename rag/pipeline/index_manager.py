"""
rag/pipeline/index_manager.py

Manages the document_chunks vector index lifecycle.

CLI:
    python -m rag.pipeline.index_manager build
    python -m rag.pipeline.index_manager stats
    python -m rag.pipeline.index_manager clear
"""

import os
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from rag.pipeline.chunker import chunk_all
from rag.pipeline.embedder import embed_and_store

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def _get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def build_index() -> None:
    """Truncate document_chunks, regenerate all chunks, embed and store."""
    print("Clearing existing index...")
    clear_index()

    print("Building chunks from database...")
    chunks = chunk_all()
    print(f"Starting embedding — {len(chunks)} chunks to process.\n")

    embed_and_store(chunks)


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
    commands = {"build": build_index, "stats": get_index_stats, "clear": clear_index}

    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        print(f"Usage: python -m rag.pipeline.index_manager [{' | '.join(commands)}]")
        sys.exit(1)

    commands[sys.argv[1]]()
