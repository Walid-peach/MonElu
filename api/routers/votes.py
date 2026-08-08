import base64
import binascii
from datetime import datetime
from typing import Optional

import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from psycopg2 import sql
from starlette.requests import Request

from api.csv_export import csv_response
from api.db import MART_UNAVAILABLE, get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import VoteDetail, VoteListResponse, VotePosition, VoteSummary

router = APIRouter()


def _encode_cursor(voted_at: Optional[datetime], vote_id: str) -> str:
    """Opaque keyset cursor over the list's sort key (voted_at, vote_id).

    voted_at may be None - undated votes sort last (NULLS LAST) and still
    need a cursor to page past them. stg_votes currently drops null-dated
    votes before the mart (ADR-031), so this path is defense-in-depth, not
    dead code: it only fires if that filter is ever relaxed.
    """
    ts = voted_at.isoformat() if voted_at is not None else ""
    raw = f"{ts}|{vote_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(token: str) -> tuple[Optional[datetime], str]:
    """Reverse of _encode_cursor; raises 422 on a malformed token."""
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        ts, vote_id = raw.rsplit("|", 1)
        return (datetime.fromisoformat(ts) if ts else None), vote_id
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="Invalid cursor") from exc


@router.get("/", response_model=VoteListResponse)
@limiter.limit(tiered_limit(30))
def list_votes(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000),
    before: Optional[str] = Query(
        None,
        description="Keyset cursor for deep pagination — pass the next_cursor from a "
        "previous response. Overrides offset when set, so it reaches votes beyond "
        "the offset ceiling.",
    ),
    result: str = Query(None, description="Filter by result: adopté | rejeté"),
    theme: str = Query(None, description="Filter by theme category"),
    search: str = Query(
        None,
        description="Full-text search over vote_title and summary_plain (French stemming)",
    ),
):
    # Decode before opening a connection so a bad cursor fails fast with 422.
    cursor_key = _decode_cursor(before) if before else None

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                conditions: list[sql.Composable] = []
                params: list = []

                if result:
                    conditions.append(sql.SQL("result = %s"))
                    params.append(result)

                if theme:
                    conditions.append(sql.SQL("theme = %s"))
                    params.append(theme)

                if search:
                    conditions.append(
                        sql.SQL(
                            "to_tsvector('french', vote_title || ' ' "
                            "|| coalesce(summary_plain, ''))"
                            " @@ plainto_tsquery('french', %s)"
                        )
                    )
                    params.append(search)

                # total reflects the full filtered set, independent of the cursor window.
                count_where = (
                    sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions)
                    if conditions
                    else sql.SQL("")
                )
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM analytics_marts.mart_vote_summary") + count_where,
                    params,
                )
                total = cur.fetchone()["count"]

                page_conditions = list(conditions)
                page_params = list(params)
                if cursor_key:
                    # NULLS LAST puts undated votes after all dated ones; coalescing
                    # both sides to '-infinity' before comparing keeps the row
                    # constructor total-ordered even when voted_at is NULL — a bare
                    # (voted_at, vote_id) < (%s, %s) comparison evaluates to NULL
                    # (and silently drops the row) whenever either side is NULL.
                    page_conditions.append(
                        sql.SQL(
                            "(COALESCE(voted_at, '-infinity'::timestamptz), vote_id) < "
                            "(COALESCE(%s::timestamptz, '-infinity'::timestamptz), %s)"
                        )
                    )
                    page_params.extend(cursor_key)

                where = (
                    sql.SQL(" WHERE ") + sql.SQL(" AND ").join(page_conditions)
                    if page_conditions
                    else sql.SQL("")
                )

                # Cursor paging walks the keyset directly; offset is only for shallow
                # (cursor-less) paging and is ignored once a cursor is supplied.
                effective_offset = 0 if cursor_key else offset

                cur.execute(
                    sql.SQL("""
                        SELECT vote_id, voted_at, vote_title, result,
                               votes_for, votes_against, abstentions, total_voters,
                               summary_plain, theme
                        FROM analytics_marts.mart_vote_summary {}
                        ORDER BY voted_at DESC NULLS LAST, vote_id DESC LIMIT %s OFFSET %s
                    """).format(where),
                    page_params + [limit, effective_offset],
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    # A full page implies there may be more; hand back a cursor to the next window.
    next_cursor = (
        _encode_cursor(rows[-1]["voted_at"], rows[-1]["vote_id"]) if len(rows) == limit else None
    )

    return VoteListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[VoteSummary(**r) for r in rows],
        next_cursor=next_cursor,
    )


@router.get("/latest", response_model=list[VoteSummary])
@limiter.limit(tiered_limit(30))
def latest_votes(request: Request):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT vote_id, voted_at, vote_title, result,
                           votes_for, votes_against, abstentions, total_voters,
                           summary_plain, theme
                    FROM analytics_marts.mart_vote_summary
                    ORDER BY voted_at DESC NULLS LAST
                    LIMIT 10
                    """
                )
                rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None
    return [VoteSummary(**r) for r in rows]


@router.get(
    "/{vote_id}/positions.csv",
    summary="CSV export of every deputy's position on one vote (MON-97)",
)
@limiter.limit(tiered_limit(10))
def export_vote_positions_csv(request: Request, vote_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT vote_id FROM votes WHERE vote_id = %s", (vote_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Vote not found")

            cur.execute(
                """
                SELECT vp.vote_id, vp.deputy_id, d.full_name, d.party, d.party_short,
                       d.department, vp.position
                FROM vote_positions vp
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                WHERE vp.vote_id = %s
                ORDER BY vp.position, d.last_name, d.first_name
                """,
                (vote_id,),
            )
            rows = cur.fetchall()

    return csv_response(
        ["vote_id", "deputy_id", "full_name", "party", "party_short", "department", "position"],
        rows,
        f"monelu_scrutin_{vote_id}_positions.csv",
    )


@router.get("/{vote_id}", response_model=VoteDetail)
@limiter.limit(tiered_limit(30))
def get_vote(request: Request, vote_id: str):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM analytics_marts.mart_vote_summary WHERE vote_id = %s",
                    (vote_id,),
                )
                vote = cur.fetchone()
                if not vote:
                    raise HTTPException(status_code=404, detail="Vote not found")

                cur.execute(
                    """
                    SELECT vp.deputy_id, d.full_name,
                           d.party_short, vp.position
                    FROM vote_positions vp
                    JOIN deputies d ON d.deputy_id = vp.deputy_id
                    WHERE vp.vote_id = %s
                    ORDER BY vp.position, d.last_name
                    """,
                    (vote_id,),
                )
                position_rows = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    return VoteDetail(
        **vote,
        positions=[VotePosition(**r) for r in position_rows],
    )
