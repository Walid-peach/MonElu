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
from rag.pipeline.chunker import dept_preposition

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
                try:
                    _pool = psycopg2.pool.ThreadedConnectionPool(
                        1, 5, dsn=DATABASE_URL, options="-c statement_timeout=5000"
                    )
                except psycopg2.OperationalError:
                    # PgBouncer in transaction mode rejects startup options=;
                    # see api/db.py init_pool for the same fallback.
                    log.warning(
                        "DB rejected startup options (statement_timeout) — initializing "
                        "sql_router pool without statement_timeout"
                    )
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

# deputies.department stores the full name (update_party.py writes it), not the code —
# invert CODE_TO_DEPT_NAME to recover the code for display.
DEPT_NAME_TO_CODE_DISPLAY: dict[str, str] = {name: code for code, name in CODE_TO_DEPT_NAME.items()}


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


def detect_circonscription(question: str) -> str | None:
    """'1ère circonscription des Yvelines' → '1' (bare number, matching the DB)."""
    m = re.search(
        r"\b(\d{1,2})\s*(?:ère|ere|e|ème|eme)?\s*circonscription", normalize_text(question)
    )
    return m.group(1) if m else None


# Pattern order matters: the first match wins.
#   - deputy-level rankings must precede the party-level rate patterns
#     ("quels députés s'abstiennent le plus" would otherwise route to
#     party_abstention_rate)
#   - period questions must precede vote_latest ("la semaine dernière"
#     contains "dernière")
PATTERNS = [
    # deputies by department — must come before generic deputy_count patterns
    (
        r"(député|élu).*(yvelines|nord|paris|rhône|bouches|gironde|hauts-de-seine"
        r"|seine-saint-denis|val-de-marne|val-d.oise|essonne|seine-et-marne"
        r"|isère|hérault|var|alpes-maritimes|haute-garonne|bas-rhin|moselle|loire)",
        "deputy_by_department",
    ),
    (r"combien.*député.*département|député.*quel département", "deputy_by_department"),
    # deputy rankings — before any party-level rate pattern
    (r"député.*(pire|plus (bas|faible)|moins bon).*présence", "deputy_bottom_presence"),
    (r"(pire|plus (bas|faible)).*présence.*député", "deputy_bottom_presence"),
    (r"député.*(meilleur|plus (haut|élevé)|top).*présence", "deputy_top_presence"),
    (r"(meilleur|plus (haut|élevé)).*présence.*député", "deputy_top_presence"),
    (r"(top|classement).*député.*présence", "deputy_top_presence"),
    # superlative required, and "le moins" excluded: "combien de députés du
    # RN se sont abstenus sur X" or "quel député s'abstient le moins" must
    # NOT get the top-abstentions ranking
    (
        r"député.*(abstiennent|abstient|abstention).*(le plus|plus souvent|davantage)"
        r"|député.*(le plus|plus souvent) d.abstentions?",
        "deputy_top_abstention",
    ),
    (r"député.*(voté|vote|votent).*contre.*(le plus|plus souvent)", "deputy_most_contre"),
    (r"(qui|quel député).*(le plus|plus souvent).*(voté |vote )?contre", "deputy_most_contre"),
    (r"député.*(voté|vote|votent).*pour.*(le plus|plus souvent)", "deputy_most_pour"),
    (r"(dissiden|votent différemment|vote différemment)", "deputy_dissidents"),
    (r"(qui|députés?).*(contre|différemment de) (son|leur) (groupe|parti)", "deputy_dissidents"),
    # total deputy count
    (r"combien.*député.*(total|suivis|enregistrés|au total|en tout)", "deputy_total_count"),
    # party / group counts
    (r"quel (parti|groupe).*(plus de|le plus).*(député|élu)", "deputy_count_by_party"),
    (r"combien de dép.*(groupe|parti)", "deputy_count_by_party"),
    (r"combien.*groupe|combien.*parti", "deputy_count_by_party"),
    # abstention rate
    (r"(quel groupe|quel parti).*(abstien|abstention|plus d.abstention)", "party_abstention_rate"),
    (r"(qui|quel).*(abstient|abstentions).*(plus|davantage|le plus)", "party_abstention_rate"),
    # presence rate — also answers "différence de présence entre X et Y":
    # the full per-group table contains both terms of any comparison
    (r"différence.*présence|présence.*différence", "party_presence_rate"),
    (r"compar.*présence.*(groupe|parti)", "party_presence_rate"),
    (r"(quel groupe|quel parti).*(présence|particip|vote le plus)", "party_presence_rate"),
    (r"taux de présence.*(groupe|parti|moyen|chaque)", "party_presence_rate"),
    # votes in a time period — before vote_latest ("semaine dernière")
    (
        r"(combien|quels).*votes?.*(janvier|février|mars|avril|mai|juin|juillet"
        r"|août|septembre|octobre|novembre|décembre)",
        "votes_by_period",
    ),
    (r"(combien|quels).*votes?.*(cette semaine|ce mois|semaine dernière)", "votes_by_period"),
    # latest / first vote
    (r"(dernier|derniers) (vote|scrutin)|votes? les? plus récents?", "vote_latest"),
    (r"premier (vote|scrutin)|vote le plus ancien", "vote_first"),
    # participation / closest
    (r"votes?.*(plus de|le plus|top).*(participation|votants)", "vote_top_participation"),
    (r"(participation|votants).*(le plus|la plus|maximum)", "vote_top_participation"),
    (r"votes?.*(serré|serrés)", "vote_closest"),
    # vote totals
    (r"combien.*votes?.*(total|au total|en tout|depuis|enregistrés)", "vote_total_count"),
    (r"(nombre|volume|total).*votes?", "vote_total_count"),
    # vote result counts (adopté/rejeté)
    (r"combien de votes.*(adopté|rejeté)", "vote_result_count"),
    (r"combien.*(adopté|rejeté)", "vote_result_count"),
    # party position totals ("le RN vote-t-il plus souvent pour ou contre ?")
    (r"(vote|votent).*(pour ou contre|contre ou pour)", "party_position_totals"),
    (r"(groupe|parti).*(plus souvent|majoritairement).*(pour|contre)", "party_position_totals"),
    # party alignment / discipline
    (r"discipline.*(vote|voting)|taux de discipline", "party_alignment"),
    (r"(vote|votent).*(toujours|souvent|jamais).*(ensemble|même sens)", "party_alignment"),
    (r"(quel groupe|quel parti).*(discipline|cohésion|alignement)", "party_alignment"),
    (r"qui vote.*(toujours|souvent|jamais).*(avec|contre).*(parti|groupe)", "party_alignment"),
]

