"""
api/routers/feed.py

The app's Accueil feed (#562, ADR-042).

One read endpoint that returns ready-to-show items for the two Accueil tabs:
`pour_vous` (the followed deputies and themes) and `assemblee` (the week's
headline scrutins). Follows live on the phone and arrive as query parameters;
nothing about them is stored here (ADR-042 §2). Several deputies can be
followed (ADR-042 amendment, #582): they arrive as a repeated `deputies`
parameter, merged after the older single `deputy_id`.

Everything the screen shows is decided in this module so the app never merges,
filters or counts (ADR-041 §4): the noise rule (ADR-042 §3), deduplication
between deputy and theme votes, the closest scrutin, and the roll-up of the
deputies' other votes. The SQL only fetches one week of scrutins and the next
seven days of agenda; the rest is pure functions, tested without a database.
"""

from datetime import date, datetime, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.limiter import limiter, tiered_limit
from api.routers.agenda import _AGENDA_QUERY, _CANCELLED_STATES, _dossier_url
from api.routers.lois import lois_url
from api.schemas import (
    AgendaItem,
    FeedItem,
    FeedPosition,
    FeedResponse,
    FeedRollup,
    FeedScrutin,
    FeedThemeLatest,
    FeedWeekDeputy,
    FeedWeekDeputyEntry,
    FeedWeekResponse,
)
from api.themes_data import SLUGS_BY_NAME, THEME_NAMES

router = APIRouter()

PARIS = ZoneInfo("Europe/Paris")

# ADR-042 §3: a non-headline scrutin earns its own card only when it was this
# close. A constant, not a parameter, so the app cannot drift from it.
CLOSE_MARGIN = 20

HEADLINE_KINDS = ("ensemble", "motion")

# ADR-042 amendment §2: the most deputies one request may follow. The app
# enforces the same cap before it sends anything.
MAX_FOLLOWED_DEPUTIES = 10

# Agenda items shown: from today through the next seven days.
AGENDA_DAYS_AHEAD = 7

Tab = Literal["pour_vous", "assemblee"]

# One week of scrutins, each with the followed deputies' positions as a
# {deputy_id: position} object (empty when nothing is followed or recorded).
SQL_WEEK_SCRUTINS = """
    SELECT v.vote_id, v.voted_at, v.vote_title, v.result,
           v.votes_for, v.votes_against, v.abstentions,
           v.summary_plain, v.theme, v.scrutin_kind, v.dossier_id,
           d.has_scrutins,
           COALESCE(
               (SELECT jsonb_object_agg(vp.deputy_id, vp.position)
                FROM vote_positions vp
                WHERE vp.vote_id = v.vote_id
                  AND vp.deputy_id = ANY(%(deputy_ids)s::text[])),
               '{}'::jsonb
           ) AS positions
    FROM votes v
    LEFT JOIN dossiers d ON d.dossier_uid = v.dossier_id
    WHERE v.voted_at >= %(start)s AND v.voted_at < %(end)s
    ORDER BY v.voted_at DESC, v.vote_id DESC
"""

# The latest scrutin before the end of the requested week: the fallback week
# when the requested one has no sitting (ADR-042 §5).
SQL_LATEST_BEFORE = "SELECT MAX(voted_at) AS latest FROM votes WHERE voted_at < %(end)s"

# Each followed theme's most recent card-worthy scrutin, in any week: what the
# app's theme circle compares with the last one the user saw (#573). Only the
# kinds a theme brings into « Pour vous », so the ring never announces a vote
# the theme's own feed would not show.
SQL_LATEST_BY_THEME = """
    SELECT theme, MAX(voted_at) AS latest
    FROM votes
    WHERE theme = ANY(%(themes)s::text[])
      AND scrutin_kind = ANY(%(kinds)s::text[])
    GROUP BY theme
"""

SQL_DEPUTIES_EXIST = "SELECT deputy_id FROM deputies WHERE deputy_id = ANY(%s::text[])"


