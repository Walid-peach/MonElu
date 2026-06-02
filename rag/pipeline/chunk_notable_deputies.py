"""
Generates detailed chunks for the top 100 deputies by vote count.
Only embeds chunks not already in document_chunks.
Run standalone: python -m rag.pipeline.chunk_notable_deputies
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
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_top_deputies(n: int = 100) -> list[dict]:
    """Get top N deputies by vote count."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    d.deputy_id,
                    d.full_name,
                    d.party,
                    d.department,
                    COUNT(vp.position_id) as total_votes,
                    COUNT(vp.position_id) FILTER (
                        WHERE vp.position = 'pour'
                    ) as pour,
                    COUNT(vp.position_id) FILTER (
                        WHERE vp.position = 'contre'
                    ) as contre,
                    COUNT(vp.position_id) FILTER (
                        WHERE vp.position = 'abstention'
                    ) as abstention,
                    ROUND(
                        COUNT(vp.position_id) FILTER (
                            WHERE vp.position IN ('pour','contre','abstention')
                        )::numeric / NULLIF(
                            (SELECT COUNT(*) FROM votes), 0
                        ) * 100, 1
                    ) as presence_pct
                FROM deputies d
                JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
                WHERE d.party IS NOT NULL
                GROUP BY d.deputy_id
                ORDER BY total_votes DESC
                LIMIT %s
            """,
                (n,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_key_votes(deputy_id: str) -> list[dict]:
    """Get up to 20 most recent votes + any PLFSS/PLF/censure votes."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                (
                  SELECT v.vote_title, v.voted_at, v.result, vp.position
                  FROM vote_positions vp
                  JOIN votes v ON vp.vote_id = v.vote_id
                  WHERE vp.deputy_id = %s
                  ORDER BY v.voted_at DESC LIMIT 10
                )
                UNION
                (
                  SELECT v.vote_title, v.voted_at, v.result, vp.position
                  FROM vote_positions vp
                  JOIN votes v ON vp.vote_id = v.vote_id
                  WHERE vp.deputy_id = %s
                  AND (
                    v.vote_title ILIKE '%%PLFSS%%'
                    OR v.vote_title ILIKE '%%loi de finances%%'
                    OR v.vote_title ILIKE '%%censure%%'
                    OR v.vote_title ILIKE '%%motion de rejet%%'
                  )
                  ORDER BY v.voted_at DESC LIMIT 10
                )
                ORDER BY voted_at DESC
                LIMIT 20
            """,
                (deputy_id, deputy_id),
            )
            return [dict(r) for r in cur.fetchall()]


def dept_prep(dept: str) -> str:
    """French preposition for department name."""
    if not dept:
        return "de"
    d = dept.strip()
    plurals = [
        "Yvelines",
        "Vosges",
        "Landes",
        "Hautes",
        "Bouches",
        "Alpes",
        "Pyrénées",
        "Côtes",
        "Hauts",
    ]
    if any(d.startswith(p) for p in plurals):
        return "des"
    if d[0].lower() in "aeiouàâéèêëîïôùûü":
        return "de l'"
    return "du"


def build_chunk(deputy: dict, votes: list[dict]) -> str:
    """Format deputy + votes as French prose chunk."""
    dept = deputy.get("department") or "département non renseigné"
    party = deputy.get("party") or "groupe non renseigné"
    presence = deputy.get("presence_pct") or 0

    lines = [
        f"{deputy['full_name']} est député(e) {dept_prep(dept)} {dept}, membre du parti {party}.",
        f"Sur {deputy['total_votes']} votes enregistrés : "
        f"{deputy['pour']} pour, {deputy['contre']} contre, "
        f"{deputy['abstention']} abstentions.",
        f"Taux de présence : {presence}%.",
        "",
        "Votes récents et votes clés :",
    ]

    for v in votes:
        date = (
            v["voted_at"].strftime("%d/%m/%Y")
            if hasattr(v["voted_at"], "strftime")
            else str(v["voted_at"])[:10]
        )
        title = v["vote_title"][:80]
        pos_map = {
            "pour": "POUR",
            "contre": "CONTRE",
            "abstention": "ABSTENTION",
            "nonvotant": "NON VOTANT",
        }
        pos = pos_map.get(v["position"], v["position"].upper())
        lines.append(f"- {date} : {title}… → {pos} (vote {v['result']})")

    return "\n".join(lines)


def already_indexed(deputy_id: str) -> bool:
    """Check if a notable_deputy chunk already exists."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM document_chunks
                WHERE metadata->>'deputy_id' = %s
                  AND metadata->>'chunk_type' = 'notable_deputy'
                LIMIT 1
            """,
                (deputy_id,),
            )
            return cur.fetchone() is not None


def embed_and_store_chunk(content: str, metadata: dict, client: OpenAI) -> None:
    """Embed one chunk and insert into document_chunks."""
    response = client.embeddings.create(input=[content], model="text-embedding-3-small")
    embedding = np.array(response.data[0].embedding, dtype=np.float32)

    with psycopg2.connect(DATABASE_URL) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO document_chunks (content, metadata, embedding)
                VALUES (%s, %s, %s)
            """,
                (content, psycopg2.extras.Json(metadata), embedding),
            )
        conn.commit()


def build_notable_deputy_index(n: int = 100) -> dict:
    """Main function — build chunks for top N deputies."""
    client = OpenAI(api_key=OPENAI_API_KEY)
    deputies = get_top_deputies(n)

    stats = {"new": 0, "skipped": 0, "errors": 0}
    notable_map = {}

    for i, dep in enumerate(deputies):
        deputy_id = dep["deputy_id"]
        full_name = dep["full_name"]
        notable_map[deputy_id] = full_name

        if already_indexed(deputy_id):
            stats["skipped"] += 1
            continue

        try:
            votes = get_key_votes(deputy_id)
            content = build_chunk(dep, votes)
            metadata = {
                "chunk_type": "notable_deputy",
                "deputy_id": deputy_id,
                "full_name": full_name,
                "party": dep.get("party"),
                "department": dep.get("department"),
            }
            embed_and_store_chunk(content, metadata, client)
            stats["new"] += 1
            print(f"[{i + 1}/{len(deputies)}] Embedded: {full_name}")
        except Exception as e:
            stats["errors"] += 1
            print(f"Error on {full_name}: {e}")

    return {"stats": stats, "notable_map": notable_map}


if __name__ == "__main__":
    result = build_notable_deputy_index(100)
    s = result["stats"]
    print(f"\nDone. New: {s['new']} | Skipped: {s['skipped']} | Errors: {s['errors']}")
    print(f"Notable deputy map: {len(result['notable_map'])} deputies")