# Rankings exclude deputies with too few votes in their mandate window:
# a deputy present for 3 votes and attending all 3 is not "the most
# present deputy" in any meaningful sense.
_MIN_WINDOW_VOTES = 100

# Canonical per-deputy presence over the mandate window (see
# docs/decisions.md); shared by both presence-ranking intents.
_DEPUTY_PRESENCE_RANKING = f"""
    SELECT d.full_name, d.party,
           ROUND(LEAST(
               COUNT(vp.vote_id)::numeric / NULLIF(wv.window_votes, 0), 1
           ) * 100, 1) AS presence_pct
    FROM deputies d
    LEFT JOIN vote_positions vp ON d.deputy_id = vp.deputy_id
    CROSS JOIN LATERAL (
        SELECT COUNT(*) AS window_votes FROM votes v
        WHERE (d.mandate_start IS NULL OR v.voted_at >= d.mandate_start)
          AND (d.mandate_end IS NULL OR v.voted_at <= d.mandate_end)
    ) wv
    WHERE d.mandate_end IS NULL
    GROUP BY d.deputy_id, wv.window_votes
    HAVING wv.window_votes >= {_MIN_WINDOW_VOTES}
    ORDER BY presence_pct {{direction}}, d.full_name
    LIMIT %(n)s
"""

