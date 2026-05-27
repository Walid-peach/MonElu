import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from psycopg2 import sql
from starlette.requests import Request

from api.db import MART_UNAVAILABLE, get_conn
from api.limiter import limiter
from api.schemas import DeputyDetail, DeputyListResponse, DeputyScorecard, DeputySummary

router = APIRouter()


@router.get("/", response_model=DeputyListResponse)
@limiter.limit("30/minute")
def list_deputies(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000),
    search: str = Query(None, description="Filter by name (case-insensitive)"),
    department: str = Query(None),
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


@router.get("/{deputy_id}", response_model=DeputyDetail)
@limiter.limit("30/minute")
def get_deputy(request: Request, deputy_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM deputies WHERE deputy_id = %s", (deputy_id,))
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyDetail(**row)


@router.get("/{deputy_id}/scorecard", response_model=DeputyScorecard)
@limiter.limit("10/minute")
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
                        abstention_pct
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
