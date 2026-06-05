"""
rag/chain/retriever.py

Retrieves relevant chunks from document_chunks using cosine similarity
via pgvector. The query is embedded with the same model used at index time.
"""

import logging
import os
import re
import threading
from functools import lru_cache

import numpy as np
import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg2 import register_vector

from rag.constants import EMBEDDING_MODEL, IVFFLAT_PROBES

log = logging.getLogger(__name__)

# Must run before os.getenv() calls below so .env is loaded before module-level vars are set.
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

_openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

_retriever_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_retriever_pool_lock = threading.Lock()


def _get_retriever_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _retriever_pool
    if _retriever_pool is None:
        with _retriever_pool_lock:
            if _retriever_pool is None:
                _retriever_pool = psycopg2.pool.ThreadedConnectionPool(1, 3, dsn=DATABASE_URL)
    return _retriever_pool


@lru_cache(maxsize=1)
def get_notable_deputy_ids() -> dict:
    """
    Fetch all notable_deputy chunk deputy_ids from document_chunks.
    Returns {deputy_id: full_name} for all indexed notable deputies.
    """
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT DISTINCT
                    metadata->>'deputy_id' as deputy_id,
                    metadata->>'full_name' as full_name
                FROM document_chunks
                WHERE metadata->>'chunk_type' = 'notable_deputy'
            """
            )
            return {r["deputy_id"]: r["full_name"] for r in cur.fetchall()}


def detect_notable_deputy(question: str, notable_map: dict) -> str | None:
    """
    Check if the question mentions a notable deputy by name.
    Matches on last name only (final word of full_name) to avoid false positives
    from common French words that happen to be first names (marine, jean, etc.).
    Returns deputy_id if found, None otherwise.
    """
    q_lower = question.lower()
    for deputy_id, full_name in notable_map.items():
        last_name = full_name.lower().split()[-1]
        if len(last_name) >= 3 and re.search(r"\b" + re.escape(last_name) + r"\b", q_lower):
            return deputy_id
    return None


def detect_result_filter(question: str) -> str | None:
    q = question.lower()
    if any(w in q for w in ["adopté", "adoptés", "adoption"]):
        return "adopté"
    if any(w in q for w in ["rejeté", "rejetés", "rejet", "échoué"]):
        return "rejeté"
    return None


def retrieve(
    question: str,
    k: int = 5,
    chunk_type: str = None,
    deputy_id: str = None,
) -> list[dict]:
    result_filter = detect_result_filter(question)

    notable_id = None
    if not deputy_id:
        notable_map = get_notable_deputy_ids()
        notable_id = detect_notable_deputy(question, notable_map)
        if notable_id:
            log.debug("[retriever] Notable deputy pinned: %s", notable_map[notable_id])

    response = _openai_client.embeddings.create(input=[question], model=EMBEDDING_MODEL)
    query_vector = np.array(response.data[0].embedding, dtype=np.float32)

    pool = _get_retriever_pool()
    conn = pool.getconn()
    broken = False
    try:
        # register_vector must receive a plain cursor — RealDictCursor breaks
        # its internal dict(fetchall()) unpacking
        with conn.cursor(cursor_factory=psycopg2.extensions.cursor) as plain_cur:
            register_vector(plain_cur)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Inject the notable-deputy chunk first (bypasses IVFFlat recall gap)
            pinned = []
            if notable_id:
                cur.execute(
                    """
                    SELECT content, metadata,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM document_chunks
                    WHERE metadata->>'chunk_type' = 'notable_deputy'
                      AND metadata->>'deputy_id' = %s
                    """,
                    (query_vector, notable_id),
                )
                for row in cur.fetchall():
                    pinned.append(
                        {
                            "content": row["content"],
                            "metadata": dict(row["metadata"]),
                            "similarity": float(row["similarity"]),
                        }
                    )

            semantic_k = k - len(pinned)
            pinned_ids = {p["metadata"].get("deputy_id") for p in pinned}
            cur.execute("SET LOCAL ivfflat.probes = %s", (IVFFLAT_PROBES,))
            cur.execute(
                """
                SELECT content, metadata,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM document_chunks
                WHERE (%s IS NULL OR metadata->>'chunk_type' = %s)
                  AND (%s IS NULL OR metadata->>'deputy_id' = %s)
                  AND (%s IS NULL OR metadata->>'result' IS NULL OR metadata->>'result' = %s)
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (
                    query_vector,
                    chunk_type,
                    chunk_type,
                    deputy_id,
                    deputy_id,
                    result_filter,
                    result_filter,
                    query_vector,
                    semantic_k + len(pinned),
                ),
            )
            semantic_rows = [
                {
                    "content": row["content"],
                    "metadata": dict(row["metadata"]),
                    "similarity": float(row["similarity"]),
                }
                for row in cur.fetchall()
                if row["metadata"].get("deputy_id") not in pinned_ids
                or row["metadata"].get("chunk_type") != "notable_deputy"
            ]
    except Exception:
        broken = True
        raise
    finally:
        pool.putconn(conn, close=broken)

    results = (pinned + semantic_rows)[:k]

    top_sim = results[0]["similarity"] if results else 0.0
    log.debug(
        "Retrieved %d chunks — top similarity: %.3f (result_filter=%s)",
        len(results),
        top_sim,
        result_filter,
    )
    return results


if __name__ == "__main__":
    chunks = retrieve("Yaël Braun-Pivet présence votes")
    for c in chunks:
        print(f"[{c['similarity']:.3f}] {c['content'][:100]}")
