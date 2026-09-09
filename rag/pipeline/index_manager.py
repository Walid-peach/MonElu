"""
rag/pipeline/index_manager.py

Manages the document_chunks vector index lifecycle.

CLI:
    python -m rag.pipeline.index_manager build
    python -m rag.pipeline.index_manager stats
    python -m rag.pipeline.index_manager clear
"""

import os
import signal
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from psycopg2 import sql

load_dotenv()

from rag.pipeline.chunker import chunk_all  # noqa: E402
from rag.pipeline.embedder import embed_and_store  # noqa: E402

DATABASE_URL = os.getenv("DATABASE_URL")

_STAGING_TABLE = "document_chunks_staging"


def _get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


class BuildInterrupted(Exception):
    """A termination signal arrived while a build was in flight.

    Raised from the SIGTERM/SIGINT handler installed by
    `_raise_on_termination` so that the staging-table cleanup in
    `_build_full_index_atomic` runs on the way out (MON-256).
    """


@contextmanager
def _raise_on_termination():
    """Turn SIGTERM/SIGINT into `BuildInterrupted` for the duration of the block.

    A GitHub Actions job timeout (`ingest_prod.yml`, `timeout-minutes: 30`) and
    a cancelled workflow both send SIGTERM before SIGKILL. Under the default
    disposition that kills the process outright, so the `except`/`finally`
    cleanup never runs and `document_chunks_staging` survives with however many
    vector(1536) rows were embedded - tens of MB held against a 500 MB tier
    until the next successful build drops it (MON-256).

    SIGKILL cannot be caught. That residual orphan is what
    `staging_chunk_count()` and /health's `rag_staging_chunks` exist to surface.
    """

    def _handler(signum, _frame):
        raise BuildInterrupted(f"build interrupted by signal {signum}")

    previous: dict[int, object] = {}
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            previous[sig] = signal.signal(sig, _handler)
    except ValueError:
        # signal.signal() only works on the main thread. A build driven from a
        # worker thread keeps the default disposition rather than failing.
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        previous = {}

    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def build_index() -> None:
    """Rebuild the document_chunks index from scratch.

    Chunks are embedded into a staging table and swapped in atomically at the
    end (`ALTER TABLE ... RENAME`), so a mid-run failure (OpenAI outage,
    Groq-dependent notable chunker error, the job's timeout) leaves the live
    document_chunks untouched - /search keeps serving the previous index until
    a build fully succeeds.

    There is no incremental mode: the daily cron has rebuilt in full since
    MON-218/MON-233, and the `--since` path that once existed wrote directly to
    the live table, contradicting that atomic-swap contract (ADR-037, MON-256).
    """
    _build_full_index_atomic()


def _create_staging_table() -> None:
    """(Re)create the empty staging table the build embeds into."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(_STAGING_TABLE)))
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE {} (
                        id          BIGSERIAL PRIMARY KEY,
                        content     TEXT NOT NULL,
                        metadata    JSONB DEFAULT '{{}}',
                        embedding   vector(1536),
                        created_at  TIMESTAMPTZ DEFAULT NOW()
                    )
                    """
                ).format(sql.Identifier(_STAGING_TABLE))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {} ENABLE ROW LEVEL SECURITY").format(
                    sql.Identifier(_STAGING_TABLE)
                )
            )
        conn.commit()
    finally:
        conn.close()


def _populate_staging_table() -> None:
    """Embed every chunk type into the staging table."""
    print("Step 1/3: Building base chunks...")
    chunks = chunk_all()
    print(f"Starting embedding — {len(chunks)} chunks to process.\n")
    embed_and_store(chunks, table=_STAGING_TABLE)

    print("\nStep 2/3: Building notable deputy chunks...")
    from rag.pipeline.chunk_notable_deputies import build_notable_deputy_index

    build_notable_deputy_index(100, table=_STAGING_TABLE)

    print("\nStep 3/3: Building law summary chunks...")
    from rag.pipeline.chunk_law_summaries import build_law_summary_index

    build_law_summary_index(20, table=_STAGING_TABLE)


def _build_full_index_atomic() -> None:
    """Build a full index into a staging table, then swap it in atomically.

    document_chunks is never truncated or emptied while the build is in
    flight. Every exit path that did not complete the swap drops the staging
    table, so the live index is left exactly as it was and no orphaned copy of
    the vectors is left behind (MON-256).
    """
    swapped = False
    try:
        with _raise_on_termination():
            # Inside the guard, not before it: the CREATE is committed on its
            # own, so a signal landing between it and the first embed would
            # otherwise leave an empty orphan behind.
            _create_staging_table()
            _populate_staging_table()
            print("\nSwapping in the new index...")
            _swap_in_staging_table()
            swapped = True
    finally:
        if not swapped:
            print(f"\nBuild did not complete - dropping {_STAGING_TABLE}, live index untouched.")
            try:
                _drop_staging_table()
            except Exception as exc:  # never mask the failure that got us here
                print(f"Could not drop {_STAGING_TABLE}: {exc}")

    print("Index build complete.")
    get_index_stats()


def _drop_staging_table() -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(_STAGING_TABLE)))
        conn.commit()
    finally:
        conn.close()


def _swap_in_staging_table() -> None:
    """Atomically replace document_chunks with the staging table's contents."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE document_chunks RENAME TO document_chunks_old")
            cur.execute(
                sql.SQL("ALTER TABLE {} RENAME TO document_chunks").format(
                    sql.Identifier(_STAGING_TABLE)
                )
            )
            cur.execute("DROP TABLE document_chunks_old")
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


def staging_chunk_count() -> int | None:
    """Row count of the staging table, or None when the table does not exist.

    Outside a running build a non-None value is an orphan left by a rebuild
    that was killed before it could clean up - at ~6 KB per vector(1536) row
    that is tens of MB held against the Supabase free tier's 500 MB cap
    (MON-256, MON-225). It self-heals on the next successful build, which
    recreates the table from scratch; this exists so the cost is visible
    rather than inferred from /health's db_size_mb.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass(%s) AS oid", (f"public.{_STAGING_TABLE}",))
            if cur.fetchone()["oid"] is None:
                return None
            cur.execute(
                sql.SQL("SELECT COUNT(*) AS total FROM {}").format(sql.Identifier(_STAGING_TABLE))
            )
            return cur.fetchone()["total"]
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

    staging = staging_chunk_count()

    if not rows:
        print("document_chunks is empty.")
        _print_staging_state(staging)
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
    _print_staging_state(staging)


def _print_staging_state(staging: int | None) -> None:
    """Report the staging table, which should not exist outside a build (MON-256)."""
    if staging is None:
        print(f"{_STAGING_TABLE}: absent (expected).")
    else:
        print(
            f"WARNING: {_STAGING_TABLE} exists with {staging:,} rows. "
            "If no build is running, this is an orphan from a killed rebuild - "
            "it holds a second copy of the vectors until the next successful build."
        )
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(prog="rag.pipeline.index_manager")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("build", help="Rebuild the index from scratch")
    sub.add_parser("stats", help="Print chunk counts by type")
    sub.add_parser("clear", help="Truncate document_chunks")

    args = parser.parse_args()

    if args.command == "build":
        build_index()
    elif args.command == "stats":
        get_index_stats()
    elif args.command == "clear":
        clear_index()
