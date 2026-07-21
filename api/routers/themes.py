"""
api/routers/themes.py

Theme hub pages (MON-106) — "comment les députés votent sur l'écologie ?"

One read endpoint returning everything the /themes/[slug] frontend page
needs: aggregate stats for the theme (vote count, adoption rate, most
divided vote), per-party positioning, and a paginated vote list.

Queries the raw votes/vote_positions/deputies tables directly, mirroring
api/routers/departments.py — no dbt mart dependency, so the page works even
when the marts are absent.
"""

from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import ThemeDetail, ThemeMostDividedVote, ThemePartyPosition, ThemeVoteItem
from api.themes_data import normalize_slug

router = APIRouter()


@router.get("/{slug}", response_model=ThemeDetail)
@limiter.limit(tiered_limit(30))
def get_theme(
    request: Request,
    slug: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    name = normalize_slug(slug)
    if name is None:
        raise HTTPException(status_code=404, detail="Unknown theme")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE result = 'adopté') AS adopted,
                       COUNT(*) FILTER (WHERE result IN ('adopté', 'rejeté')) AS decided
                FROM votes
                WHERE theme = %s
                """,
                (name,),
            )
            agg = cur.fetchone()

            if agg["total"] == 0:
                raise HTTPException(status_code=404, detail="No votes for this theme yet")

            # Smallest absolute pour/contre margin among votes with at least
            # one expressed position — the vote that split the chamber most.
            cur.execute(
                """
                SELECT vote_id, voted_at, vote_title, votes_for, votes_against
                FROM votes
                WHERE theme = %s AND votes_for + votes_against > 0
                ORDER BY ABS(votes_for - votes_against) ASC, voted_at DESC NULLS LAST
                LIMIT 1
                """,
                (name,),
            )
            most_divided_row = cur.fetchone()

            cur.execute(
                """
                SELECT d.party_short,
                       COUNT(*) FILTER (WHERE vp.position = 'pour')       AS pour,
                       COUNT(*) FILTER (WHERE vp.position = 'contre')     AS contre,
                       COUNT(*) FILTER (WHERE vp.position = 'abstention') AS abstention
                FROM vote_positions vp
                JOIN votes v ON v.vote_id = vp.vote_id
                JOIN deputies d ON d.deputy_id = vp.deputy_id
                WHERE v.theme = %s
                  AND vp.position IN ('pour', 'contre', 'abstention')
                GROUP BY d.party_short
                ORDER BY COUNT(*) DESC
                """,
                (name,),
            )
            party_rows = cur.fetchall()

            cur.execute(
                """
                SELECT vote_id, voted_at, vote_title, result, summary_plain
                FROM votes
                WHERE theme = %s
                ORDER BY voted_at DESC NULLS LAST, vote_id DESC
                LIMIT %s OFFSET %s
                """,
                (name, limit, offset),
            )
            vote_rows = cur.fetchall()

    party_positions = []
    for row in party_rows:
        expressed = row["pour"] + row["contre"] + row["abstention"]
        party_positions.append(
            ThemePartyPosition(
                party_short=row["party_short"],
                pour=row["pour"],
                contre=row["contre"],
                abstention=row["abstention"],
                expressed=expressed,
                pour_rate=row["pour"] / expressed if expressed else 0.0,
            )
        )

    return ThemeDetail(
        slug=slug,
        name=name,
        vote_count=agg["total"],
        adoption_rate=agg["adopted"] / agg["decided"] if agg["decided"] else None,
        most_divided_vote=ThemeMostDividedVote(**most_divided_row) if most_divided_row else None,
        party_positions=party_positions,
        votes_total=agg["total"],
        limit=limit,
        offset=offset,
        votes=[ThemeVoteItem(**r) for r in vote_rows],
    )