SQL_QUERIES = {
    "deputy_top_presence": _DEPUTY_PRESENCE_RANKING.format(direction="DESC"),
    "deputy_bottom_presence": _DEPUTY_PRESENCE_RANKING.format(direction="ASC"),
    "deputy_top_abstention": """
        SELECT d.full_name, d.party, COUNT(*) AS n
        FROM vote_positions vp
        JOIN deputies d ON d.deputy_id = vp.deputy_id
        WHERE vp.position = 'abstention'
        GROUP BY d.deputy_id
        ORDER BY n DESC
        LIMIT %(n)s
    """,
    "deputy_most_contre": """
        SELECT d.full_name, d.party, COUNT(*) AS n
        FROM vote_positions vp
        JOIN deputies d ON d.deputy_id = vp.deputy_id
        WHERE vp.position = 'contre'
        GROUP BY d.deputy_id
        ORDER BY n DESC
        LIMIT %(n)s
    """,
    "deputy_most_pour": """
        SELECT d.full_name, d.party, COUNT(*) AS n
        FROM vote_positions vp
        JOIN deputies d ON d.deputy_id = vp.deputy_id
        WHERE vp.position = 'pour'
        GROUP BY d.deputy_id
        ORDER BY n DESC
        LIMIT %(n)s
    """,
    "deputy_dissidents": f"""
        SELECT full_name, party, total_votes, dissident_votes,
               ROUND(dissident_rate * 100, 1) AS dissident_pct
        FROM analytics_marts.mart_party_alignment
        WHERE total_votes >= {_MIN_WINDOW_VOTES}
        ORDER BY dissident_rate DESC
        LIMIT %(n)s
    """,
    "vote_latest": """
        SELECT vote_title, voted_at::date AS d, result,
               votes_for, votes_against, abstentions, total_voters
        FROM votes
        ORDER BY voted_at DESC
        LIMIT %(n)s
    """,
    "vote_first": """
        SELECT vote_title, voted_at::date AS d, result,
               votes_for, votes_against, abstentions, total_voters
        FROM votes
        ORDER BY voted_at ASC
        LIMIT 1
    """,
    "vote_top_participation": """
        SELECT vote_title, voted_at::date AS d, result, total_voters
        FROM votes
        ORDER BY total_voters DESC NULLS LAST
        LIMIT %(n)s
    """,
    "vote_closest": f"""
        -- floor on total_voters: 1-1 amendment votes in a near-empty
        -- hemicycle are ties but not "les votes les plus serrés"
        SELECT vote_title, voted_at::date AS d, result,
               votes_for, votes_against, total_voters,
               ABS(votes_for - votes_against) AS margin
        FROM votes
        WHERE total_voters >= {_MIN_WINDOW_VOTES}
        ORDER BY margin ASC, total_voters DESC
        LIMIT %(n)s
    """,
    "votes_by_period": """
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE result = 'adopté') AS adopted,
            COUNT(*) FILTER (WHERE result = 'rejeté') AS rejected,
            %(label)s AS period_label
        FROM votes
        WHERE voted_at >= %(start)s AND voted_at < %(end)s
    """,
    "party_position_totals": """
        SELECT d.party,
               COUNT(*) FILTER (WHERE vp.position = 'pour')       AS pour,
               COUNT(*) FILTER (WHERE vp.position = 'contre')     AS contre,
               COUNT(*) FILTER (WHERE vp.position = 'abstention') AS abstention
        FROM vote_positions vp
        JOIN deputies d ON d.deputy_id = vp.deputy_id
        WHERE d.party IS NOT NULL
        GROUP BY d.party
        ORDER BY (COUNT(*) FILTER (WHERE vp.position = 'pour')
                + COUNT(*) FILTER (WHERE vp.position = 'contre')) DESC
    """,
    "deputy_by_department": """
        -- Active mandates only — same "en exercice" policy as the
        -- deputy count intents. circo narrows to one circonscription
        -- when the question names one.
        SELECT full_name, party, department, circonscription
        FROM deputies
        WHERE department = %(dept)s
          AND mandate_end IS NULL
          AND (%(circo)s IS NULL OR circonscription = %(circo)s)
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
        SELECT
            COUNT(*) FILTER (WHERE mandate_end IS NULL) as active,
            COUNT(*) as total
        FROM deputies
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
        -- Active mandates only: group sizes must reflect the current
        -- Assemblée, not everyone who ever sat during the legislature.
        SELECT party, COUNT(*) as count
        FROM deputies
        WHERE party IS NOT NULL
          AND mandate_end IS NULL
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
                    COUNT(vp.vote_id)::numeric / NULLIF((
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
        -- per-deputy aligned_votes/total_votes rolled up to party level;
        -- reads the mart instead of re-deriving the majority via a live
        -- 715k-row self-join (MON-118 materialized it for this reason)
        SELECT
            party,
            ROUND(
                SUM(aligned_votes)::numeric / NULLIF(SUM(total_votes), 0) * 100, 1
            ) as alignment_pct,
            SUM(total_votes) as total_votes
        FROM analytics_marts.mart_party_alignment
        WHERE party IS NOT NULL
        GROUP BY party
        ORDER BY alignment_pct DESC
        LIMIT 12
    """,
}


