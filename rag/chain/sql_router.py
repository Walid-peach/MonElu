"""
SQL router — detects aggregation questions and answers them
directly from Postgres. Zero LLM, zero hallucination.
Returns None if the question is not an aggregation query
so the caller falls back to standard RAG.
"""

import logging
import os
import re
import threading

import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv

from rag.constants import NOTABLE_DEPUTY_NAMES

load_dotenv()

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(1, 5, dsn=DATABASE_URL)
    return _pool


def warm_pool() -> None:
    """Establish the connection pool at startup. Intended for app lifespan callers."""
    _get_pool()


# Department name keywords (lowercase) → numeric code stored in DB
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

# Numeric code → canonical display name (must match what update_party.py writes to the DB).
# Not derived via .title() — that capitalises after hyphens/apostrophes, producing
# "Hauts-De-Seine" instead of "Hauts-de-Seine", and "Bouches" instead of "Bouches-du-Rhône".
CODE_TO_DEPT_NAME: dict[str, str] = {
    "06": "Alpes-Maritimes",
    "13": "Bouches-du-Rhône",
    "31": "Haute-Garonne",
    "33": "Gironde",
    "34": "Hérault",
    "38": "Isère",
    "42": "Loire",
    "57": "Moselle",
    "59": "Nord",
    "67": "Bas-Rhin",
    "69": "Rhône",
    "75": "Paris",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "83": "Var",
    "91": "Essonne",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
}


def normalize_text(text: str) -> str:
    """Normalize apostrophes and whitespace for pattern matching."""
    for char in ["’", "`", "´", "‘"]:
        text = text.replace(char, "'")
    text = " ".join(text.split())
    return text.lower().strip()


def detect_department(question: str) -> str | None:
    """Return the canonical department name if a known department appears in the question."""
    q = normalize_text(question)
    for dept_name, code in DEPT_NAME_TO_CODE.items():
        norm = normalize_text(dept_name)
        if re.search(r"\b" + re.escape(norm) + r"\b", q):
            return CODE_TO_DEPT_NAME[code]
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
    (r"quel (parti|groupe).*(plus de|le plus).*(député|élu)", "deputy_count_by_party"),
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
        -- canonical presence: all recorded positions (incl. nonVotant) over
        -- votes during the mandate window — see docs/decisions.md
        SELECT
            ds.party,
            COUNT(*) as deputies,
            ROUND(AVG(ds.presence_rate) * 100, 1) as avg_presence_pct
        FROM (
            SELECT
                d.deputy_id,
                d.party,
                LEAST(
                    COUNT(vp.position_id)::numeric / NULLIF((
                        SELECT COUNT(*) FROM votes v
                        WHERE (d.mandate_start IS NULL OR v.voted_at >= d.mandate_start)
                          AND (d.mandate_end IS NULL OR v.voted_at <= d.mandate_end)
                    ), 0),
                    1
                ) as presence_rate
            FROM deputies d
            LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
            WHERE d.party IS NOT NULL
            GROUP BY d.deputy_id
        ) ds
        GROUP BY ds.party
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
    "deputy_total_count": lambda rows: f"MonÉlu suit {rows[0]['total']} députés au total.",
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
        + "\n".join(
            f"- {(r['result'] or 'inconnu').capitalize()} : {r['count']} votes" for r in rows
        )
    ),
    "party_alignment": lambda rows: (
        "Discipline de vote par groupe parlementaire "
        "(% de votes conformes à la majorité du groupe) :\n"
        + "\n".join(f"- {r['party']} : {r['alignment_pct']}% de discipline" for r in rows)
    ),
}


_DEPUTY_NAME_INTENTS = {"vote_total_count", "vote_result_count"}


def _has_notable_deputy(question: str) -> bool:
    """Return True if a notable deputy keyword appears in the question."""
    q_lower = question.lower()
    for kw in NOTABLE_DEPUTY_NAMES:
        if len(kw) >= 3 and re.search(r"\b" + re.escape(kw) + r"\b", q_lower):
            return True
    return False


def detect_intent(question: str) -> str | None:
    """Return intent key if question matches an aggregation pattern."""
    q = normalize_text(question)
    for pattern, intent in PATTERNS:
        if re.search(pattern, q):
            # Don't let global-aggregate patterns swallow deputy-specific questions
            if intent in _DEPUTY_NAME_INTENTS and _has_notable_deputy(question):
                return None
            return intent
    return None


def run_sql_query(intent: str, params: dict | None = None) -> list[dict]:
    """Run the SQL query for a detected intent. Returns [] on any failure so route() falls back to RAG."""
    sql = SQL_QUERIES.get(intent)
    if not sql:
        return []
    pool = _get_pool()
    conn = pool.getconn()
    broken = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
        return rows
    except Exception as exc:
        log.warning("SQL router query failed for intent=%s: %s", intent, exc)
        broken = True
        return []
    finally:
        pool.putconn(conn, close=broken)


def route(question: str) -> dict | None:
    """
    Main entry point.
    Returns a structured answer dict if the question is an
    aggregation query, or None if RAG should handle it.
    """
    intent = detect_intent(question)
    if not intent:
        return None

    log.debug("SQL router intent=%s — bypassing RAG", intent)

    # Department queries need the detected code as a parameter.
    # If no department name is detected, fall back to RAG — a vague
    # "deputies by department" question is better handled there than
    # with a broken or meaningless ranking.
    if intent == "deputy_by_department":
        dept_name = detect_department(question)
        if not dept_name:
            return None
        rows = run_sql_query("deputy_by_department", {"dept": dept_name})
        formatter_key = "deputy_by_department"
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
        "confidence": "high",
        "data_source": "SQL",
        "caveat": "Données calculées directement depuis la base de données. Aucune génération IA.",
    }
