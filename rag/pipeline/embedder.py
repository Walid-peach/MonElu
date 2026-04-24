"""
rag/pipeline/embedder.py

Embeds text chunks via OpenAI text-embedding-3-small and stores them in
document_chunks (pgvector on Supabase / local Postgres).

Assumes the table is empty before calling embed_and_store — callers are
responsible for truncating first (index_manager.build_index does this).
"""

import os
import time

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg2 import register_vector

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
EMBEDDING_MODEL = "text-embedding-3-small"
COST_PER_1M_TOKENS = 0.020  # USD


def _embed_batch(client: OpenAI, texts: list[str], max_retries: int = 3):
    """Returns (embeddings, tokens_used). Retries on 429 with exponential backoff."""
    for attempt in range(max_retries):
        try:
            response = client.embeddings.create(input=texts, model=EMBEDDING_MODEL)
            embeddings = [item.embedding for item in response.data]
            tokens_used = response.usage.total_tokens
            return embeddings, tokens_used
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                wait = 2**attempt
                print(f"  Rate limit — retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


def embed_and_store(chunks: list[dict], batch_size: int = 100) -> None:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    total_batches = (len(chunks) + batch_size - 1) // batch_size
    grand_total_tokens = 0
    grand_total_stored = 0

    for batch_idx in range(total_batches):
        start = batch_idx * batch_size
        batch = chunks[start : start + batch_size]

        texts = [c["content"] for c in batch]
        embeddings, tokens_used = _embed_batch(client, texts)

        conn = psycopg2.connect(DATABASE_URL)
        try:
            register_vector(conn)
            with conn.cursor() as cur:
                records = [
                    (
                        chunk["content"],
                        psycopg2.extras.Json(chunk["metadata"]),
                        np.array(embedding, dtype=np.float32),
                    )
                    for chunk, embedding in zip(batch, embeddings, strict=False)
                ]
                psycopg2.extras.execute_batch(
                    cur,
                    """
                    INSERT INTO document_chunks (content, metadata, embedding)
                    VALUES (%s, %s, %s)
                    """,
                    records,
                )
            conn.commit()
        finally:
            conn.close()

        grand_total_tokens += tokens_used
        grand_total_stored += len(batch)
        cost_so_far = grand_total_tokens * COST_PER_1M_TOKENS / 1_000_000
        print(
            f"Batch {batch_idx + 1}/{total_batches} — "
            f"{len(batch)} chunks stored "
            f"(cumulative: {grand_total_stored}, ${cost_so_far:.4f})"
        )

    total_cost = grand_total_tokens * COST_PER_1M_TOKENS / 1_000_000
    print(f"\nDone. {grand_total_stored} chunks stored.")
    print(f"Total tokens : {grand_total_tokens:,}")
    print(f"Estimated cost : ${total_cost:.4f}")
