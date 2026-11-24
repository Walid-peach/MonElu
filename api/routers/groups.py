"""
api/routers/groups.py

Parliamentary group pages — member roster, cohesion, dissidents, and voting
record (MON-150 / MON-108). Per ADR-026: live SQL aggregation over the
existing per-deputy marts, no new dbt mart, no groups table — slugs come
from the hardcoded api/groups_data.GROUP_SLUGS map over the 12 canonical
`deputies.party` labels.

Mart-derived fields (presence, dissidence) degrade to None when the dbt
marts are absent, read through `api.db.fetch_mart_rows` (#723).
"""

from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import fetch_mart_rows, get_conn
from api.groups_data import CANONICAL_SHORT_LABELS, GROUP_SLUGS, normalize_slug
from api.limiter import limiter, tiered_limit
from api.schemas import (
    GroupDetail,
    GroupListResponse,
    GroupMember,
    GroupSummary,
    GroupVoteBreakdown,
)

NON_INSCRITS = "Non inscrit"

SQL_MART_RATES = """
    SELECT s.deputy_id,
           s.presence_rate,
           a.dissident_rate
    FROM analytics_marts.mart_deputy_scorecard s
    LEFT JOIN analytics_marts.mart_party_alignment a
        ON a.deputy_id = s.deputy_id
    WHERE s.deputy_id = ANY(%(deputy_ids)s)
"""

SQL_GROUP_VOTES = """
    WITH tallies AS (
        SELECT v.vote_id, v.voted_at, v.vote_title, v.result,
               COUNT(*) FILTER (WHERE vp.position = 'pour')       AS pour,
               COUNT(*) FILTER (WHERE vp.position = 'contre')     AS contre,
               COUNT(*) FILTER (WHERE vp.position = 'abstention') AS abstention
        FROM vote_positions vp
        JOIN votes v ON v.vote_id = vp.vote_id
        WHERE vp.deputy_id = ANY(%(deputy_ids)s)
          AND vp.position IN ('pour', 'contre', 'abstention')
        GROUP BY v.vote_id, v.voted_at, v.vote_title, v.result
    ), divided AS (
        SELECT vote_id FROM tallies
        WHERE pour > 0 AND contre > 0
        ORDER BY LEAST(pour, contre) DESC, voted_at DESC NULLS LAST, vote_id DESC
        LIMIT %(divided_limit)s
    ), recent AS (
        SELECT vote_id FROM tallies
        ORDER BY voted_at DESC NULLS LAST, vote_id DESC
        LIMIT %(recent_limit)s
    )
    SELECT * FROM tallies
    WHERE vote_id IN (SELECT vote_id FROM divided UNION SELECT vote_id FROM recent)
    ORDER BY voted_at DESC NULLS LAST, vote_id DESC
"""