def _fmt_vote_line(r: dict) -> str:
    return (
        f"- {r['vote_title']} ({r['d']}) : {r['result']} — "
        f"{r.get('votes_for', '?')} pour, {r.get('votes_against', '?')} contre, "
        f"{r['total_voters']} votants"
    )


def _fmt_deputy_by_department(rows: list[dict]) -> str:
    if not rows:
        return "Aucun député trouvé pour ce département."
    dept_name = rows[0]["department"]
    code = DEPT_NAME_TO_CODE_DISPLAY.get(dept_name)
    prep = dept_preposition(dept_name)
    sep = "" if prep.endswith("'") else " "
    dept_suffix = f" (département {code})" if code else ""
    return f"{len(rows)} député(s) {prep}{sep}{dept_name}{dept_suffix} :\n" + "\n".join(
        f"- {r['full_name']} ({r['party'] or 'parti non renseigné'})" for r in rows
    )


FORMATTERS = {
    "deputy_top_presence": lambda rows: (
        "Députés en exercice avec le meilleur taux de présence "
        f"(au moins {_MIN_WINDOW_VOTES} votes sur leur mandat) :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : {r['presence_pct']}%"
            for r in rows
        )
    ),
    "deputy_bottom_presence": lambda rows: (
        "Députés en exercice avec le plus faible taux de présence "
        f"(au moins {_MIN_WINDOW_VOTES} votes sur leur mandat) :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : {r['presence_pct']}%"
            for r in rows
        )
    ),
    "deputy_top_abstention": lambda rows: (
        "Députés avec le plus d'abstentions :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : {r['n']} abstentions"
            for r in rows
        )
    ),
    "deputy_most_contre": lambda rows: (
        "Députés ayant le plus souvent voté contre :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : {r['n']} votes contre"
            for r in rows
        )
    ),
    "deputy_most_pour": lambda rows: (
        "Députés ayant le plus souvent voté pour :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : {r['n']} votes pour"
            for r in rows
        )
    ),
    "deputy_dissidents": lambda rows: (
        "Députés votant le plus souvent différemment de la majorité de leur "
        f"groupe (au moins {_MIN_WINDOW_VOTES} votes) :\n"
        + "\n".join(
            f"- {r['full_name']} ({r['party'] or 'groupe non renseigné'}) : "
            f"{r['dissident_pct']}% de votes dissidents "
            f"({r['dissident_votes']} sur {r['total_votes']})"
            for r in rows
        )
    ),
    "vote_latest": lambda rows: (
        f"Le dernier vote enregistré date du {rows[0]['d']} : "
        f"{rows[0]['vote_title']} — {rows[0]['result']} "
        f"({rows[0]['votes_for']} pour, {rows[0]['votes_against']} contre, "
        f"{rows[0]['abstentions']} abstentions sur {rows[0]['total_voters']} votants)."
        + (
            "\n\nVotes précédents :\n" + "\n".join(_fmt_vote_line(r) for r in rows[1:])
            if len(rows) > 1
            else ""
        )
    ),
    "vote_first": lambda rows: (
        f"Le premier vote enregistré date du {rows[0]['d']} : "
        f"{rows[0]['vote_title']} — {rows[0]['result']} "
        f"({rows[0]['votes_for']} pour, {rows[0]['votes_against']} contre, "
        f"{rows[0]['abstentions']} abstentions sur {rows[0]['total_voters']} votants)."
    ),
    "vote_top_participation": lambda rows: (
        "Votes avec la plus forte participation :\n"
        + "\n".join(
            f"- {r['vote_title']} ({r['d']}) : {r['total_voters']} votants — {r['result']}"
            for r in rows
        )
    ),
    "vote_closest": lambda rows: (
        f"Votes les plus serrés (au moins {_MIN_WINDOW_VOTES} votants) :\n"
        + "\n".join(
            f"- {r['vote_title']} ({r['d']}) : {r['votes_for']} pour / "
            f"{r['votes_against']} contre (écart {r['margin']}) — {r['result']}"
            for r in rows
        )
    ),
    "votes_by_period": lambda rows: (
        f"{rows[0]['total']} vote(s) enregistré(s) {rows[0]['period_label']} : "
        f"{rows[0]['adopted']} adopté(s), {rows[0]['rejected']} rejeté(s)."
        if rows[0]["total"]
        else f"Aucun vote enregistré {rows[0]['period_label']}."
    ),
    "party_position_totals": lambda rows: (
        "Positions de vote par groupe parlementaire :\n"
        + "\n".join(
            f"- {r['party']} : {r['pour']:,} pour, {r['contre']:,} contre, "
            f"{r['abstention']:,} abstentions — "
            f"vote majoritairement {'pour' if r['pour'] >= r['contre'] else 'contre'}"
            for r in rows
        )
    ),
    "deputy_by_department": _fmt_deputy_by_department,
    "deputy_total_count": lambda rows: (
        f"MonÉlu suit {rows[0]['active']} députés en exercice "
        f"({rows[0]['total']} au total sur la 17e législature, "
        f"en comptant les mandats terminés)."
    ),
    "vote_total_count": lambda rows: (
        f"MonÉlu a analysé {rows[0]['total']} votes au total "
        f"(du {rows[0]['from_date']} au {rows[0]['to_date']}). "
        f"{rows[0]['adopted']} adoptés, {rows[0]['rejected']} rejetés."
    ),
    "deputy_count_by_party": lambda rows: (
        f"Répartition des {sum(r['count'] for r in rows)} députés en exercice "
        f"par groupe parlementaire :\n"
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


# Intents that must yield to RAG when a specific deputy is named
# ("le dernier vote de Marine Le Pen" is about her record, not the
# chamber's latest vote)
_DEPUTY_NAME_INTENTS = {
    "vote_total_count",
    "vote_result_count",
    "vote_latest",
    "vote_first",
    "votes_by_period",
}

# Intents whose SQL takes a LIMIT %(n)s
_TOP_N_INTENTS = {
    "deputy_top_presence",
    "deputy_bottom_presence",
    "deputy_top_abstention",
    "deputy_most_contre",
    "deputy_most_pour",
    "deputy_dissidents",
    "vote_latest",
    "vote_top_participation",
    "vote_closest",
}

_DEFAULT_TOP_N = 5
_MAX_TOP_N = 20

_MONTHS = {
    "janvier": 1,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
}


def extract_top_n(question: str) -> int:
    """'les 5 députés', 'top 3' → 5, 3; default 5, capped at 20."""
    m = re.search(r"\b(?:les|top)\s+(\d{1,2})\b", normalize_text(question))
    if not m:
        return _DEFAULT_TOP_N
    return max(1, min(int(m.group(1)), _MAX_TOP_N))


def extract_period(question: str) -> dict | None:
    """
    Resolve a month/year or relative-week/month mention to
    {"start": date, "end": date, "label": str}. Returns None if the
    question has no resolvable period (caller falls back to RAG).
    """
    import datetime as _dt

    q = normalize_text(question)
    today = _dt.date.today()

    m = re.search(
        r"\b(janvier|février|mars|avril|mai|juin|juillet|août"
        r"|septembre|octobre|novembre|décembre)\b(?:\s+(\d{4}))?",
        q,
    )
    if m:
        month = _MONTHS[m.group(1)]
        year = int(m.group(2)) if m.group(2) else today.year
        start = _dt.date(year, month, 1)
        end = _dt.date(year + 1, 1, 1) if month == 12 else _dt.date(year, month + 1, 1)
        return {"start": start, "end": end, "label": f"en {m.group(1)} {year}"}

    if "cette semaine" in q:
        start = today - _dt.timedelta(days=today.weekday())
        return {"start": start, "end": today + _dt.timedelta(days=1), "label": "cette semaine"}
    if "semaine dernière" in q:
        start = today - _dt.timedelta(days=today.weekday() + 7)
        return {
            "start": start,
            "end": start + _dt.timedelta(days=7),
            "label": "la semaine dernière",
        }
    if "ce mois" in q:
        start = today.replace(day=1)
        return {"start": start, "end": today + _dt.timedelta(days=1), "label": "ce mois-ci"}
    return None


def _has_notable_deputy(question: str) -> bool:
    """Return True if a notable deputy keyword appears in the question."""
    q_lower = question.lower()
    for kw in NOTABLE_DEPUTY_NAMES:
        if len(kw) >= 3 and re.search(r"\b" + re.escape(kw) + r"\b", q_lower):
            return True
    return False


_RESULT_WORDS = re.compile(r"adopté|rejeté|rejet\b|adoption")


def detect_intent(question: str) -> str | None:
    """Return intent key if question matches an aggregation pattern."""
    q = normalize_text(question)
    for pattern, intent in PATTERNS:
        if re.search(pattern, q):
            # Don't let global-aggregate patterns swallow deputy-specific questions
            if intent in _DEPUTY_NAME_INTENTS and _has_notable_deputy(question):
                return None
            # "les votes rejetés les plus récents" is a result-filtered
            # recency question — retriever.py handles those (recency-sorted
            # retrieval); the unfiltered latest-votes SQL would be wrong
            if intent in ("vote_latest", "vote_first") and _RESULT_WORDS.search(q):
                return None
            return intent
    return None


def run_sql_query(intent: str, params: dict | None = None) -> list[dict]:
    """Run the SQL query for a detected intent.

    Returns [] on any failure so route() falls back to RAG.
    """
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


def execute_intent(intent: str, question: str) -> dict | None:
    """
    Run a known intent's whitelisted SQL and format the answer.
    Shared by the regex path (route) and the LLM classifier path
    (rag/chain/llm_router.py). Returns None when required parameters
    can't be resolved or the query yields nothing — callers fall back
    to RAG.
    """
    if intent not in SQL_QUERIES:
        return None

    # Department queries need the detected code as a parameter.
    # If no department name is detected, fall back to RAG — a vague
    # "deputies by department" question is better handled there than
    # with a broken or meaningless ranking.
    if intent == "deputy_by_department":
        dept_name = detect_department(question)
        if not dept_name:
            return None
        circo = detect_circonscription(question)
        rows = run_sql_query("deputy_by_department", {"dept": dept_name, "circo": circo})
    elif intent == "votes_by_period":
        period = extract_period(question)
        if not period:
            return None
        rows = run_sql_query("votes_by_period", period)
    elif intent in _TOP_N_INTENTS:
        rows = run_sql_query(intent, {"n": extract_top_n(question)})
    else:
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
        "confidence": "high",
        "data_source": "SQL",
        "caveat": "Données calculées directement depuis la base de données. Aucune génération IA.",
    }


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
    return execute_intent(intent, question)
