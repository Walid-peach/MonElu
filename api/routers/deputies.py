import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query, Request

from api.limiter import limiter
from api.schemas import DeputyDetail, DeputyListResponse, DeputyScorecard, DeputySummary

load_dotenv()

router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@router.get("/", response_model=DeputyListResponse)
def list_deputies(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str = Query(None, description="Filter by name (case-insensitive)"),
    department: str = Query(None),
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            filters = []
            params: list = []

            if search:
                filters.append("full_name ILIKE %s")
                params.append(f"%{search}%")
            if department:
                filters.append("department = %s")
                params.append(department)

            where = ("WHERE " + " AND ".join(filters)) if filters else ""

            cur.execute(f"SELECT COUNT(*) FROM deputies {where}", params)
            total = cur.fetchone()["count"]

            cur.execute(
                f"""
                SELECT deputy_id, full_name, party, party_short,
                       department, circonscription, photo_url
                FROM deputies {where}
                ORDER BY last_name, first_name
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return DeputyListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[DeputySummary(**r) for r in rows],
    )


@router.get("/{deputy_id}", response_model=DeputyDetail)
def get_deputy(deputy_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM deputies WHERE deputy_id = %s", (deputy_id,))
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyDetail(**row)


@router.get("/{deputy_id}/scorecard", response_model=DeputyScorecard)
@limiter.limit("10/minute")
def get_scorecard(request: Request, deputy_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT deputy_id, full_name FROM deputies WHERE deputy_id = %s", (deputy_id,))
            deputy = cur.fetchone()
            if not deputy:
                raise HTTPException(status_code=404, detail="Deputy not found")

            cur.execute(
                """
                SELECT
                    COUNT(*)                                             AS total_votes,
                    COUNT(*) FILTER (WHERE position != 'nonVotant')     AS present_votes,
                    COUNT(*) FILTER (WHERE position = 'pour')           AS votes_for,
                    COUNT(*) FILTER (WHERE position = 'contre')         AS votes_against,
                    COUNT(*) FILTER (WHERE position = 'abstention')     AS abstentions
                FROM vote_positions
                WHERE deputy_id = %s
                """,
                (deputy_id,),
            )
            stats = cur.fetchone()
    finally:
        conn.close()

    total = stats["total_votes"] or 0
    present = stats["present_votes"] or 0
    votes_for = stats["votes_for"] or 0
    votes_against = stats["votes_against"] or 0
    abstentions = stats["abstentions"] or 0

    return DeputyScorecard(
        deputy_id=deputy["deputy_id"],
        full_name=deputy["full_name"],
        total_votes=total,
        present_votes=present,
        presence_rate=round(present / total, 4) if total else 0.0,
        votes_for=votes_for,
        votes_against=votes_against,
        abstentions=abstentions,
        votes_for_pct=round(votes_for / present, 4) if present else 0.0,
        abstention_pct=round(abstentions / present, 4) if present else 0.0,
    )
