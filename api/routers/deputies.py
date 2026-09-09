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


@router.get(
    "/",
    response_model=DeputyListResponse,
    summary="List deputies, with name / department / party filters",
)
@limiter.limit(tiered_limit(30))
def list_deputies(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000),
    search: str = Query(None, description="Filter by name (case-insensitive)"),
    department: str = Query(None, description="Exact match on the full department name"),
    party: str = Query(
        None, description="Exact match on party name (e.g. 'Rassemblement National')"
    ),
):
    """The roster of the 17th legislature: 577 seats, past and present holders.

    Use this to resolve a person's name to the `deputy_id` every other deputy
    endpoint takes. `search` matches anywhere in the full name and is
    accent-sensitive, so pass the name as the Assemblée spells it.

    `department` and `party` want the full stored label, not a code or an
    abbreviation: `"Rassemblement National"`, not `"RN"`; `"Nord"`, not `"59"`.
    `party_short` in the response is the abbreviation.

    Includes deputies whose mandate has ended (`mandate_end` is set); there is no
    filter for current holders, so drop them client-side when you want today's
    Assemblée. `offset` is capped at 2000.
    """
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


@router.get(
    "/stats",
    response_model=DeputyStats,
    summary="Chamber-wide (or single-party) averages, for putting one deputy in context",
)
@limiter.limit(tiered_limit(30))
def get_deputy_stats(
    request: Request,
    party: str = Query(
        None,
        description="Scope the averages to one party (for deputy-vs-party comparison, MON-92)",
    ),
):
    """Mean rates across all deputies, or across one group when `party` is set.

    Exists so a single deputy's figures can be reported against a baseline
    instead of in isolation - a presence_rate means little until you know where
    the chamber as a whole sits.

    Every field is a 0-1 float, or null when the scorecard mart is empty. `party`
    takes the full group label, the same spelling `/deputies` filters on. These
    are unweighted means over deputies, not chamber-wide totals: a deputy who sat
    for two months counts as much as one who sat throughout.
    """
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
    """Every deputy's scorecard in one unpaginated response, plus group and department.

    The bulk alternative to calling `/deputies/{deputy_id}/scorecard` 577 times -
    use this for rankings, distributions, or any cross-chamber comparison. Same
    fields and same caveats as the single-deputy scorecard; read that one's notes
    on what `presence_rate` does and does not measure before ranking on it.

    Ordered by surname. Rate-limited harder than the list endpoints (10/min).
    """
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
    """The same rows as `/deputies/scorecards`, as a CSV download.

    For spreadsheets and notebooks. Programmatic callers should prefer the JSON
    endpoint, which carries the field descriptions this format cannot.
    """
    rows = _fetch_scorecard_rows()
    return csv_response(_SCORECARD_CSV_COLUMNS, rows, "monelu_scorecard_deputes.csv")


