"""
api/routers/feed.py

The app's Accueil feed (#562, ADR-042).

One read endpoint that returns ready-to-show items for the two Accueil tabs:
`pour_vous` (the followed deputy and themes) and `assemblee` (the week's
headline scrutins). Follows live on the phone and arrive as query parameters;
nothing about them is stored here (ADR-042 §2).

Everything the screen shows is decided in this module so the app never merges,
filters or counts (ADR-041 §4): the noise rule (ADR-042 §3), deduplication
between deputy and theme votes, the closest scrutin, and the roll-up of the
deputy's other votes. The SQL only fetches one week of scrutins and the next
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
from api.schemas import AgendaItem, FeedItem, FeedResponse, FeedRollup, FeedScrutin
from api.themes_data import SLUGS_BY_NAME, THEME_NAMES

router = APIRouter()

PARIS = ZoneInfo("Europe/Paris")

# ADR-042 §3: a non-headline scrutin earns its own card only when it was this
# close. A constant, not a parameter, so the app cannot drift from it.
CLOSE_MARGIN = 20

HEADLINE_KINDS = ("ensemble", "motion")

# Agenda items shown: from today through the next seven days.
AGENDA_DAYS_AHEAD = 7

Tab = Literal["pour_vous", "assemblee"]

# One week of scrutins, with the followed deputy's position when there is one
# (a NULL deputy_id joins nothing, so `position` is NULL throughout).
SQL_WEEK_SCRUTINS = """
    SELECT v.vote_id, v.voted_at, v.vote_title, v.result,
           v.votes_for, v.votes_against, v.abstentions,
           v.summary_plain, v.theme, v.scrutin_kind, v.dossier_id,
           d.has_scrutins, vp.position
    FROM votes v
    LEFT JOIN dossiers d ON d.dossier_uid = v.dossier_id
    LEFT JOIN vote_positions vp
           ON vp.vote_id = v.vote_id AND vp.deputy_id = %(deputy_id)s
    WHERE v.voted_at >= %(start)s AND v.voted_at < %(end)s
    ORDER BY v.voted_at DESC, v.vote_id DESC