# ---------------------------------------------------------------------------
# Week arithmetic (ADR-042 §5): ISO week, Monday to Sunday, Europe/Paris
# ---------------------------------------------------------------------------


def paris_today() -> date:
    return datetime.now(PARIS).date()


def week_bounds(day: date) -> tuple[date, date]:
    """Monday and Sunday of the ISO week containing `day`."""
    monday = day - timedelta(days=day.weekday())
    return monday, monday + timedelta(days=6)


def paris_midnight(day: date) -> datetime:
    """Start of `day` in Paris, as an aware datetime for a timestamptz comparison."""
    return datetime(day.year, day.month, day.day, tzinfo=PARIS)


def an_scrutin_url(vote_id: str) -> str:
    """Official AN page of one scrutin - the link the website and the app already use."""
    return f"https://www.assemblee-nationale.fr/dyn/scrutins/{vote_id}"


# ---------------------------------------------------------------------------
# The noise rule and the feed itself (ADR-042 §3-4) - pure functions
# ---------------------------------------------------------------------------


def kind_of(row: dict) -> str:
    """`scrutin_kind`, with an unclassified scrutin treated as `autre`."""
    return row.get("scrutin_kind") or "autre"


def margin_of(row: dict) -> Optional[int]:
    if row.get("votes_for") is None or row.get("votes_against") is None:
        return None
    return abs(row["votes_for"] - row["votes_against"])


def is_close(row: dict) -> bool:
    margin = margin_of(row)
    return row.get("result") is not None and margin is not None and margin <= CLOSE_MARGIN


def earns_card(row: dict) -> bool:
    """A full card for a headline scrutin, or for any other kind that was close."""
    return kind_of(row) in HEADLINE_KINDS or is_close(row)


def closest_scrutin(rows: list[dict]) -> Optional[dict]:
    """The week's scrutin with the smallest pour/contre margin and a known result.

    Ties go to the most recent, then to the higher vote_id, so the pick is stable.
    """
    candidates = [r for r in rows if r.get("result") is not None and margin_of(r) is not None]
    if not candidates:
        return None
    # min() keeps the first of equal keys, and newest_first() set that order.
    return min(newest_first(candidates), key=margin_of)


def _sort_ts(row: dict) -> float:
    voted_at = row.get("voted_at")
    return voted_at.timestamp() if voted_at else float("-inf")


def newest_first(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (_sort_ts(r), r["vote_id"]), reverse=True)


def position_of(row: dict, deputy_id: str) -> Optional[str]:
    """One followed deputy's recorded position on this scrutin, if any."""
    return (row.get("positions") or {}).get(deputy_id)


def to_scrutin(row: dict, deputy_ids: list[str], *, closest: bool = False) -> FeedScrutin:
    theme = row.get("theme")
    positions = [
        FeedPosition(deputy_id=d, position=position_of(row, d))
        for d in deputy_ids
        if position_of(row, d) is not None
    ]
    return FeedScrutin(
        vote_id=row["vote_id"],
        voted_at=row.get("voted_at"),
        scrutin_kind=kind_of(row),
        title=row["vote_title"],
        summary_plain=row.get("summary_plain"),
        theme=theme,
        theme_slug=SLUGS_BY_NAME.get(theme) if theme else None,
        result=row.get("result"),
        votes_for=row.get("votes_for"),
        votes_against=row.get("votes_against"),
        abstentions=row.get("abstentions"),
        margin=margin_of(row),
        closest=closest,
        deputy_position=position_of(row, deputy_ids[0]) if deputy_ids else None,
        positions=positions,
        an_url=an_scrutin_url(row["vote_id"]),
        dossier_id=row.get("dossier_id"),
        lois_url=lois_url(row["dossier_id"]) if row.get("has_scrutins") else None,
    )


