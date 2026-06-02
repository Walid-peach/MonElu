"""
SQL router — detects aggregation questions and answers them
directly from Postgres. Zero LLM, zero hallucination.
Returns None if the question is not an aggregation query
so the caller falls back to standard RAG.
"""

import os
import re

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

PATTERNS = [
    (r"combien de dép.*(groupe|parti)", "deputy_count_by_party"),
    (r"combien.*groupe|combien.*parti", "deputy_count_by_party"),
    (r"(quel groupe|quel parti).*(abstien|abstention|plus d.abstention)", "party_abstention_rate"),
    (r"(qui|quel).*(abstient|abstentions).*(plus|davantage|le plus)", "party_abstention_rate"),
    (r"(quel groupe|quel parti).*(présence|particip|vote le plus)", "party_presence_rate"),
    (r"taux de présence.*(groupe|parti|moyen|chaque)", "party_presence_rate"),
    (r"combien de votes.*(adopté|rejeté|total)", "vote_result_count"),
    (r"combien.*(adopté|rejeté)", "vote_result_count"),
    (r"(nombre|total).*(votes|scrutins)", "vote_result_count"),
    (r"(quel groupe|quel parti).*(discipline|cohésion|alignement)", "party_alignment"),
    (r"qui vote.*(toujours|souvent|jamais).*(avec|contre).*(parti|groupe)", "party_alignment"),
]

SQL_QUERIES = {
    "deputy_count_by_party": """
        SELECT party, COUNT(*) as count
        FROM deputies
        WHERE party IS NOT NULL
        GROUP BY party
        ORDER BY count DESC
    """,
    "party_abstention_rate": """
        SELECT
            d.party,
            COUNT(*) FILTER (WHERE vp.position = 'abstention') as abstentions,
            COUNT(*) as total_votes,
            ROUND(
                COUNT(*) FILTER (WHERE vp.position = 'abstention')::numeric
                / NULLIF(COUNT(*), 0) * 100, 1
            ) as abstention_pct
        FROM vote_positions vp
        JOIN deputies d ON vp.deputy_id = d.deputy_id
        WHERE d.party IS NOT NULL
          AND vp.position IN ('pour', 'contre', 'abstention')
        GROUP BY d.party
        ORDER BY abstention_pct DESC
        LIMIT 12
    """,
    "party_presence_rate": """
        SELECT
            d.party,
            COUNT(DISTINCT d.deputy_id) as deputies,
            ROUND(
                AVG(ds.presence_rate) * 100, 1
            ) as avg_presence_pct
        FROM deputies d
        JOIN (
            SELECT
                deputy_id,
                COUNT(*) FILTER (
                    WHERE position IN ('pour','contre','abstention')
                )::numeric / NULLIF(COUNT(*), 0) as presence_rate
            FROM vote_positions
            GROUP BY deputy_id
        ) ds ON d.deputy_id = ds.deputy_id
        WHERE d.party IS NOT NULL
        GROUP BY d.party
        ORDER BY avg_presence_pct DESC
        LIMIT 12
    """,
    "vote_result_count": """
        SELECT
            result,
            COUNT(*) as count
        FROM votes
        GROUP BY result
        ORDER BY count DESC
    """,
    "party_alignment": """
        SELECT
            d.party,
            ROUND(
                COUNT(*) FILTER (WHERE vp.position = majority.majority_pos)::numeric
                / NULLIF(COUNT(*), 0) * 100, 1
            ) as alignment_pct,
            COUNT(*) as total_votes
        FROM vote_positions vp
        JOIN deputies d ON vp.deputy_id = d.deputy_id
        JOIN (
            SELECT
                vp2.vote_id,
                d2.party,
                MODE() WITHIN GROUP (ORDER BY vp2.position) as majority_pos
            FROM vote_positions vp2
            JOIN deputies d2 ON vp2.deputy_id = d2.deputy_id
            WHERE vp2.position IN ('pour','contre','abstention')
              AND d2.party IS NOT NULL
            GROUP BY vp2.vote_id, d2.party
        ) majority ON vp.vote_id = majority.vote_id
            AND d.party = majority.party
        WHERE d.party IS NOT NULL
          AND vp.position IN ('pour','contre','abstention')
        GROUP BY d.party
        ORDER BY alignment_pct DESC
        LIMIT 12
    """,
}

FORMATTERS = {
    "deputy_count_by_party": lambda rows: (
        f"Répartition des {sum(r['count'] for r in rows)} députés par groupe parlementaire :\n"
        + "\n".join(f"- {r['party']} : {r['count']} députés" for r in rows)
    ),
    "party_abstention_rate": lambda rows: (
        "Taux d'abstention par groupe parlementaire "
        "(votes pour/contre/abstention uniquement) :\n"
        + "\n".join(
            f"- {r['party']} : {r['abstention_pct']}% "
            f"({r['abstentions']} abstentions sur {r['total_votes']} votes)"
            for r in rows
        )
    ),
    "party_presence_rate": lambda rows: (
        "Taux de présence moyen par groupe parlementaire :\n"
        + "\n".join(
            f"- {r['party']} : {r['avg_presence_pct']}% ({r['deputies']} députés)" for r in rows
        )
    ),
    "vote_result_count": lambda rows: (
        "Résultats des votes à l'Assemblée Nationale :\n"
        + "\n".join(f"- {r['result'].capitalize()} : {r['count']} votes" for r in rows)
    ),
    "party_alignment": lambda rows: (
        "Discipline de vote par groupe parlementaire "
        "(% de votes conformes à la majorité du groupe) :\n"
        + "\n".join(f"- {r['party']} : {r['alignment_pct']}% de discipline" for r in rows)
    ),
}


def detect_intent(question: str) -> str | None:
    """Return intent key if question matches an aggregation pattern."""
    q = question.lower().strip()
    for pattern, intent in PATTERNS:
        if re.search(pattern, q):
            return intent
    return None


def run_sql_query(intent: str) -> list[dict]:
    """Run the SQL query for a detected intent. Returns [] on any failure so route() falls back to RAG."""
    sql = SQL_QUERIES.get(intent)
    if not sql:
        return []
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        print(f"[SQL router] query failed for intent={intent}: {exc}")
        return []


def route(question: str) -> dict | None:
    """
    Main entry point.
    Returns a structured answer dict if the question is an
    aggregation query, or None if RAG should handle it.
    """
    intent = detect_intent(question)
    if not intent:
        return None

    print(f"[SQL router] intent={intent} — bypassing RAG")
    rows = run_sql_query(intent)
    if not rows:
        return None

    formatter = FORMATTERS.get(intent)
    answer_text = formatter(rows) if formatter else str(rows)

    return {
        "answer": answer_text,
        "question": question,
        "chunks_retrieved": 0,
        "sources": [],
        "query_type": intent,
        "confidence": "HIGH",
        "data_source": "SQL",
        "caveat": "Données calculées directement depuis la base de données. Aucune génération IA.",
    }
