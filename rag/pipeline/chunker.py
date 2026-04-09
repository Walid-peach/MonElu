"""
rag/pipeline/chunker.py

Produces two types of text chunks for embedding:
  - "vote"   : one chunk per scrutin (vote summary in French prose)
  - "deputy" : one chunk per deputy (voting record summary)

Each chunk is {"content": str, "metadata": dict}.
"""

import os
import warnings

import psycopg2
import psycopg2.extras
import tiktoken
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
TOKEN_WARN_THRESHOLD = 500

# text-embedding-3-small uses the cl100k_base tokenizer (same as ada-002)
_enc = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def _get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------------------------------------------------------------------
# Strategy A — Vote chunks
# ---------------------------------------------------------------------------

def _fmt_date(dt) -> str:
    """Format a date object as JJ/MM/AAAA."""
    if dt is None:
        return "date inconnue"
    return dt.strftime("%d/%m/%Y")


def chunk_votes() -> list[dict]:
    conn = _get_conn()
    chunks = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vote_id, vote_title, result, voted_at,
                       votes_for, votes_against, abstentions, total_voters
                FROM votes
                ORDER BY voted_at DESC
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    for row in rows:
        result_label = row["result"] or "résultat inconnu"
        content = (
            f"Vote du {_fmt_date(row['voted_at'])} : {row['vote_title']}.\n"
            f"Résultat : {result_label}.\n"
            f"{row['votes_for'] or 0} députés ont voté pour, "
            f"{row['votes_against'] or 0} contre, "
            f"{row['abstentions'] or 0} abstentions "
            f"sur {row['total_voters'] or 0} votants."
        )
        metadata = {
            "chunk_type": "vote",
            "vote_id": row["vote_id"],
            "voted_at": str(row["voted_at"]) if row["voted_at"] else None,
            "result": row["result"],
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Strategy B — Deputy summary chunks
# ---------------------------------------------------------------------------

def chunk_deputies() -> list[dict]:
    conn = _get_conn()
    chunks = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.deputy_id, d.full_name, d.party, d.department,
                       COUNT(vp.position_id) AS total_votes,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'pour')       AS pour_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'contre')     AS contre_count,
                       COUNT(vp.position_id) FILTER (WHERE vp.position = 'abstention') AS abstention_count,
                       ROUND(
                           COUNT(vp.position_id)::numeric
                           / NULLIF((SELECT COUNT(*) FROM votes), 0),
                           3
                       ) AS presence_rate
                FROM deputies d
                LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                GROUP BY d.deputy_id
                ORDER BY d.full_name
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    for row in rows:
        name      = row["full_name"] or "Député inconnu"
        dept      = row["department"] or "département inconnu"
        party     = row["party"] or "parti non renseigné"
        total     = int(row["total_votes"] or 0)
        pour      = int(row["pour_count"] or 0)
        contre    = int(row["contre_count"] or 0)
        abst      = int(row["abstention_count"] or 0)
        rate      = float(row["presence_rate"] or 0)
        rate_pct  = round(rate * 100, 1)

        content = (
            f"{name} est député(e) de {dept}, membre du parti {party}.\n"
            f"Sur {total} votes enregistrés, il/elle a voté pour {pour} fois, "
            f"contre {contre} fois, abstention {abst} fois.\n"
            f"Taux de présence : {rate_pct}%."
        )
        metadata = {
            "chunk_type": "deputy",
            "deputy_id": row["deputy_id"],
            "full_name": name,
            "party": party,
            "department": dept,
        }
        chunks.append({"content": content, "metadata": metadata})

    return chunks


# ---------------------------------------------------------------------------
# Combined
# ---------------------------------------------------------------------------

def chunk_all() -> list[dict]:
    vote_chunks   = chunk_votes()
    deputy_chunks = chunk_deputies()

    all_chunks = vote_chunks + deputy_chunks

    # Token accounting
    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens  = sum(token_counts)
    avg_tokens    = total_tokens / len(token_counts) if token_counts else 0

    oversized = [
        (i, t, all_chunks[i]["metadata"].get("chunk_type"))
        for i, t in enumerate(token_counts)
        if t > TOKEN_WARN_THRESHOLD
    ]

    print(f"\n{'='*50}")
    print(f"  Chunker summary")
    print(f"{'='*50}")
    print(f"  Vote chunks    : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks  : {len(deputy_chunks):>6,}")
    print(f"  Total chunks   : {len(all_chunks):>6,}")
    print(f"  Avg tokens     : {avg_tokens:>6.1f}")
    print(f"  Total tokens   : {total_tokens:>6,}")
    if oversized:
        warnings.warn(
            f"{len(oversized)} chunk(s) exceed {TOKEN_WARN_THRESHOLD} tokens "
            f"(max: {max(t for _, t, _ in oversized)} tokens)."
        )
    else:
        print(f"  Token check    : OK — all chunks within {TOKEN_WARN_THRESHOLD}-token limit")
    print(f"{'='*50}\n")

    return all_chunks


# ---------------------------------------------------------------------------
# CLI preview — run with: python -m rag.pipeline.chunker
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    print("Connecting to database and building chunks...")
    vote_chunks   = chunk_votes()
    deputy_chunks = chunk_deputies()
    all_chunks    = vote_chunks + deputy_chunks

    token_counts = [_count_tokens(c["content"]) for c in all_chunks]
    total_tokens = sum(token_counts)
    avg_tokens   = total_tokens / len(token_counts) if token_counts else 0

    oversized = [t for t in token_counts if t > TOKEN_WARN_THRESHOLD]

    print(f"\n{'='*56}")
    print(f"  CHUNKER REPORT")
    print(f"{'='*56}")
    print(f"  Vote chunks      : {len(vote_chunks):>6,}")
    print(f"  Deputy chunks    : {len(deputy_chunks):>6,}")
    print(f"  Total chunks     : {len(all_chunks):>6,}")
    print(f"  Avg tokens/chunk : {avg_tokens:>6.1f}")
    print(f"  Total tokens     : {total_tokens:>6,}")
    print(f"  Chunks > {TOKEN_WARN_THRESHOLD}t     : {len(oversized):>6,}")
    print(f"{'='*56}")

    print("\n--- SAMPLE: vote chunk ---")
    sample_vote = vote_chunks[0]
    print(f"Content:\n{sample_vote['content']}")
    print(f"Metadata: {json.dumps(sample_vote['metadata'], ensure_ascii=False, indent=2)}")
    print(f"Tokens: {_count_tokens(sample_vote['content'])}")

    print("\n--- SAMPLE: deputy chunk ---")
    # Find Yaël Braun-Pivet for a meaningful sample
    braun_pivet = next(
        (c for c in deputy_chunks if "Braun-Pivet" in c["content"]),
        deputy_chunks[0],
    )
    print(f"Content:\n{braun_pivet['content']}")
    print(f"Metadata: {json.dumps(braun_pivet['metadata'], ensure_ascii=False, indent=2)}")
    print(f"Tokens: {_count_tokens(braun_pivet['content'])}")

    # Estimated embedding cost (for reference — not running embeddings)
    cost_estimate = total_tokens * 0.00002 / 1000
    print(f"\n  Estimated embedding cost: ${cost_estimate:.4f}")
    print(f"  (text-embedding-3-small @ $0.020 per 1M tokens)\n")
