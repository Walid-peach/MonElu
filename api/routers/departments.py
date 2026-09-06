"""
api/routers/departments.py

Department pages — "les députés de chez moi" (MON-107).

One read endpoint returning everything the /departements/[code] frontend
page needs: the department's current deputies with scorecard highlights,
department-level aggregates, and recent votes where the deputies split.

Mart-derived fields (presence, alignment) degrade to None when the dbt
marts are absent, mirroring /health rather than failing the whole page.
"""

from collections import Counter

import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.departments_data import DEPT_NAMES, db_department_values, normalize_code
from api.limiter import limiter, tiered_limit
from api.schemas import (
    DepartmentDeputy,
    DepartmentDetail,
    DepartmentPartyCount,
    DepartmentSplitVote,
)

router = APIRouter()


def _fetch_mart_rates(cur, deputy_ids: list[str]) -> dict[str, dict]:
    """Per-deputy scorecard + alignment rates, {} when the marts are absent.

    Runs in its own savepoint-free branch: an UndefinedTable aborts the
    transaction, so callers must run this on a dedicated connection.
    """
    cur.execute(
        """
        SELECT s.deputy_id,
               s.presence_rate,
               s.solennel_participation_rate,
               a.party_alignment_rate,
               a.dissident_rate
        FROM analytics_marts.mart_deputy_scorecard s
        LEFT JOIN analytics_marts.mart_party_alignment a
            ON a.deputy_id = s.deputy_id
        WHERE s.deputy_id = ANY(%s)
        """,
        (deputy_ids,),
    )
    return {r["deputy_id"]: r for r in cur.fetchall()}


@router.get(
    "/{code}",
    response_model=DepartmentDetail,
    summary="The deputies of one département, with local aggregates",
)
@limiter.limit(tiered_limit(30))
def get_department(
    request: Request,
    code: str,
    split_votes_limit: int = Query(10, ge=1, le=50),
):
    """One département addressed by its INSEE code - `59`, `2A`, `971`, `75`.

    Answers "who represents this place": the current deputies, the group
    breakdown, and the recent scrutins where those deputies did not vote
    together. A département with a single seat has no split votes by definition.

    `split_votes` requires deputies on opposing sides of the same scrutin, so it
    reflects local disagreement rather than national controversy.
    `avg_presence_rate` and `most_dissident` are null when the analytics layer is
    unavailable; the roster still works.

    Codes are matched leniently (case, zero-padding), but must be the department
    code, not the name and not a circonscription. 404 on an unknown code.
    """
    canonical = normalize_code(code)
    if canonical is None:
        raise HTTPException(status_code=404, detail="Unknown department code")

    dept_values = db_department_values(canonical)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Current deputies only (mandate_end IS NULL) — the page answers
            # "who represents me now", not the historical roster.
            cur.execute(
                """
                SELECT deputy_id, full_name, party, party_short,
                       department, circonscription, photo_url
                FROM deputies
                WHERE department = ANY(%s) AND mandate_end IS NULL
                -- circonscription is TEXT holding a bare number ("1", "10"):
                -- sort numerically, not lexicographically
                ORDER BY NULLIF(regexp_replace(circonscription, '[^0-9]', '', 'g'), '')::int
                         NULLS LAST,
                         last_name, first_name
                """,
                (dept_values,),
            )
            deputy_rows = cur.fetchall()

            if not deputy_rows:
                raise HTTPException(
                    status_code=404, detail="No active deputies for this department"
                )

            deputy_ids = [r["deputy_id"] for r in deputy_rows]

            # Recent votes where the department's deputies expressed opposing
            # positions (at least one pour and one contre). Raw tables only —
            # this works even when the dbt marts are missing.
            cur.execute(
                """
                SELECT v.vote_id, v.voted_at, v.vote_title, v.result,
                       COUNT(*) FILTER (WHERE vp.position = 'pour')       AS pour,
                       COUNT(*) FILTER (WHERE vp.position = 'contre')     AS contre,
                       COUNT(*) FILTER (WHERE vp.position = 'abstention') AS abstention
                FROM vote_positions vp
                JOIN votes v ON v.vote_id = vp.vote_id
                WHERE vp.deputy_id = ANY(%s)
                  AND vp.position IN ('pour', 'contre', 'abstention')
                GROUP BY v.vote_id, v.voted_at, v.vote_title, v.result
                HAVING COUNT(*) FILTER (WHERE vp.position = 'pour') > 0
                   AND COUNT(*) FILTER (WHERE vp.position = 'contre') > 0
                ORDER BY v.voted_at DESC NULLS LAST
                LIMIT %s
                """,
                (deputy_ids, split_votes_limit),
            )
            split_rows = cur.fetchall()

    # Mart highlights on a fresh connection: an UndefinedTable error aborts
    # the whole transaction, which would poison the queries above if shared.
    rates: dict[str, dict] = {}
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                rates = _fetch_mart_rates(cur, deputy_ids)
    except psycopg2.errors.UndefinedTable:
        rates = {}

    deputies = [
        DepartmentDeputy(
            **row,
            presence_rate=_rate(rates, row["deputy_id"], "presence_rate"),
            solennel_participation_rate=_rate(
                rates, row["deputy_id"], "solennel_participation_rate"
            ),
            party_alignment_rate=_rate(rates, row["deputy_id"], "party_alignment_rate"),
            dissident_rate=_rate(rates, row["deputy_id"], "dissident_rate"),
        )
        for row in deputy_rows
    ]

    presence_values = [d.presence_rate for d in deputies if d.presence_rate is not None]
    avg_presence = sum(presence_values) / len(presence_values) if presence_values else None

    party_counts = Counter(d.party for d in deputies)
    party_distribution = [
        DepartmentPartyCount(party=party, count=count)
        for party, count in party_counts.most_common()
    ]

    dissidents = [d for d in deputies if d.dissident_rate is not None]
    most_dissident = max(dissidents, key=lambda d: d.dissident_rate) if dissidents else None

    return DepartmentDetail(
        code=canonical,
        name=DEPT_NAMES[canonical],
        deputy_count=len(deputies),
        deputies=deputies,
        avg_presence_rate=avg_presence,
        party_distribution=party_distribution,
        most_dissident=most_dissident,
        split_votes=[DepartmentSplitVote(**r) for r in split_rows],
    )


def _rate(rates: dict[str, dict], deputy_id: str, key: str) -> float | None:
    row = rates.get(deputy_id)
    if row is None or row.get(key) is None:
        return None
    return float(row[key])
