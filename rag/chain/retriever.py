"""
rag/chain/retriever.py

Retrieves relevant chunks from document_chunks using cosine similarity
via pgvector. The query is embedded with the same model used at index time.
"""

import os

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg2 import register_vector

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
EMBEDDING_MODEL = "text-embedding-3-small"


NOTABLE_DEPUTY_NAMES = {
    "attal": "PA722190",
    "le pen": "PA720614",
}


def detect_notable_deputy(question: str) -> str | None:
    q = question.lower()
    for name, deputy_id in NOTABLE_DEPUTY_NAMES.items():
        if name in q:
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
    notable_id = detect_notable_deputy(question) if not deputy_id else None

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.embeddings.create(input=[question], model=EMBEDDING_MODEL)
    query_vector = np.array(response.data[0].embedding, dtype=np.float32)

    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # register_vector must receive a plain cursor — RealDictCursor breaks
        # its internal dict(fetchall()) unpacking
        with conn.cursor(cursor_factory=psycopg2.extensions.cursor) as plain_cur:
            register_vector(plain_cur)
        with conn.cursor() as cur:
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
            cur.execute("SET LOCAL ivfflat.probes = 10")
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
    finally:
        conn.close()

    results = (pinned + semantic_rows)[:k]

    top_sim = results[0]["similarity"] if results else 0.0
    print(
        f"Retrieved {len(results)} chunks — top similarity: {top_sim:.3f} (result_filter={result_filter})"
    )
    return results


if __name__ == "__main__":
    chunks = retrieve("Yaël Braun-Pivet présence votes")
    for c in chunks:
        print(f"[{c['similarity']:.3f}] {c['content'][:100]}")
