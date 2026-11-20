"""
api/routers/election.py

The record before the 2027 presidential election (#718, ADR-049).

One read endpoint behind the iPhone app's "2027" tab: the legislature in
figures, the scrutins that were closest, and how each parliamentary group's
majority voted on them. It says what the Assemblée voted and nothing about
any candidate or programme (VISION.md).

The app computes nothing (ADR-041 §4), so the figures, the closeness ranking
and every grid cell's majority position are decided here. The SQL fetches
counts; the ranking and the majority rule are pure functions, tested without
a database.
"""

from typing import Optional

import psycopg2.errors
from fastapi import APIRouter
from starlette.requests import Request

from api.an_links import an_scrutin_url
from api.app_config_data import DATA_HORIZON
from api.db import get_conn
from api.groups_data import CANONICAL_SHORT_LABELS, GROUP_SLUGS
from api.limiter import limiter, tiered_limit
from api.routers.groups import _majority_position
from api.schemas import (
    Election2027Response,
    ElectionGridCell,
    ElectionGridRow,
    ElectionKeyVote,
    ElectionLegislatureFigures,
)

router = APIRouter()

# How many scrutins the carousel and the grid's columns show.
KEY_VOTE_COUNT = 5

# Not a group in any political sense, never a grid row (same rule as /groups, #526).
NON_INSCRITS = "Non inscrit"

# Positions that count towards a group's majority. `nonVotant` is not a position
# taken (CLAUDE.md data quirks), so it never decides one.
EXPRESSED = ("pour", "contre", "abstention")

KIND_LABELS = {"ensemble": "Texte entier", "motion": "Motion"}
CENSURE_KIND_LABEL = "Motion de censure"

_SLUG_BY_LABEL = {label: slug for slug, label in GROUP_SLUGS.items()}

SQL_FIGURES = """
    SELECT COUNT(*)                                                       AS scrutins,
           COUNT(*) FILTER (WHERE scrutin_kind = 'ensemble'
                              AND result = 'adopté')                      AS adopted_texts,
           COUNT(*) FILTER (WHERE scrutin_kind = 'motion'
                              AND vote_title ILIKE '%motion de censure%') AS censure_motions
    FROM votes
"""

# Closest first: the margin is |pour - contre|, ties broken by the newest scrutin.
SQL_KEY_VOTES = """
    SELECT vote_id, voted_at, vote_title, result, scrutin_kind,
           votes_for, votes_against, abstentions
    FROM votes
    WHERE scrutin_kind IN ('ensemble', 'motion')
      AND voted_at IS NOT NULL
      AND votes_for IS NOT NULL AND votes_against IS NOT NULL
    ORDER BY ABS(votes_for - votes_against) ASC, voted_at DESC, vote_id
    LIMIT %(limit)s
"""

SQL_GROUP_SEATS = """
    SELECT party, COUNT(*) AS seats
    FROM deputies
    WHERE deputy_id IN (SELECT deputy_id FROM sitting_deputies)
      AND party IS NOT NULL AND party <> %(non_inscrit)s
    GROUP BY party
    ORDER BY seats DESC, party
"""

SQL_GROUP_POSITIONS = """
    SELECT vp.vote_id, d.party, vp.position, COUNT(*) AS n
    FROM vote_positions vp
    JOIN deputies d ON d.deputy_id = vp.deputy_id
    WHERE vp.vote_id = ANY(%(vote_ids)s)
      AND vp.position IN ('pour', 'contre', 'abstention')
      AND d.party IS NOT NULL
    GROUP BY vp.vote_id, d.party, vp.position
"""

SQL_MEDIAN_PRESENCE = """
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY presence_rate) AS median
    FROM analytics_marts.mart_deputy_scorecard
    WHERE deputy_id IN (SELECT deputy_id FROM sitting_deputies)
      AND presence_rate IS NOT NULL
"""


def margin_of(row: dict) -> int:
    """Votes between pour and contre, always non-negative."""
    return abs(row["votes_for"] - row["votes_against"])


def kind_label(row: dict) -> str:
    """The reader's name for a scrutin kind; a censure motion is named as such."""
    if row["scrutin_kind"] == "motion" and "motion de censure" in row["vote_title"].lower():
        return CENSURE_KIND_LABEL
    return KIND_LABELS[row["scrutin_kind"]]


def majority_position(counts: dict[str, int]) -> Optional[str]:
    """A group's majority position on one scrutin, or None when nobody expressed one.

    The formula is the one every group surface uses (ADR-034): plurality, a tie
    broken alphabetically, defined once in `groups._majority_position` and
    mirrored by `int_party_vote_majority`. Only the empty case is added here,
    where that function would answer "abstention" for a group with no vote.
    """
    if not any(counts.get(p, 0) for p in EXPRESSED):
        return None
    return _majority_position(
        counts.get("pour", 0), counts.get("contre", 0), counts.get("abstention", 0)
    )


