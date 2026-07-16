from datetime import datetime
from typing import Optional

import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from psycopg2 import sql
from starlette.requests import Request

from api.csv_export import csv_response
from api.db import MART_UNAVAILABLE, get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import (
    DeputyAlignment,
    DeputyDetail,
    DeputyDissidentVotesResponse,
    DeputyDivergingVotesResponse,
    DeputyListResponse,
    DeputyScorecard,
    DeputyScorecardListResponse,
    DeputyScorecardRow,
    DeputyStats,
    DeputySummary,
    DeputyVoteItem,
    DeputyVotesResponse,
    DissidentVoteItem,
    DivergingVoteItem,
)

router = APIRouter()

# One scorecard row per deputy with party/department context — shared by the
# JSON table endpoint and the CSV export so both always agree (MON-97).
_SCORECARD_ROWS_SQL = """
    SELECT
        s.deputy_id,
        s.full_name,
        d.party,
        d.party_short,
        d.department,
        s.total_votes_cast                          AS total_votes,
        (s.total_votes_cast - s.total_nonvotant)    AS present_votes,
        s.presence_rate,
        s.total_pour                                AS votes_for,
        s.total_contre                              AS votes_against,
        s.total_abstention                          AS abstentions,
        s.votes_for_pct,
        s.abstention_pct,
        s.eligible_solennels,
        s.total_solennels_cast                      AS solennels_cast,
        s.solennel_participation_rate,
        s.eligible_voting_days,
        s.total_voting_days_present                 AS voting_days_present,
        s.voting_days_rate
    FROM analytics_marts.mart_deputy_scorecard s
    JOIN deputies d ON d.deputy_id = s.deputy_id
    ORDER BY d.last_name, d.first_name
"""

_SCORECARD_CSV_COLUMNS = [
    "deputy_id",
    "full_name",
    "party",
    "party_short",
    "department",
    "total_votes",
    "present_votes",
    "presence_rate",
    "votes_for",
    "votes_against",
    "abstentions",
    "votes_for_pct",
    "abstention_pct",
    "eligible_solennels",
    "solennels_cast",
    "solennel_participation_rate",
    "eligible_voting_days",
    "voting_days_present",
    "voting_days_rate",
]


def _fetch_scorecard_rows() -> list[dict]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(_SCORECARD_ROWS_SQL)
                return cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None


@router.get("/", response_model=DeputyListResponse)
@limiter.limit(tiered_limit(30))
def list_deputies(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000),
    search: str = Query(None, description="Filter by name (case-insensitive)"),
    department: str = Query(None),
    party: str = Query(
        None, description="Exact match on party name (e.g. 'Rassemblement National')"
    ),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            conditions: list[sql.Composable] = []
            params: list = []

            if search:
                conditions.append(sql.SQL("full_name ILIKE %s"))
                params.append(f"%{search}%")
            if department:
                conditions.append(sql.SQL("department = %s"))
                params.append(department)
            if party:
                conditions.append(sql.SQL("party = %s"))
                params.append(party)

            where = (
                sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions)
                if conditions
                else sql.SQL("")
            )

            cur.execute(sql.SQL("SELECT COUNT(*) FROM deputies") + where, params)
            total = cur.fetchone()["count"]

            cur.execute(
                sql.SQL("""
                    SELECT deputy_id, full_name, party, party_short,
                           department, circonscription, photo_url
                    FROM deputies {} ORDER BY last_name, first_name LIMIT %s OFFSET %s
                """).format(where),
                params + [limit, offset],
            )
            rows = cur.fetchall()

    return DeputyListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[DeputySummary(**r) for r in rows],
    )


@router.get("/stats", response_model=DeputyStats)
@limiter.limit(tiered_limit(30))
def get_deputy_stats(
    request: Request,
    party: str = Query(
        None,
        description="Scope the averages to one party (for deputy-vs-party comparison, MON-92)",
    ),
):
    where = sql.SQL(" WHERE party = %s") if party else sql.SQL("")
    params = [party] if party else []
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT AVG(presence_rate) AS avg_presence_rate, "
                        "AVG(solennel_participation_rate) AS avg_solennel_participation_rate, "
                        "AVG(voting_days_rate) AS avg_voting_days_rate, "
                        "AVG(votes_for_pct) AS avg_votes_for_pct, "
                        "AVG(abstention_pct) AS avg_abstention_pct "
                        "FROM analytics_marts.mart_deputy_scorecard{}"
                    ).format(where),
                    params,
                )
                row = cur.fetchone()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    def _avg(key: str) -> Optional[float]:
        value = row[key]
        return float(value) if value is not None else None

    return DeputyStats(
        avg_presence_rate=_avg("avg_presence_rate"),
        avg_solennel_participation_rate=_avg("avg_solennel_participation_rate"),
        avg_voting_days_rate=_avg("avg_voting_days_rate"),
        avg_votes_for_pct=_avg("avg_votes_for_pct"),
        avg_abstention_pct=_avg("avg_abstention_pct"),
    )