@router.get(
    "/{deputy_id}",
    response_model=DeputyDetail,
    summary="One deputy's profile",
)
@limiter.limit(tiered_limit(30))
def get_deputy(request: Request, deputy_id: str):
    """Identity and mandate for a single deputy - name, group, constituency, photo.

    `party` is the deputy's **current** group, not the group they held at the
    time of any given vote; deputies do change groups mid-legislature. A non-null
    `mandate_end` means the seat has been vacated, so the profile is historical.

    No voting figures here - see `/deputies/{deputy_id}/scorecard`. 404 when the
    id is unknown.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM deputies WHERE deputy_id = %s", (deputy_id,))
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Deputy not found")
    return DeputyDetail(**row)


@router.get(
    "/{deputy_id}/votes",
    response_model=DeputyVotesResponse,
    summary="How one deputy voted, most recent first",
)
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
    """One deputy's individual positions, newest first, with the vote's outcome.

    `position` is one of `pour`, `contre`, `abstention`, `nonVotant`. The last two
    are different things: an `abstention` was cast deliberately, a `nonVotant` was
    not cast at all. Do not merge them.

    `total` counts every scrutin the deputy has a recorded position on, ignoring
    `since`; `items` is capped by `limit` (max 50) and is the only part `since`
    filters. There is no offset here - narrow with `since` rather than paging, or
    use the CSV export for the whole record.

    `result` is the scrutin's outcome, not the deputy's: a deputy can vote
    `contre` on a text that was adopted.
    """
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
    """One deputy's complete voting record as a CSV download - no limit, no paging.

    The way to get the whole record in one request; the JSON endpoint caps at 50
    items per call. 404 when the id is unknown.
    """
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


@router.get(
    "/{deputy_id}/scorecard",
    response_model=DeputyScorecard,
    summary="One deputy's participation and voting figures",
)
@limiter.limit(tiered_limit(10))
def get_scorecard(request: Request, deputy_id: str):
    """Computed activity figures for a single deputy. All rates are 0-1 floats.

    `presence_rate` is the platform's one canonical presence definition
    (ADR-019): every recorded position counts toward the numerator, `nonVotant`
    included, because a nonVotant deputy was in the chamber. The denominator is
    the number of scrutins held during that deputy's own mandate window, so
    someone elected mid-legislature is not penalised for votes held before they
    took their seat.

    **That denominator is not in this response, so `presence_rate` cannot be
    recomputed from these fields.** `total_votes` is the numerator, and
    `present_votes` deliberately uses the opposite convention - it *excludes*
    `nonVotant`. Do not divide one by the other and call it presence.

    When the mandate window contains no scrutins in the dataset, the rate is `0`
    by convention rather than a measured 0%. That is common for deputies whose
    mandate ended before the 2025-07-01 data horizon, so check `mandate_end` on
    the profile before reporting a zero as absenteeism.

    Even read correctly it is votes cast, not hemicycle attendance: much of the
    Assemblée's work happens in committee, and only a fraction of scrutins are
    politically significant. `solennel_participation_rate` (scrutins solennels
    only) and `voting_days_rate` (distinct sitting days with at least one vote
    cast) are the fairer measures for most questions, and `/deputies/stats` is
    the baseline to read any of them against.

    `votes_for_pct` and `abstention_pct` divide by expressed positions only
    (`pour + contre + abstention`) - nonVotant is presence, not an opinion.

    404 when the id is unknown.
    """
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


@router.get(
    "/{deputy_id}/alignment",
    response_model=DeputyAlignment,
    summary="How often one deputy votes with their own group",
)
@limiter.limit(tiered_limit(10))
def get_alignment(request: Request, deputy_id: str):
    """Party-line alignment for a single deputy, as 0-1 rates.

    A vote counts as dissident when the deputy's expressed position differs from
    the majority position of their group on that same scrutin. Only expressed
    positions are counted on both sides - `nonVotant` never makes someone a
    dissident, and never dilutes the rate either.

    The group majority is a plurality with ties broken alphabetically
    (abstention < contre < pour), so a genuinely three-way-split group still has
    a defined majority. Alignment is computed against the deputy's *current*
    group for every vote in the window, which distorts the figure for anyone who
    changed groups mid-legislature.

    404 when the id is unknown.
    """
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


@router.get(
    "/{deputy_id}/dissident-votes",
    response_model=DeputyDissidentVotesResponse,
    summary="The specific votes where one deputy broke with their group",
)
@limiter.limit(tiered_limit(10))
def get_dissident_votes(
    request: Request,
    deputy_id: str,
    limit: int = Query(10, ge=1, le=50),
):
    """The scrutins behind `/alignment`'s dissident_rate, most recent first.

    Each item carries both `position` (the deputy's) and `majority_position`
    (their group's), so the divergence is citable rather than asserted. `total`
    is the full count of dissident votes; `items` is capped by `limit`.

    Same definition as `/alignment`: expressed positions only, group majority
    tie-broken alphabetically, current group applied across the whole window.
    """
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
    summary="Head-to-head: the votes where two deputies disagreed",
)
@limiter.limit(tiered_limit(10))
def get_diverging_votes(
    request: Request,
    deputy_id: str,
    other_deputy_id: str = Query(..., description="The other deputy to compare against (MON-92)"),
    limit: int = Query(10, ge=1, le=50),
):
    """Scrutins where two named deputies cast different expressed positions.

    `position_a` belongs to the path deputy, `position_b` to `other_deputy_id`.
    Both sides must have expressed a position, so a scrutin where either was
    `nonVotant` is not a disagreement and is excluded - `total` is therefore a
    floor on how differently the two voted, not a complete difference count.

    Restricted to scrutins both were eligible for, so comparing deputies whose
    mandates barely overlap yields little. Most recent first.
    """
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