def rollup_of(rows: list[dict], deputy_id: str) -> Optional[FeedRollup]:
    """One deputy's positions that earned no card (one roll-up per deputy).

    Cast votes are counted by kind; `nonVotant` positions are counted apart,
    since a vote that was not cast is not one of "N autres votes".
    """
    if not rows:
        return None
    counts = {"amendement": 0, "article": 0, "autre": 0}
    non_votant = 0
    for row in rows:
        if position_of(row, deputy_id) == "nonVotant":
            non_votant += 1
            continue
        kind = kind_of(row)
        counts[kind if kind in counts else "autre"] += 1
    return FeedRollup(
        deputy_id=deputy_id,
        total=sum(counts.values()),
        amendement=counts["amendement"],
        article=counts["article"],
        autre=counts["autre"],
        non_votant=non_votant,
    )


def build_items(
    tab: str,
    rows: list[dict],
    agenda: list[AgendaItem],
    *,
    deputy_ids: list[str],
    theme_names: set[str],
) -> list[FeedItem]:
    """The ordered feed: scrutin cards newest first, then the agenda, then the roll-ups.

    A scrutin is a candidate for « Pour vous » when any followed deputy has a
    position on it; whether it earns a card is a property of the scrutin alone
    (ADR-042 §3), and it appears once whoever voted on it.
    """
    closest = closest_scrutin(rows)
    closest_id = closest["vote_id"] if closest else None
    rollups: list[FeedRollup] = []

    if tab == "pour_vous":
        picked: dict[str, dict] = {}
        for row in rows:
            if any(position_of(row, d) is not None for d in deputy_ids) and earns_card(row):
                picked[row["vote_id"]] = row
        for deputy_id in deputy_ids:
            rollup = rollup_of(
                [r for r in rows if position_of(r, deputy_id) is not None and not earns_card(r)],
                deputy_id,
            )
            if rollup:
                rollups.append(rollup)
        for row in rows:
            if row.get("theme") in theme_names and kind_of(row) in HEADLINE_KINDS:
                # A vote in both keeps the deputies' positions: it is the same row.
                picked.setdefault(row["vote_id"], row)
        cards = newest_first(list(picked.values()))
        agenda = [a for a in agenda if a.theme in theme_names]
    else:
        cards = [r for r in rows if kind_of(r) in HEADLINE_KINDS]
        if closest and closest_id not in {r["vote_id"] for r in cards}:
            cards.append(closest)
        cards = newest_first(cards)

    items = [
        FeedItem(
            type="scrutin", scrutin=to_scrutin(r, deputy_ids, closest=r["vote_id"] == closest_id)
        )
        for r in cards
    ]
    items += [FeedItem(type="agenda", agenda=a) for a in agenda]
    items += [FeedItem(type="rollup", rollup=r) for r in rollups]
    return items


def deputy_week(rows: list[dict], deputy_id: str) -> FeedWeekDeputyEntry:
    """One deputy's positions over the week's scrutins.

    `nonVotant` stays separate from `abstention`: one was not cast, the other
    was cast deliberately.
    """
    positions = {"pour": 0, "contre": 0, "abstention": 0, "nonVotant": 0}
    for row in rows:
        position = position_of(row, deputy_id)
        if position in positions:
            positions[position] += 1
    return FeedWeekDeputyEntry(
        deputy_id=deputy_id,
        cast=positions["pour"] + positions["contre"] + positions["abstention"],
        pour=positions["pour"],
        contre=positions["contre"],
        abstention=positions["abstention"],
        non_votant=positions["nonVotant"],
    )


def week_recap_counts(rows: list[dict], *, deputy_ids: list[str]) -> dict:
    """The recap's counts over one week of scrutins (#563) - counted, no LLM.

    One entry per followed deputy, never summed across them (ADR-042
    amendment §5); `deputy` keeps the first one for builds that read it.
    """
    deputies = [deputy_week(rows, d) for d in deputy_ids]
    deputy = FeedWeekDeputy(**deputies[0].model_dump(exclude={"deputy_id"})) if deputies else None

    def count(kind: str, result: str) -> int:
        return sum(1 for r in rows if kind_of(r) == kind and r.get("result") == result)

    return {
        "scrutins": len(rows),
        "laws_adopted": count("ensemble", "adopté"),
        "laws_rejected": count("ensemble", "rejeté"),
        "motions_adopted": count("motion", "adopté"),
        "motions_rejected": count("motion", "rejeté"),
        "deputy": deputy,
        "deputies": deputies,
    }


