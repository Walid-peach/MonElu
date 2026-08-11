"""
api/routers/groups.py

Parliamentary group pages — member roster, cohesion, dissidents, and voting
record (MON-150 / MON-108). Per ADR-026: live SQL aggregation over the
existing per-deputy marts, no new dbt mart, no groups table — slugs come
from the hardcoded api/groups_data.GROUP_SLUGS map over the 12 canonical
`deputies.party` labels.

Mart-derived fields (presence, dissidence) degrade to None when the dbt
marts are absent, mirroring api/routers/departments.py.
"""

import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.groups_data import normalize_slug
from api.limiter import limiter, tiered_limit
from api.schemas import GroupDetail, GroupMember, GroupVoteBreakdown

router = APIRouter()


def _fetch_mart_rates(cur, deputy_ids: list[str]) -> dict[str, dict]:
    """Per-deputy presence + dissident rates, {} when the marts are absent.

    Runs in its own savepoint-free branch: an UndefinedTable aborts the
    transaction, so callers must run this on a dedicated connection.
    """
    cur.execute(
        """
        SELECT s.deputy_id,
               s.presence_rate,
               a.dissident_rate
        FROM analytics_marts.mart_deputy_scorecard s
        LEFT JOIN analytics_marts.mart_party_alignment a
            ON a.deputy_id = s.deputy_id
        WHERE s.deputy_id = ANY(%s)
        """,
        (deputy_ids,),
    )
    return {r["deputy_id"]: r for r in cur.fetchall()}


def _rate(rates: dict[str, dict], deputy_id: str, key: str) -> float | None:
    row = rates.get(deputy_id)
    if row is None or row.get(key) is None:
        return None
    return float(row[key])


def _majority_position(pour: int, contre: int, abstention: int) -> str:
    """Plurality position, tied at the count and tie-broken alphabetically.

    Mirrors `int_party_vote_majority` (MON-24, MON-228): the canonical
    definition lives in dbt, this replicates it over raw tables so the
    group page works even when the mart is absent (ADR-026). Do not
    diverge from this tiebreak — see decisions.md ADR-033.
    """
    counts = {"abstention": abstention, "contre": contre, "pour": pour}
    top = max(counts.values())
    return min(position for position, count in counts.items() if count == top)


@router.get("/{slug}", response_model=GroupDetail)
@limiter.limit(tiered_limit(30))
def get_group(
    request: Request,
    slug: str,
    dissidents_limit: int = Query(5, ge=1, le=50),
    divided_votes_limit: int = Query(10, ge=1, le=50),
    recent_scrutins_limit: int = Query(10, ge=1, le=50),
):
    canonical_slug = slug.strip().lower()
    party = normalize_slug(canonical_slug)
    if party is None:
        raise HTTPException(status_code=404, detail="Unknown group")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Current members only (mandate_end IS NULL) — the page answers
            # "who sits in this group now", not the historical roster.
            cur.execute(
                """
                SELECT deputy_id, full_name, party, party_short,
                       department, circonscription, photo_url
                FROM deputies
                WHERE party = %s AND mandate_end IS NULL
                ORDER BY last_name, first_name
                """,
                (party,),
            )
            member_rows = cur.fetchall()

            if not member_rows:
                raise HTTPException(status_code=404, detail="No active deputies for this group")

            deputy_ids = [r["deputy_id"] for r in member_rows]

            # Every vote at least one current member expressed a position on,
            # with the group's pour/contre/abstention split. Raw tables only —
            # works even when the dbt marts are missing. ~1,200 votes total at
            # current scale, so one unbounded query plus in-Python sorting
            # (below) is cheaper than two round trips.
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
                ORDER BY v.voted_at DESC NULLS LAST
                """,
                (deputy_ids,),
            )
            vote_rows = cur.fetchall()

    # Mart highlights on a fresh connection: an UndefinedTable error aborts
    # the whole transaction, which would poison the queries above if shared.
    rates: dict[str, dict] = {}
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                rates = _fetch_mart_rates(cur, deputy_ids)
    except psycopg2.errors.UndefinedTable:
        rates = {}

    members = [
        GroupMember(
            **row,
            presence_rate=_rate(rates, row["deputy_id"], "presence_rate"),
            dissident_rate=_rate(rates, row["deputy_id"], "dissident_rate"),
        )
        for row in member_rows
    ]

    presence_values = [m.presence_rate for m in members if m.presence_rate is not None]
    avg_presence = sum(presence_values) / len(presence_values) if presence_values else None

    dissident_values = [m.dissident_rate for m in members if m.dissident_rate is not None]
    avg_dissident = sum(dissident_values) / len(dissident_values) if dissident_values else None

    most_dissident_members = sorted(
        (m for m in members if m.dissident_rate is not None),
        key=lambda m: m.dissident_rate,
        reverse=True,
    )[:dissidents_limit]

    breakdowns = [
        GroupVoteBreakdown(
            **row,
            majority_position=_majority_position(row["pour"], row["contre"], row["abstention"]),
        )
        for row in vote_rows
    ]

    divided_votes = sorted(
        (b for b in breakdowns if b.pour > 0 and b.contre > 0),
        key=lambda b: min(b.pour, b.contre),
        reverse=True,
    )[:divided_votes_limit]

    recent_scrutins = breakdowns[:recent_scrutins_limit]

    return GroupDetail(
        slug=canonical_slug,
        name=party,
        member_count=len(members),
        members=members,
        avg_presence_rate=avg_presence,
        avg_dissident_rate=avg_dissident,
        most_dissident_members=most_dissident_members,
        divided_votes=divided_votes,
        recent_scrutins=recent_scrutins,
    )