def to_key_vote(row: dict) -> ElectionKeyVote:
    return ElectionKeyVote(
        vote_id=row["vote_id"],
        kind=kind_label(row),
        result=row["result"],
        voted_at=row["voted_at"],
        title=row["vote_title"],
        votes_for=row["votes_for"],
        abstentions=row["abstentions"] or 0,
        votes_against=row["votes_against"],
        margin=margin_of(row),
        official_url=an_scrutin_url(row["vote_id"]),
    )


def build_grid(
    seats: list[dict], key_votes: list[dict], position_rows: list[dict]
) -> list[ElectionGridRow]:
    """One row per group (largest first), one cell per key vote, in the carousel's order."""
    counts: dict[tuple[str, str], dict[str, int]] = {}
    for row in position_rows:
        counts.setdefault((row["party"], row["vote_id"]), {})[row["position"]] = row["n"]

    rows = []
    for seat in seats:
        label = seat["party"]
        cells = []
        for vote in key_votes:
            by_position = counts.get((label, vote["vote_id"]), {})
            cells.append(
                ElectionGridCell(
                    vote_id=vote["vote_id"],
                    position=majority_position(by_position),
                    pour=by_position.get("pour", 0),
                    contre=by_position.get("contre", 0),
                    abstention=by_position.get("abstention", 0),
                )
            )
        rows.append(
            ElectionGridRow(
                slug=_SLUG_BY_LABEL.get(label),
                label=label,
                party_short=CANONICAL_SHORT_LABELS.get(label),
                seats=seat["seats"],
                cells=cells,
            )
        )
    return rows


def _median_presence() -> Optional[float]:
    """Median presence rate of the sitting deputies; None while the marts are absent.

    Runs on a connection of its own, and catches the error outside `get_conn()`:
    an UndefinedTable aborts the transaction, and only an exception leaving the
    context manager makes it roll back before the connection returns to the pool
    (the same arrangement `groups.py` uses).
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(SQL_MEDIAN_PRESENCE)
                row = cur.fetchone()
    except psycopg2.errors.UndefinedTable:
        return None
    value = row["median"] if row else None
    return round(float(value), 4) if value is not None else None


@router.get(
    "/2027",
    response_model=Election2027Response,
    summary="The legislature's record ahead of the 2027 presidential election",
)
@limiter.limit(tiered_limit(30))
def get_election_2027(request: Request):
    """What the Assemblée nationale voted, set out for the iPhone app's "2027" tab.

    It reports the record and nothing about any candidate, programme or party's
    platform. `legislature` holds four figures counted over the scrutins this
    database holds, from `legislature.coverage_start`: `scrutins` (every public
    scrutin), `adopted_texts` (scrutins on a whole text, `ensemble`, whose result
    is `adopté`; one reading of a text is one scrutin, so this is not a count of
    promulgated laws), `censure_motions` and `median_presence_rate` (the median of
    the sitting deputies' `presence_rate`, 0 to 1, null while the dbt marts are
    absent; `nonVotant` counts as present, see the `presence_rate` caveat).

    `key_votes` are the `ensemble` and `motion` scrutins whose margin, the number
    of votes between `pour` and `contre`, was smallest, closest first. Results
    are the Assemblée's own, never recomputed.

    `grid` has one row per parliamentary group, largest first, `Non inscrit`
    excluded, and one cell per key vote in the same order. A cell's `position` is
    the position most of the group's members took (`pour`, `contre` or
    `abstention`), counting only expressed positions, so `nonVotant` never decides
    one, with the same plurality and alphabetical tiebreak as `GET /groups/{slug}`;
    it is null only when no member of the group expressed a position.
    Members are grouped by the group they sit in today, as everywhere else in
    this API (see the `group_alignment` caveat).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SQL_FIGURES)
            figures = cur.fetchone() or {}
            cur.execute(SQL_KEY_VOTES, {"limit": KEY_VOTE_COUNT})
            key_rows = cur.fetchall()
            cur.execute(SQL_GROUP_SEATS, {"non_inscrit": NON_INSCRITS})
            seats = cur.fetchall()
            vote_ids = [r["vote_id"] for r in key_rows]
            position_rows = []
            if vote_ids:
                cur.execute(SQL_GROUP_POSITIONS, {"vote_ids": vote_ids})
                position_rows = cur.fetchall()
    median = _median_presence()

    return Election2027Response(
        legislature=ElectionLegislatureFigures(
            coverage_start=DATA_HORIZON,
            scrutins=figures.get("scrutins", 0),
            adopted_texts=figures.get("adopted_texts", 0),
            censure_motions=figures.get("censure_motions", 0),
            median_presence_rate=median,
        ),
        key_votes=[to_key_vote(r) for r in key_rows],
        grid=build_grid(seats, key_rows, position_rows),
    )