# ---------------------------------------------------------------------------
# Validation and database reads
# ---------------------------------------------------------------------------


def resolve_themes(slugs: Optional[list[str]]) -> tuple[list[str], set[str]]:
    """Validated slugs (deduplicated, request order kept) and their theme names."""
    if not slugs:
        return [], set()
    clean: list[str] = []
    for raw in slugs:
        slug = raw.strip().lower()
        if slug not in THEME_NAMES:
            raise HTTPException(status_code=422, detail=f"Unknown theme: {raw}")
        if slug not in clean:
            clean.append(slug)
    return clean, {THEME_NAMES[s] for s in clean}


def _agenda_rows(cur, today: date) -> list[AgendaItem]:
    cur.execute(
        _AGENDA_QUERY,
        (
            _CANCELLED_STATES,
            _CANCELLED_STATES,
            today,
            today + timedelta(days=AGENDA_DAYS_AHEAD + 1),
        ),
    )
    return [
        AgendaItem(
            point_uid=row["point_uid"],
            sitting_start=row["sitting_start"],
            sitting_end=row["sitting_end"],
            objet=row["objet"],
            point_type=row["point_type"],
            summary_plain=row["summary_plain"],
            theme=row["theme"],
            dossier_id=row["dossier_id"],
            dossier_title=row["dossier_title"],
            dossier_url=_dossier_url(row["dossier_id"]) if row["dossier_id"] else None,
            lois_url=lois_url(row["dossier_id"]) if row["has_scrutins"] else None,
            vote_id=row["vote_id"],
            result=row["result"],
        )
        for row in cur.fetchall()
    ]


def _latest_by_theme(cur, theme_slugs: list[str]) -> list[FeedThemeLatest]:
    """Each followed theme's newest headline scrutin, in the order the themes were sent.

    A theme with no such scrutin yet is left out rather than sent with a null date.
    """
    if not theme_slugs:
        return []
    cur.execute(
        SQL_LATEST_BY_THEME,
        {"themes": [THEME_NAMES[s] for s in theme_slugs], "kinds": list(HEADLINE_KINDS)},
    )
    latest = {row["theme"]: row["latest"] for row in cur.fetchall()}
    return [
        FeedThemeLatest(theme_slug=slug, voted_at=latest[THEME_NAMES[slug]])
        for slug in theme_slugs
        if latest.get(THEME_NAMES[slug]) is not None
    ]


def resolve_deputies(deputy_id: Optional[str], deputies: Optional[list[str]]) -> list[str]:
    """The followed set: `deputy_id` first, then `deputies` in request order, deduplicated.

    More than MAX_FOLLOWED_DEPUTIES distinct deputies is a 422, before any query.
    """
    merged: list[str] = []
    for raw in [deputy_id, *(deputies or [])]:
        if raw is None:
            continue
        clean = raw.strip()
        if clean and clean not in merged:
            merged.append(clean)
    if len(merged) > MAX_FOLLOWED_DEPUTIES:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_FOLLOWED_DEPUTIES} deputies can be followed at once",
        )
    return merged


def _week_rows(cur, monday: date, deputy_ids: list[str]) -> list[dict]:
    cur.execute(
        SQL_WEEK_SCRUTINS,
        {
            "deputy_ids": deputy_ids,
            "start": paris_midnight(monday),
            "end": paris_midnight(monday + timedelta(days=7)),
        },
    )
    return [dict(r) for r in cur.fetchall()]


def _require_deputies(cur, deputy_ids: list[str]) -> None:
    """404 when any followed deputy is unknown - never a silently shorter feed."""
    if not deputy_ids:
        return
    cur.execute(SQL_DEPUTIES_EXIST, (deputy_ids,))
    known = {row["deputy_id"] for row in cur.fetchall()}
    missing = [d for d in deputy_ids if d not in known]
    if missing:
        raise HTTPException(status_code=404, detail=f"Deputy not found: {missing[0]}")