@router.get(
    "/scorecards",
    response_model=DeputyScorecardListResponse,
    summary="All deputies' scorecards in one response — feeds the dense table view (MON-97)",
)
@limiter.limit(tiered_limit(10))
def list_scorecards(request: Request):
    rows = _fetch_scorecard_rows()
    return DeputyScorecardListResponse(
        total=len(rows),
        items=[DeputyScorecardRow(**r) for r in rows],
    )


@router.get(
    "/scorecard.csv",
    summary="CSV export of every deputy's scorecard (MON-97)",
)
@limiter.limit(tiered_limit(10))
def export_scorecards_csv(request: Request):
    rows = _fetch_scorecard_rows()
    return csv_response(_SCORECARD_CSV_COLUMNS, rows, "monelu_scorecard_deputes.csv")


@router.get("/{deputy_id}", response_model=DeputyDetail)
@limiter.limit(tiered_limit(30))
def get_deputy(request: Request, deputy_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM deputies WHERE deputy_id = %s", (deputy_id,))
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyDetail(**row)


@router.get("/{deputy_id}/votes", response_model=DeputyVotesResponse)
@limiter.limit(tiered_limit(30))
def get_deputy_votes(
    request: Request,
    deputy_id: str,
    limit: int = Query(10, ge=1, le=50),
    since: Optional[datetime] = Query(
        None,
        description="Only return votes after this timestamp (ISO 8601) — used to "
        "surface what changed since a visitor's last visit.",
    ),
):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM vote_positions WHERE deputy_id = %s",
                    (deputy_id,),
                )
                total = cur.fetchone()["count"]

                conditions = [sql.SQL("vp.deputy_id = %s")]
                params: list = [deputy_id]
                if since:
                    conditions.append(sql.SQL("v.voted_at > %s"))
                    params.append(since)
                where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions)

                cur.execute(
                    sql.SQL("""
                        SELECT vp.vote_id, v.voted_at, v.vote_title, v.result, vp.position,
                               v.summary_plain
                        FROM vote_positions vp
                        JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vp.vote_id
                        {} ORDER BY v.voted_at DESC NULLS LAST LIMIT %s
                    """).format(where),
                    params + [limit],
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    return DeputyVotesResponse(
        deputy_id=deputy_id,
        total=total,
        items=[DeputyVoteItem(**r) for r in rows],
    )


@router.get(
    "/{deputy_id}/votes.csv",
    summary="CSV export of a deputy's full voting record (MON-97)",
)
@limiter.limit(tiered_limit(10))
def export_deputy_votes_csv(request: Request, deputy_id: str):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT full_name FROM deputies WHERE deputy_id = %s",
                    (deputy_id,),
                )
                deputy = cur.fetchone()
                if deputy is None:
                    raise HTTPException(status_code=404, detail="Deputy not found")

                cur.execute(
                    """
                    SELECT vp.deputy_id, vp.vote_id, v.voted_at, v.vote_title,
                           v.theme, v.result, vp.position
                    FROM vote_positions vp
                    JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vp.vote_id
                    WHERE vp.deputy_id = %s
                    ORDER BY v.voted_at DESC NULLS LAST, vp.vote_id DESC
                    """,
                    (deputy_id,),
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    return csv_response(
        ["deputy_id", "vote_id", "voted_at", "vote_title", "theme", "result", "position"],
        rows,
        f"monelu_depute_{deputy_id}_votes.csv",
    )


@router.get("/{deputy_id}/scorecard", response_model=DeputyScorecard)
@limiter.limit(tiered_limit(10))
def get_scorecard(request: Request, deputy_id: str):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        deputy_id,
                        full_name,
                        total_votes_cast                          AS total_votes,
                        (total_votes_cast - total_nonvotant)      AS present_votes,
                        presence_rate,
                        total_pour                                AS votes_for,
                        total_contre                              AS votes_against,
                        total_abstention                          AS abstentions,
                        votes_for_pct,
                        abstention_pct,
                        eligible_solennels,
                        total_solennels_cast                      AS solennels_cast,
                        solennel_participation_rate,
                        eligible_voting_days,
                        total_voting_days_present                 AS voting_days_present,
                        voting_days_rate
                    FROM analytics_marts.mart_deputy_scorecard
                    WHERE deputy_id = %s
                    """,
                    (deputy_id,),
                )
                row = cur.fetchone()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyScorecard(**row)


@router.get("/{deputy_id}/alignment", response_model=DeputyAlignment)
@limiter.limit(tiered_limit(10))
def get_alignment(request: Request, deputy_id: str):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        deputy_id,
                        full_name,
                        party,
                        total_votes,
                        aligned_votes,
                        dissident_votes,
                        party_alignment_rate,
                        dissident_rate,
                        updated_at
                    FROM analytics_marts.mart_party_alignment
                    WHERE deputy_id = %s
                    """,
                    (deputy_id,),
                )
                row = cur.fetchone()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyAlignment(**row)


