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

# Maps lowercase department name keywords → department code stored in DB
CODE_TO_DEPT_NAME = {
    "78": "Yvelines",
    "59": "Nord",
    "75": "Paris",
    "69": "Rhône",
    "13": "Bouches-du-Rhône",
    "33": "Gironde",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
    "91": "Essonne",
    "77": "Seine-et-Marne",
    "42": "Loire",
    "38": "Isère",
    "34": "Hérault",
    "83": "Var",
    "06": "Alpes-Maritimes",
    "31": "Haute-Garonne",
    "67": "Bas-Rhin",
    "57": "Moselle",
}

DEPT_NAME_TO_CODE = {
    "yvelines": "78",
    "nord": "59",
    "paris": "75",
    "rhône": "69",
    "bouches": "13",
    "gironde": "33",
    "hauts-de-seine": "92",
    "seine-saint-denis": "93",
    "val-de-marne": "94",
    "val-d'oise": "95",
    "essonne": "91",
    "seine-et-marne": "77",
    "loire": "42",
    "isère": "38",
    "hérault": "34",
    "var": "83",
    "alpes-maritimes": "06",
    "haute-garonne": "31",
    "bas-rhin": "67",
    "moselle": "57",
}

_DEPT_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in DEPT_NAME_TO_CODE) + r")\b",
    re.IGNORECASE,
)


def detect_department(question: str) -> str | None:
    """Return the department code if a known department name appears in the question."""
    m = _DEPT_PATTERN.search(question)
    if m:
        return DEPT_NAME_TO_CODE[m.group(1).lower()]
    return None


PATTERNS = [
    # deputies by department — must come before generic deputy_count patterns
    (
        r"(député|élu).*(yvelines|nord|paris|rhône|bouches|gironde|hauts-de-seine"
        r"|seine-saint-denis|val-de-marne|val-d.oise|essonne|seine-et-marne"
        r"|isère|hérault|var|alpes-maritimes|haute-garonne|bas-rhin|moselle|loire)",
        "deputy_by_department",
    ),
    (r"combien.*député.*département|député.*quel département", "deputy_by_department"),
    # total deputy count
    (r"combien.*député.*(total|suivis|enregistrés|au total|en tout)", "deputy_total_count"),
    # party / group counts
    (r"combien de dép.*(groupe|parti)", "deputy_count_by_party"),
    (r"combien.*groupe|combien.*parti", "deputy_count_by_party"),
    # abstention rate
    (r"(quel groupe|quel parti).*(abstien|abstention|plus d.abstention)", "party_abstention_rate"),
    (r"(qui|quel).*(abstient|abstentions).*(plus|davantage|le plus)", "party_abstention_rate"),
    # presence rate
    (r"(quel groupe|quel parti).*(présence|particip|vote le plus)", "party_presence_rate"),
    (r"taux de présence.*(groupe|parti|moyen|chaque)", "party_presence_rate"),
    # vote totals
    (r"combien.*votes?.*(total|au total|en tout|depuis|enregistrés)", "vote_total_count"),
    (r"(nombre|volume|total).*votes?", "vote_total_count"),
    # vote result counts (adopté/rejeté)
    (r"combien de votes.*(adopté|rejeté)", "vote_result_count"),
    (r"combien.*(adopté|rejeté)", "vote_result_count"),
    # party alignment / discipline
    (r"discipline.*(vote|voting)|taux de discipline", "party_alignment"),
    (r"(vote|votent).*(toujours|souvent|jamais).*(ensemble|même sens)", "party_alignment"),
    (r"(quel groupe|quel parti).*(discipline|cohésion|alignement)", "party_alignment"),
    (r"qui vote.*(toujours|souvent|jamais).*(avec|contre).*(parti|groupe)", "party_alignment"),
]

SQL_QUERIES = {
    "deputy_by_department": """
        SELECT full_name, party, department
        FROM deputies
        WHERE department = %(dept)s
        ORDER BY full_name
    """,
    "deputy_by_department_all": """
        SELECT department, COUNT(*) as count
        FROM deputies
        WHERE department IS NOT NULL
        GROUP BY department
        ORDER BY count DESC
        LIMIT 20
    """,
    "deputy_total_count": """
        SELECT COUNT(*) as total FROM deputies
    """,
    "vote_total_count": """
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE result = 'adopté') as adopted,
            COUNT(*) FILTER (WHERE result = 'rejeté') as rejected,
            MIN(voted_at)::date as from_date,
            MAX(voted_at)::date as to_date
        FROM votes
    """,
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
    "deputy_by_department": lambda rows: (
        (
            f"{len(rows)} député(s) dans les {CODE_TO_DEPT_NAME.get(rows[0]['department'], rows[0]['department'])} "
            f"(département {rows[0]['department']}) :\n"
            + "\n".join(f"- {r['full_name']} ({r['party'] or 'parti non renseigné'})" for r in rows)
        )
        if rows
        else "Aucun député trouvé pour ce département."
    ),
    "deputy_total_count": lambda rows: (f"MonÉlu suit {rows[0]['total']} députés au total."),
    "vote_total_count": lambda rows: (
        f"MonÉlu a analysé {rows[0]['total']} votes au total "
        f"(du {rows[0]['from_date']} au {rows[0]['to_date']}). "
        f"{rows[0]['adopted']} adoptés, {rows[0]['rejected']} rejetés."
    ),
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


def run_sql_query(intent: str, params: dict | None = None) -> list[dict]:
    """Run the SQL query for a detected intent. Returns [] on any failure so route() falls back to RAG."""
    sql = SQL_QUERIES.get(intent)
    if not sql:
        return []
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
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

    # Department queries need the detected code as a parameter
    if intent == "deputy_by_department":
        dept_code = detect_department(question)
        if dept_code:
            rows = run_sql_query("deputy_by_department", {"dept": dept_code})
            formatter_key = "deputy_by_department"
        else:
            rows = run_sql_query("deputy_by_department_all")
            formatter_key = "deputy_count_by_party"
    else:
        rows = run_sql_query(intent)
        formatter_key = intent

    if not rows:
        return None

    formatter = FORMATTERS.get(formatter_key)
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