def _sitting_week(
    cur, requested_monday: date, deputy_ids: list[str]
) -> tuple[date, list[dict], bool]:
    """The week to show: the requested one, or the last that sat (ADR-042 §5).

    Returns that week's Monday, its scrutins, and whether the requested week
    had none (`no_sitting`).
    """
    rows = _week_rows(cur, requested_monday, deputy_ids)
    if rows:
        return requested_monday, rows, False
    cur.execute(SQL_LATEST_BEFORE, {"end": paris_midnight(requested_monday)})
    latest = cur.fetchone()["latest"]
    if latest is None:
        return requested_monday, [], True
    monday, _ = week_bounds(latest.astimezone(PARIS).date())
    return monday, _week_rows(cur, monday, deputy_ids), True


@router.get(
    "",
    response_model=FeedResponse,
    summary="The app's Accueil feed for followed deputies and themes",
)
@limiter.limit(tiered_limit(30))
def get_feed(
    request: Request,
    tab: Tab = Query("pour_vous", description="`pour_vous` or `assemblee`"),
    deputy_id: Optional[str] = Query(
        None, description="A followed deputy; older builds send their one deputy here"
    ),
    deputies: Optional[list[str]] = Query(
        None,
        description="Followed deputy ids (repeat the parameter), merged after `deputy_id`; "
        "at most 10",
    ),
    theme: Optional[list[str]] = Query(
        None, description="Followed theme slugs (repeat the parameter), e.g. `sante-social`"
    ),
    week: Optional[date] = Query(
        None, description="Any date inside the wanted ISO week; defaults to today (Paris)"
    ),
):
    """Ready-to-show cards for the iPhone app's Accueil, one ISO week at a time.

    Follows are not stored anywhere: pass each followed deputy as a repeated
    `deputies` id and each followed theme as a repeated `theme` slug. The older
    single `deputy_id` is still accepted and merged first; `deputy_ids` echoes
    the merged set, deduplicated, in that order. More than 10 deputies is a 422.
    An unknown deputy anywhere in the set is a 404 and an unknown theme slug a
    422, never a shorter or empty feed.

    `items` is already in screen order: `scrutin` cards newest first, then the
    next seven days of séance publique `agenda`, then one `rollup` per followed
    deputy who has one, in the followed order. Each item
    carries exactly one of `scrutin`, `agenda` or `rollup`, named by `type`.

    **Which scrutins get a card** (ADR-042 §3): whole-text votes (`ensemble`)
    and motions always; an amendment, article or other vote only when pour and
    contre were within 20 votes of each other. In `pour_vous` each followed
    deputy's remaining votes of the week are counted in that deputy's `rollup`
    instead, with `nonVotant` positions counted apart in `non_votant` and left
    out of `total`.

    - `pour_vous`: every carded scrutin at least one followed deputy voted on,
      plus whole-text votes and motions in the followed themes, each scrutin
      once; agenda items in the followed themes. Nothing followed means no items.
    - `assemblee`: the week's whole-text votes and motions, plus the closest
      scrutin of the week (`closest: true`), and every agenda item.

    `positions` lists `{deputy_id, position}` for each followed deputy with a
    recorded position on the scrutin, in the followed order; `deputy_position`
    is the first followed deputy's, null when that deputy has none. A position
    is `pour`, `contre`, `abstention` or `nonVotant`. `abstention` was cast deliberately and
    `nonVotant` was not cast at all - do not merge them. `result` is the
    scrutin's outcome, not the deputy's choice, and for a `motion` an `adopté`
    result means the motion passed (a motion de rejet adopted rejects the text).

    Weeks run Monday to Sunday, Paris time. When the requested week has no
    scrutin (recess), `no_sitting` is true and the scrutins come from the most
    recent earlier week that had one, whose bounds are in `week_start` and
    `week_end`; `requested_week_start` keeps the week asked for. Production data
    starts on 2025-07-01.

    `latest_by_theme` gives, for each requested theme, the date of its most
    recent whole-text vote or motion in any week - the kinds a theme brings
    into `pour_vous`. The app lights a theme's "something new" ring when that
    date is after the last one the user saw; a theme with no such scrutin is
    left out.
    """
    theme_slugs, theme_names = resolve_themes(theme)
    deputy_ids = resolve_deputies(deputy_id, deputies)
    today = paris_today()
    requested_monday, _ = week_bounds(week or today)

    with get_conn() as conn:
        with conn.cursor() as cur:
            _require_deputies(cur, deputy_ids)
            monday, rows, no_sitting = _sitting_week(cur, requested_monday, deputy_ids)
            agenda = _agenda_rows(cur, today)
            latest_by_theme = _latest_by_theme(cur, theme_slugs)

    items = build_items(tab, rows, agenda, deputy_ids=deputy_ids, theme_names=theme_names)
    _, sunday = week_bounds(monday)
    return FeedResponse(
        tab=tab,
        deputy_id=deputy_ids[0] if deputy_ids else None,
        deputy_ids=deputy_ids,
        themes=theme_slugs,
        requested_week_start=requested_monday,
        week_start=monday,
        week_end=sunday,
        no_sitting=no_sitting,
        items=items,
        latest_by_theme=latest_by_theme,
    )