router = APIRouter()


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
    diverge from this tiebreak — see decisions.md ADR-034.
    """
    counts = {"abstention": abstention, "contre": contre, "pour": pour}
    top = max(counts.values())
    return min(position for position, count in counts.items() if count == top)


@router.get(
    "",
    response_model=GroupListResponse,
    summary="Every parliamentary group with its current seat count",
)
@limiter.limit(tiered_limit(30))
def list_groups(request: Request):
    """The 12 groups of the Assemblée, largest first, with the slug `GET /groups/{slug}` takes.

    `seat_count` counts **sitting** deputies only: listed by the Assemblée's
    latest roster and with no `mandate_end`. The counts add up to the seats
    filled today, at most 577. A group with no sitting member is left out, as
    `GET /groups/{slug}` answers 404 for it.
    `non-inscrits` is listed like the others but is not a group in any political
    sense: its members belong to none.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT party, COUNT(*) AS seat_count
                FROM deputies
                WHERE deputy_id IN (SELECT deputy_id FROM sitting_deputies) AND party IS NOT NULL
                GROUP BY party
                """
            )
            rows = cur.fetchall()

    slugs = {label: slug for slug, label in GROUP_SLUGS.items()}
    items = [
        GroupSummary(
            slug=slugs[r["party"]],
            name=r["party"],
            party_short=CANONICAL_SHORT_LABELS[r["party"]],
            seat_count=r["seat_count"],
        )
        for r in rows
        if r["party"] in slugs
    ]
    items.sort(key=lambda g: (-g.seat_count, g.name))
    return GroupListResponse(items=items)


@router.get(
    "/{slug}",
    response_model=GroupDetail,
    summary="A parliamentary group: roster, cohesion, and its most divided votes",
)
@limiter.limit(tiered_limit(30))
def get_group(
    request: Request,
    slug: str,
    dissidents_limit: int = Query(5, ge=1, le=50),
    divided_votes_limit: int = Query(10, ge=1, le=50),
    recent_scrutins_limit: int = Query(10, ge=1, le=50),
):
    """One parliamentary group, addressed by slug (`rn`, `lfi`, `epr`, `soc`, …).

    There are 12 groups, including `ni` for the non-inscrits, who are not a group
    in any political sense - just deputies belonging to none. Treat any aggregate
    over `ni` as a statistical artefact rather than a position.

    **Current members only.** Deputies who have left the Assemblée or changed
    groups are absent, and every rate here is computed over today's roster
    applied to the whole voting window. Group composition shifts during a
    legislature, so this is a snapshot, not a history.

    `avg_dissident_rate` is the group's cohesion inverted: higher means members
    break ranks more often. `divided_votes` ranks by how close the internal
    pour/contre split was, `recent_scrutins` is simply the newest. Both carry
    `majority_position`, the group's plurality on that scrutin (ties broken
    alphabetically), which is the same definition the per-deputy dissidence
    endpoints use.

    `seat_rank` is the group's place by current seats among the groups (1 is the
    largest; equal counts share a rank), null for `ni`.

    `avg_presence_rate` and `avg_dissident_rate` are null when the analytics
    layer is unavailable; the roster and the vote breakdowns still work. 404 on
    an unknown slug or a group with no sitting members.
    """
    canonical_slug = slug.strip().lower()
    party = normalize_slug(canonical_slug)
    if party is None:
        raise HTTPException(status_code=404, detail="Unknown group")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT deputy_id, full_name, party, party_short,
                       department, circonscription, photo_url
                FROM deputies
                WHERE party = %s AND deputy_id IN (SELECT deputy_id FROM sitting_deputies)
                ORDER BY last_name, first_name
                """,
                (party,),
            )
            member_rows = cur.fetchall()

            if not member_rows:
                raise HTTPException(status_code=404, detail="No active deputies for this group")

            cur.execute(
                """
                SELECT seat_rank FROM (
                    SELECT party, RANK() OVER (ORDER BY COUNT(*) DESC) AS seat_rank
                    FROM deputies
                    WHERE deputy_id IN (SELECT deputy_id FROM sitting_deputies)
                      AND party IS NOT NULL AND party <> %s
                    GROUP BY party
                ) ranked
                WHERE party = %s
                """,
                (NON_INSCRITS, party),
            )
            rank_row = cur.fetchone()

            deputy_ids = [r["deputy_id"] for r in member_rows]

            cur.execute(
                SQL_GROUP_VOTES,
                {
                    "deputy_ids": deputy_ids,
                    "divided_limit": divided_votes_limit,
                    "recent_limit": recent_scrutins_limit,
                },
            )
            vote_rows = cur.fetchall()

            rate_rows = fetch_mart_rows(cur, SQL_MART_RATES, {"deputy_ids": deputy_ids})

    rates = {r["deputy_id"]: r for r in rate_rows or []}

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
        seat_rank=rank_row["seat_rank"] if rank_row else None,
        members=members,
        avg_presence_rate=avg_presence,
        avg_dissident_rate=avg_dissident,
        most_dissident_members=most_dissident_members,
        divided_votes=divided_votes,
        recent_scrutins=recent_scrutins,
    )