"""

# The latest scrutin before the end of the requested week: the fallback week
# when the requested one has no sitting (ADR-042 §5).
SQL_LATEST_BEFORE = "SELECT MAX(voted_at) AS latest FROM votes WHERE voted_at < %(end)s"

SQL_DEPUTY_EXISTS = "SELECT 1 FROM deputies WHERE deputy_id = %s"


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


def to_scrutin(row: dict, *, closest: bool = False) -> FeedScrutin:
    theme = row.get("theme")
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
        deputy_position=row.get("position"),
        an_url=an_scrutin_url(row["vote_id"]),
        dossier_id=row.get("dossier_id"),
        lois_url=lois_url(row["dossier_id"]) if row.get("has_scrutins") else None,
    )


def rollup_of(rows: list[dict]) -> Optional[FeedRollup]:
    """The deputy's positions that earned no card.

    Cast votes are counted by kind; `nonVotant` positions are counted apart,
    since a vote that was not cast is not one of "N autres votes".
    """
    if not rows:
        return None
    counts = {"amendement": 0, "article": 0, "autre": 0}
    non_votant = 0
    for row in rows:
        if row.get("position") == "nonVotant":
            non_votant += 1
            continue
        kind = kind_of(row)
        counts[kind if kind in counts else "autre"] += 1
    return FeedRollup(
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
    has_deputy: bool,
    theme_names: set[str],
) -> list[FeedItem]:
    """The ordered feed: scrutin cards newest first, then the agenda, then the roll-up."""
    closest = closest_scrutin(rows)
    closest_id = closest["vote_id"] if closest else None
    rollup: Optional[FeedRollup] = None

    if tab == "pour_vous":
        picked: dict[str, dict] = {}
        if has_deputy:
            voted = [r for r in rows if r.get("position") is not None]
            for row in voted:
                if earns_card(row):
                    picked[row["vote_id"]] = row
            rollup = rollup_of([r for r in voted if not earns_card(r)])
        for row in rows:
            if row.get("theme") in theme_names and kind_of(row) in HEADLINE_KINDS:
                # A vote in both keeps the deputy's position: it is the same row.
                picked.setdefault(row["vote_id"], row)
        cards = newest_first(list(picked.values()))
        agenda = [a for a in agenda if a.theme in theme_names]
    else:
        cards = [r for r in rows if kind_of(r) in HEADLINE_KINDS]
        if closest and closest_id not in {r["vote_id"] for r in cards}:
            cards.append(closest)
        cards = newest_first(cards)

    items = [
        FeedItem(type="scrutin", scrutin=to_scrutin(r, closest=r["vote_id"] == closest_id))
        for r in cards
    ]
    items += [FeedItem(type="agenda", agenda=a) for a in agenda]
    if rollup:
        items.append(FeedItem(type="rollup", rollup=rollup))
    return items


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


def _week_rows(cur, monday: date, deputy_id: Optional[str]) -> list[dict]:
    cur.execute(
        SQL_WEEK_SCRUTINS,
        {
            "deputy_id": deputy_id,
            "start": paris_midnight(monday),
            "end": paris_midnight(monday + timedelta(days=7)),
        },
    )
    return [dict(r) for r in cur.fetchall()]


@router.get(
    "",
    response_model=FeedResponse,
    summary="The app's Accueil feed for a followed deputy and themes",
)
@limiter.limit(tiered_limit(30))
def get_feed(
    request: Request,
    tab: Tab = Query("pour_vous", description="`pour_vous` or `assemblee`"),
    deputy_id: Optional[str] = Query(None, description="The followed deputy, if any"),
    theme: Optional[list[str]] = Query(
        None, description="Followed theme slugs (repeat the parameter), e.g. `sante-social`"
    ),
    week: Optional[date] = Query(
        None, description="Any date inside the wanted ISO week; defaults to today (Paris)"
    ),
):
    """Ready-to-show cards for the iPhone app's Accueil, one ISO week at a time.

    Follows are not stored anywhere: pass the followed deputy as `deputy_id` and
    each followed theme as a repeated `theme` slug. An unknown deputy is a 404
    and an unknown theme slug a 422, never an empty feed.

    `items` is already in screen order: `scrutin` cards newest first, then the
    next seven days of séance publique `agenda`, then one `rollup`. Each item
    carries exactly one of `scrutin`, `agenda` or `rollup`, named by `type`.

    **Which scrutins get a card** (ADR-042 §3): whole-text votes (`ensemble`)
    and motions always; an amendment, article or other vote only when pour and
    contre were within 20 votes of each other. In `pour_vous` the followed
    deputy's remaining votes of the week are counted in the `rollup` instead, with
    `nonVotant` positions counted apart in `non_votant` and left out of `total`.

    - `pour_vous`: the deputy's carded votes, with `deputy_position`, plus
      whole-text votes and motions in the followed themes, each scrutin once;
      agenda items in the followed themes. Nothing followed means no items.
    - `assemblee`: the week's whole-text votes and motions, plus the closest
      scrutin of the week (`closest: true`), and every agenda item.

    `deputy_position` is `pour`, `contre`, `abstention` or `nonVotant`, null when
    the deputy has no recorded position. `abstention` was cast deliberately and
    `nonVotant` was not cast at all - do not merge them. `result` is the
    scrutin's outcome, not the deputy's choice, and for a `motion` an `adopté`
    result means the motion passed (a motion de rejet adopted rejects the text).

    Weeks run Monday to Sunday, Paris time. When the requested week has no
    scrutin (recess), `no_sitting` is true and the scrutins come from the most
    recent earlier week that had one, whose bounds are in `week_start` and
    `week_end`; `requested_week_start` keeps the week asked for. Production data
    starts on 2025-07-01.
    """
    theme_slugs, theme_names = resolve_themes(theme)
    today = paris_today()
    requested_monday, _ = week_bounds(week or today)

    with get_conn() as conn:
        with conn.cursor() as cur:
            if deputy_id is not None:
                cur.execute(SQL_DEPUTY_EXISTS, (deputy_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Deputy not found")

            monday = requested_monday
            rows = _week_rows(cur, monday, deputy_id)
            no_sitting = not rows
            if no_sitting:
                cur.execute(SQL_LATEST_BEFORE, {"end": paris_midnight(requested_monday)})
                latest = cur.fetchone()["latest"]
                if latest is not None:
                    monday, _ = week_bounds(latest.astimezone(PARIS).date())
                    rows = _week_rows(cur, monday, deputy_id)

            agenda = _agenda_rows(cur, today)

    items = build_items(
        tab, rows, agenda, has_deputy=deputy_id is not None, theme_names=theme_names
    )
    _, sunday = week_bounds(monday)
    return FeedResponse(
        tab=tab,
        deputy_id=deputy_id,
        themes=theme_slugs,
        requested_week_start=requested_monday,
        week_start=monday,
        week_end=sunday,
        no_sitting=no_sitting,
        items=items,
    )
