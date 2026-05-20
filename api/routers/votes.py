from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.limiter import limiter
from api.schemas import VoteDetail, VoteListResponse, VotePosition, VoteSummary

router = APIRouter()


@router.get("/", response_model=VoteListResponse)
@limiter.limit("30/minute")
def list_votes(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=100_000),
    result: str = Query(None, description="Filter by result: adopté | rejeté"),
):
    with get_conn() as conn:
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

    return VoteListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[VoteSummary(**r) for r in rows],
    )


@router.get("/latest", response_model=list[VoteSummary])
@limiter.limit("30/minute")
def latest_votes(request: Request):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vote_id, voted_at, vote_title, result,
                       votes_for, votes_against, abstentions, total_voters
                FROM votes
                ORDER BY voted_at DESC
                LIMIT 10
                """
            )
            rows = cur.fetchall()
    return [VoteSummary(**r) for r in rows]


@router.get("/{vote_id}", response_model=VoteDetail)
@limiter.limit("30/minute")
def get_vote(request: Request, vote_id: str):
    with get_conn() as conn:
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

    return VoteDetail(
        **vote,
        positions=[VotePosition(**r) for r in position_rows],
    )
