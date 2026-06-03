"""
Generates one chunk per major law showing how each party voted.
Targets the top 20 votes by total voter turnout.
Run: python -m rag.pipeline.chunk_law_summaries
"""

import os

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg2 import register_vector

from rag.constants import EMBEDDING_MODEL
from rag.db_utils import connect_with_retry

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_top_votes(n: int = 20) -> list[dict]:
    """Get top N votes by total voter turnout."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    vote_id, vote_title, result,
                    voted_at, votes_for, votes_against,
                    abstentions, total_voters
                FROM votes
                ORDER BY total_voters DESC
                LIMIT %s
                """,
                (n,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_party_breakdown(vote_id: str) -> list[dict]:
    """Get party-level vote breakdown for a given vote."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    d.party,
                    COUNT(*) FILTER (WHERE vp.position = 'pour') AS pour,
                    COUNT(*) FILTER (WHERE vp.position = 'contre') AS contre,
                    COUNT(*) FILTER (WHERE vp.position = 'abstention') AS abstention,
                    COUNT(*) AS total
                FROM vote_positions vp
                JOIN deputies d ON vp.deputy_id = d.deputy_id
                WHERE vp.vote_id = %s
                  AND d.party IS NOT NULL
                  AND vp.position IN ('pour', 'contre', 'abstention')
                GROUP BY d.party
                ORDER BY total DESC
                """,
                (vote_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def build_law_chunk(vote: dict, breakdown: list[dict]) -> str:
    """Format vote + party breakdown as French prose."""
    voted_at = vote["voted_at"]
    date = voted_at.strftime("%d/%m/%Y") if hasattr(voted_at, "strftime") else str(voted_at)[:10]

    lines = [
        f"Vote du {date} : {vote['vote_title']}",
        (
            f"Résultat : {vote['result']} "
            f"({vote['votes_for']} pour, "
            f"{vote['votes_against']} contre, "
            f"{vote['abstentions']} abstentions "
            f"sur {vote['total_voters']} votants)."
        ),
        "",
        "Positions par groupe parlementaire :",
    ]
    for p in breakdown:
        lines.append(
            f"- {p['party']} : {p['pour']} pour, {p['contre']} contre, {p['abstention']} abstentions"
        )
    return "\n".join(lines)


def already_indexed(vote_id: str) -> bool:
    """Check if a law_summary chunk already exists for this vote."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM document_chunks
                WHERE metadata->>'vote_id' = %s
                  AND metadata->>'chunk_type' = 'law_summary'
                LIMIT 1
                """,
                (vote_id,),
            )
            return cur.fetchone() is not None


def embed_and_store(content: str, metadata: dict, client: OpenAI) -> None:
    """Embed one chunk and insert into document_chunks.
    Callers must check already_indexed() before calling — document_chunks
    has no unique constraint so duplicate prevention is the caller's job."""
    response = client.embeddings.create(input=[content], model=EMBEDDING_MODEL)
    embedding = np.array(response.data[0].embedding, dtype=np.float32)

    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extensions.cursor) as plain_cur:
            register_vector(plain_cur)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO document_chunks (content, metadata, embedding)
                VALUES (%s, %s, %s)
                """,
                (content, psycopg2.extras.Json(metadata), embedding),
            )
        conn.commit()
    finally:
        conn.close()


def build_law_summary_index(n: int = 20) -> dict:
    """Embed and store law summary chunks for the top-N votes by turnout."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    votes = get_top_votes(n)
    stats = {"new": 0, "skipped": 0, "errors": 0}

    for i, vote in enumerate(votes):
        vote_id = vote["vote_id"]
        title_short = vote["vote_title"][:60]

        if already_indexed(vote_id):
            stats["skipped"] += 1
            print(f"[{i+1}/{n}] Skipped (already indexed): {title_short}...")
            continue

        try:
            breakdown = get_party_breakdown(vote_id)
            if not breakdown:
                print(f"[{i+1}/{n}] No party data, skipping: {title_short}...")
                continue

            content = build_law_chunk(vote, breakdown)
            metadata = {
                "chunk_type": "law_summary",
                "vote_id": vote_id,
                "vote_title": vote["vote_title"][:100],
                "result": vote["result"],
                "voted_at": str(vote["voted_at"])[:10],
            }
            embed_and_store(content, metadata, client)
            stats["new"] += 1
            print(f"[{i+1}/{n}] Embedded: {title_short}...")
            if i == 0:
                print("\n--- Sample chunk content ---")
                print(content)
                print("----------------------------\n")
        except Exception as e:
            stats["errors"] += 1
            print(f"[{i+1}/{n}] Error on {title_short}: {e}")

    return stats


if __name__ == "__main__":
    stats = build_law_summary_index(20)
    print(f"\nDone. New: {stats['new']} | Skipped: {stats['skipped']} | Errors: {stats['errors']}")