@router.get(
    "/week",
    response_model=FeedWeekResponse,
    summary="The weekly recap behind the app's « Votre semaine à l'Assemblée » card",
)
@limiter.limit(tiered_limit(30))
def get_feed_week(
    request: Request,
    deputy_id: Optional[str] = Query(
        None, description="A followed deputy; older builds send their one deputy here"
    ),
    deputies: Optional[list[str]] = Query(
        None,
        description="Followed deputy ids (repeat the parameter), merged after `deputy_id`; "
        "at most 10",
    ),
    week: Optional[date] = Query(
        None, description="Any date inside the wanted ISO week; defaults to today (Paris)"
    ),
):
    """One ISO week at the Assemblée in counts, for the Accueil recap card.

    Counted from the week's scrutins, with no language model involved:
    `scrutins` is every scrutin of the week, `laws_adopted`/`laws_rejected` count
    whole-text votes (`ensemble`) by result, and `motions_adopted`/
    `motions_rejected` count motions by result (a motion de rejet *rejected*
    means the text goes on to debate).

    Followed deputies arrive as a repeated `deputies` id, with the older single
    `deputy_id` merged first, exactly as on `GET /feed` (at most 10; an unknown
    one is a 404). `deputies` gives one entry per followed deputy, in that order,
    with their positions on the week's scrutins; positions are never summed
    across deputies. `deputy` repeats the first entry without its id, null when
    nothing is followed. `cast` is `pour` + `contre` + `abstention`, the votes
    actually cast. `non_votant` counts scrutins where the deputy is recorded
    present but not voting and is never part of `cast` or `abstention` - the two
    are different things. Scrutins with no recorded position (absent) are in
    neither.

    `next_agenda` is the next séance publique item within seven days, null when
    none is scheduled. Weeks run Monday to Sunday, Paris time; a week with no
    scrutin sets `no_sitting` and reports the last week that sat, exactly as
    `GET /feed` does, so the card and the feed always describe the same week.
    """
    deputy_ids = resolve_deputies(deputy_id, deputies)
    today = paris_today()
    requested_monday, _ = week_bounds(week or today)

    with get_conn() as conn:
        with conn.cursor() as cur:
            _require_deputies(cur, deputy_ids)
            monday, rows, no_sitting = _sitting_week(cur, requested_monday, deputy_ids)
            agenda = _agenda_rows(cur, today)

    _, sunday = week_bounds(monday)
    return FeedWeekResponse(
        deputy_id=deputy_ids[0] if deputy_ids else None,
        deputy_ids=deputy_ids,
        requested_week_start=requested_monday,
        week_start=monday,
        week_end=sunday,
        no_sitting=no_sitting,
        next_agenda=agenda[0] if agenda else None,
        **week_recap_counts(rows, deputy_ids=deputy_ids),
    )