@router.get("/{deputy_id}/dissident-votes", response_model=DeputyDissidentVotesResponse)
@limiter.limit(tiered_limit(10))
def get_dissident_votes(
    request: Request,
    deputy_id: str,
    limit: int = Query(10, ge=1, le=50),
):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM vote_positions vp
                    JOIN deputies d ON d.deputy_id = vp.deputy_id
                    JOIN analytics_intermediate.int_party_vote_majority m
                        ON m.vote_id = vp.vote_id AND m.party = d.party
                    WHERE vp.deputy_id = %s
                      AND vp.position IN ('pour', 'contre', 'abstention')
                      AND vp.position != m.majority_position
                    """,
                    (deputy_id,),
                )
                total = cur.fetchone()["count"]

                cur.execute(
                    """
                    SELECT vp.vote_id, v.voted_at, v.vote_title, v.result,
                           vp.position, m.majority_position
                    FROM vote_positions vp
                    JOIN deputies d ON d.deputy_id = vp.deputy_id
                    JOIN analytics_intermediate.int_party_vote_majority m
                        ON m.vote_id = vp.vote_id AND m.party = d.party
                    JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vp.vote_id
                    WHERE vp.deputy_id = %s
                      AND vp.position IN ('pour', 'contre', 'abstention')
                      AND vp.position != m.majority_position
                    ORDER BY v.voted_at DESC NULLS LAST
                    LIMIT %s
                    """,
                    (deputy_id, limit),
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    return DeputyDissidentVotesResponse(
        deputy_id=deputy_id,
        total=total,
        items=[DissidentVoteItem(**r) for r in rows],
    )


@router.get(
    "/{deputy_id}/diverging-votes",
    response_model=DeputyDivergingVotesResponse,
)
@limiter.limit(tiered_limit(10))
def get_diverging_votes(
    request: Request,
    deputy_id: str,
    other_deputy_id: str = Query(..., description="The other deputy to compare against (MON-92)"),
    limit: int = Query(10, ge=1, le=50),
):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM vote_positions vpa
                    JOIN vote_positions vpb
                        ON vpb.vote_id = vpa.vote_id AND vpb.deputy_id = %s
                    WHERE vpa.deputy_id = %s
                      AND vpa.position IN ('pour', 'contre', 'abstention')
                      AND vpb.position IN ('pour', 'contre', 'abstention')
                      AND vpa.position != vpb.position
                    """,
                    (other_deputy_id, deputy_id),
                )
                total = cur.fetchone()["count"]

                cur.execute(
                    """
                    SELECT vpa.vote_id, v.voted_at, v.vote_title, v.result, v.summary_plain,
                           vpa.position AS position_a, vpb.position AS position_b
                    FROM vote_positions vpa
                    JOIN vote_positions vpb
                        ON vpb.vote_id = vpa.vote_id AND vpb.deputy_id = %s
                    JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vpa.vote_id
                    WHERE vpa.deputy_id = %s
                      AND vpa.position IN ('pour', 'contre', 'abstention')
                      AND vpb.position IN ('pour', 'contre', 'abstention')
                      AND vpa.position != vpb.position
                    ORDER BY v.voted_at DESC NULLS LAST
                    LIMIT %s
                    """,
                    (other_deputy_id, deputy_id, limit),
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    return DeputyDivergingVotesResponse(
        deputy_a_id=deputy_id,
        deputy_b_id=other_deputy_id,
        total=total,
        items=[DivergingVoteItem(**r) for r in rows],
    )
