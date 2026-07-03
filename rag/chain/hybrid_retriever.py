"""
Hybrid retriever: BM25 (keyword) + pgvector (semantic).
Strategy: pgvector fetches top-20 candidates, BM25 reranks to top-k.
Reranking only the pgvector candidates is cheaper than full-corpus BM25
and still captures exact keyword matches that cosine similarity misses.
"""

import logging
import os
import re

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg2 import register_vector
from rank_bm25 import BM25Okapi

from rag.chain.retriever import detect_recency_intent
from rag.constants import EMBEDDING_MODEL
from rag.db_utils import connect_with_retry

load_dotenv()

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")


def _tokenize(text: str) -> list[str]:
    """Lowercase French tokenizer — splits on non-alpha (handles accents)."""
    return re.findall(r"[a-záàâäéèêëíìîïóòôöúùûüçñ]+", text.lower())


def _embed(question: str) -> np.ndarray:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.embeddings.create(input=[question], model=EMBEDDING_MODEL)
    return np.array(response.data[0].embedding, dtype=np.float32)


def _get_candidates(
    question_vector: np.ndarray,
    k_candidates: int,
    chunk_type: str | None,
    deputy_id: str | None,
    result_filter: str | None,
    recency: bool = False,
) -> list[dict]:
    """Fetch top-k_candidates by cosine similarity (candidate pool for BM25 reranking)."""
    conn = connect_with_retry(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with conn.cursor(cursor_factory=psycopg2.extensions.cursor) as plain_cur:
            register_vector(plain_cur)
        with conn.cursor() as cur:
            # exact cosine scan — the IVFFlat index was dropped in
            # migration 003, no probes GUC to set
            cur.execute(
                """
                SELECT content, metadata,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM document_chunks
                WHERE (%s IS NULL OR metadata->>'chunk_type' = %s)
                  AND (%s IS NULL OR metadata->>'deputy_id' = %s)
                  AND (%s IS NULL OR metadata->>'result' IS NULL
                       OR metadata->>'result' = %s)
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (
                    question_vector,
                    chunk_type,
                    chunk_type,
                    deputy_id,
                    deputy_id,
                    result_filter,
                    result_filter,
                    question_vector,
                    k_candidates,
                ),
            )
            return [
                {
                    "content": row["content"],
                    "metadata": dict(row["metadata"]),
                    "similarity": float(row["similarity"]),
                }
                for row in cur.fetchall()
            ]
    finally:
        conn.close()


def _bm25_rerank(
    question: str,
    candidates: list[dict],
    k: int,
    alpha: float,
) -> list[dict]:
    """
    Hybrid score = alpha * norm_bm25 + (1-alpha) * cosine_similarity.
    Returns top-k by hybrid score.
    """
    if not candidates:
        return []

    tokenized_corpus = [_tokenize(c["content"]) for c in candidates]
    bm25 = BM25Okapi(tokenized_corpus)
    bm25_scores = bm25.get_scores(_tokenize(question))

    max_score = max(bm25_scores) if bm25_scores.max() > 0 else 1.0
    norm_bm25 = bm25_scores / max_score

    for i, chunk in enumerate(candidates):
        cosine = float(chunk.get("similarity", 0.0))
        chunk["bm25_score"] = round(float(norm_bm25[i]), 4)
        chunk["hybrid_score"] = round(alpha * float(norm_bm25[i]) + (1 - alpha) * cosine, 4)

    ranked = sorted(candidates, key=lambda x: x["hybrid_score"], reverse=True)
    log.debug(
        "[hybrid] top-3 hybrid scores: %s",
        [r["hybrid_score"] for r in ranked[:3]],
    )
    return ranked[:k]


def retrieve_hybrid(
    question: str,
    k: int = 5,
    chunk_type: str = None,
    deputy_id: str = None,
    alpha: float = 0.5,
    result_filter: str = None,
) -> list[dict]:
    """
    Hybrid retrieval: pgvector candidate fetch + BM25 rerank.
    Drop-in replacement for retrieve() in retriever.py.
    """
    recency = detect_recency_intent(question)
    question_vector = _embed(question)
    # Widen the candidate pool for recency questions — same rationale as
    # retriever.py: cosine/BM25 relevance alone won't surface what's recent.
    candidates = _get_candidates(
        question_vector,
        k_candidates=min(80, k * 16) if recency else min(20, k * 4),
        chunk_type=chunk_type,
        deputy_id=deputy_id,
        result_filter=result_filter,
    )
    ranked = _bm25_rerank(question, candidates, k=k * 4 if recency else k, alpha=alpha)
    if not recency:
        return ranked[:k]
    dated = [r for r in ranked if r["metadata"].get("voted_at")]
    undated = [r for r in ranked if not r["metadata"].get("voted_at")]
    dated.sort(key=lambda r: r["metadata"]["voted_at"], reverse=True)
    return (dated + undated)[:k]
