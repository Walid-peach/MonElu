import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query

from api.schemas import VoteDetail, VoteListResponse, VotePosition, VoteSummary

load_dotenv()

router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@router.get("/", response_model=VoteListResponse)
def list_votes(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    result: str = Query(None, description="Filter by result: adopté | rejeté"),
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            filters = []
            params: list = []

            if result:
                filters.append("result = %s")
                params.append(result)

            where = ("WHERE " + " AND ".join(filters)) if filters else ""

            cur.execute(f"SELECT COUNT(*) FROM votes {where}", params)
            total = cur.fetchone()["count"]

            cur.execute(
                f"""
                SELECT vote_id, voted_at, vote_title, result,
                       votes_for, votes_against, abstentions, total_voters
                FROM votes {where}
                ORDER BY voted_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return VoteListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[VoteSummary(**r) for r in rows],
    )


@router.get("/{vote_id}", response_model=VoteDetail)
def get_vote(vote_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM votes WHERE vote_id = %s", (vote_id,))
            vote = cur.fetchone()
            if not vote:
                raise HTTPException(status_code=404, detail="Vote not found")

            cur.execute(
                """
                SELECT vp.position_id, vp.deputy_id, d.full_name,
                       d.party_short, vp.position
                FROM vote_positions vp
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                WHERE vp.vote_id = %s
                ORDER BY vp.position, d.last_name
                """,
                (vote_id,),
            )
            position_rows = cur.fetchall()
    finally:
        conn.close()

    return VoteDetail(
        **vote,
        positions=[VotePosition(**r) for r in position_rows],
    )
