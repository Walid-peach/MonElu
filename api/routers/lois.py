"""
api/routers/lois.py

Bill pages (MON-244 / GH #369, ADR-035) - "où en est cette loi ?".

The spine of a bill page is its acte parcours (`dossier_actes`), which is
complete from the start of the legislature. Scrutins hang off it where the
Assemblée tagged them, which it only began doing in March 2026 (ADR-035 §1).
No dbt mart - the read is page-shaped, like api/routers/groups.py and
api/routers/agenda.py (ADR-026, ADR-030 §1, ADR-035 §3).

Three rules this router exists to enforce:

- Only dossiers with `has_scrutins` get a page; every other uid is a 404,
  including the four legislature-16 refs scrutins carry (ADR-035 §6).
- Amendment and article scrutins are never inlined. The detail response
  carries a count per acte; `/lois/{uid}/amendements` lists them on demand
  (ADR-035 §4 - one dossier has 395 of them).
- The derived `status` always travels with the raw AN `status_label`
  (ADR-035 §5).
"""

from datetime import date, datetime
from typing import Optional

import psycopg2.errors
from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.config import frontend_base_url
from api.db import MART_UNAVAILABLE, get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import (
    LoiActe,
    LoiAmendementScrutin,
    LoiAmendementsResponse,
    LoiDetail,
    LoiListItem,
    LoiListResponse,
    LoiScrutin,
)

router = APIRouter()

# The seven values ADR-035 §5 derives, in rule order. Mirrors
# scripts/ingest_dossiers.STATUS_VALUES; tests/unit/test_lois_router.py fails
# if the two drift, so the API cannot filter on a value ingestion never writes.
DOSSIER_STATUSES = (
    "promulguee",
    "conseil_constitutionnel",
    "rejetee",
    "adoptee_definitivement",
    "deposee",
    "en_commission",
    "en_navette",
)

# Scrutin kinds that are collapsed into counts rather than listed (ADR-035 §4).
# Everything else - `ensemble`, `motion`, `autre`, and a NULL kind that the
# classifier never reached - is a headline scrutin.
COLLAPSED_KINDS = ("amendement", "article")

# First scrutin the Assemblée systematically tagged with its dossier. Measured
# over the full legislature-17 export: one stray tagged scrutin on 2026-01-29,
# then every scrutin from 2026-03-26 onward (ADR-035 §1 calls it "March
# 2026"). Before this date a bill's parcours has dated actes but no scrutin can
# be attached to them - that is an upstream gap, not missing data here.
SCRUTIN_COVERAGE_START = date(2026, 3, 26)

# Actes a scrutin can bind to: the Assemblée's own séance-publique steps, dated.
# Scrutins are AN votes, so they belong under an AN séance or decision - the
# reading stages (AN1, AN2, ANNLEC, ANLDEF, ANLUNI, AN20, AN21) and the AN side
# of a CMP reading. A date-only rule would attach a vote to whatever acte
# happens to share its date, which on a navette day is often a Sénat deposit.
_BINDABLE_ACTE_PATTERN = r"^(AN[A-Z0-9]*-DEBATS-(SEANCE|DEC)|CMP-DEBATS-AN-(SEANCE|DEC))$"

# Visible actes only: an acte that vanished from the export keeps its stale
# last_seen_at while its dossier moves on, and is filtered out here rather than
# deleted (ADR-035 §3, the ADR-030 §2 pattern). Ingestion stamps a dossier and
# its actes in one transaction, so a current acte's stamp equals its dossier's.
SQL_DOSSIER = """
    SELECT dossier_uid, titre, procedure_label, initiateur, status, status_label,
           current_stage, parcours_start, parcours_end
    FROM dossiers
    WHERE dossier_uid = %(dossier_uid)s AND has_scrutins
"""

SQL_ACTES = f"""
    SELECT a.acte_uid, a.parent_uid, a.depth, a.ordinal, a.code_acte, a.libelle,
           a.date_acte, a.statut_label,
           a.code_acte ~ '{_BINDABLE_ACTE_PATTERN}' AND a.date_acte IS NOT NULL
               AS bindable
    FROM dossier_actes a
    JOIN dossiers d ON d.dossier_uid = a.dossier_uid
    WHERE a.dossier_uid = %(dossier_uid)s
      AND a.last_seen_at >= d.last_seen_at
    ORDER BY a.ordinal
"""

SQL_HEADLINE_SCRUTINS = """
    SELECT m.vote_id, m.voted_at, m.vote_title, v.scrutin_kind, m.result,
           m.votes_for, m.votes_against, m.abstentions, m.total_voters,
           m.summary_plain, m.theme
    FROM votes v
    JOIN analytics_marts.mart_vote_summary m ON m.vote_id = v.vote_id
    WHERE v.dossier_id = %(dossier_uid)s
      AND COALESCE(v.scrutin_kind, 'autre') NOT IN %(collapsed)s
    ORDER BY m.voted_at, m.vote_id
"""

SQL_COLLAPSED_SCRUTINS = """
    SELECT vote_id, voted_at, vote_title, scrutin_kind, result,
           votes_for, votes_against, abstentions, total_voters
    FROM votes
    WHERE dossier_id = %(dossier_uid)s
      AND scrutin_kind IN %(collapsed)s
    ORDER BY voted_at, vote_id
"""

# One row per page-carrying dossier with its scrutin aggregates. `theme` is the
# most frequent theme across the dossier's scrutins (ties broken
# alphabetically) - dossiers carry no theme of their own, and seven of them
# have no headline scrutin, so amendments count too.
_LISTED_CTE = """
    WITH listed AS (
        SELECT d.dossier_uid, d.titre, d.status, d.status_label, d.current_stage,
               d.parcours_start, d.parcours_end,
               s.last_scrutin_at, s.scrutin_count, s.headline_scrutin_count, s.theme
        FROM dossiers d
        JOIN LATERAL (
            SELECT MAX(v.voted_at) AS last_scrutin_at,
                   COUNT(*) AS scrutin_count,
                   COUNT(*) FILTER (
                       WHERE COALESCE(v.scrutin_kind, 'autre') NOT IN %(collapsed)s
                   ) AS headline_scrutin_count,
                   MODE() WITHIN GROUP (ORDER BY v.theme) AS theme
            FROM votes v
            WHERE v.dossier_id = d.dossier_uid
        ) s ON TRUE
        WHERE d.has_scrutins
    ), filtered AS (
        SELECT * FROM listed
        WHERE (%(status)s::text IS NULL OR status = %(status)s)
          AND (%(theme)s::text IS NULL OR theme = %(theme)s)
    )
"""

SQL_LIST = (
    _LISTED_CTE
    + """
    SELECT * FROM filtered
    ORDER BY last_scrutin_at DESC NULLS LAST, dossier_uid
    LIMIT %(limit)s OFFSET %(offset)s
"""
)

SQL_LIST_COUNT = _LISTED_CTE + "SELECT COUNT(*) AS total FROM filtered"

SQL_DOSSIER_REF = """
    SELECT dossier_uid, titre, status, has_scrutins
    FROM dossiers
    WHERE dossier_uid = %(dossier_uid)s
"""


def lois_url(dossier_uid: str) -> str:
    """Public bill page URL, built from the one frontend origin (MON-274)."""
    return f"{frontend_base_url()}/lois/{dossier_uid}"


def an_dossier_url(dossier_uid: str) -> str:
    """Official AN dossier page - the construction MON-89 and /agenda use."""
    return f"https://www.assemblee-nationale.fr/dyn/17/dossiers/{dossier_uid}"


def _as_date(value: date | datetime | None) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    return value


def bind_scrutin(voted_at: date | datetime | None, actes: list[dict]) -> Optional[str]:
    """The acte_uid a scrutin falls under, or None when nothing precedes it.

    Candidates are the bindable actes (dated AN séance or decision steps). The
    scrutin binds to the latest one dated on or before the vote, and among
    several on that date to the last in parcours order - so a vote on the whole
    text lands on the day's decision rather than on its séance. Over the
    legislature-17 export every tagged scrutin binds to an acte of its own date.
    """
    vote_date = _as_date(voted_at)
    if vote_date is None:
        return None
    best: Optional[dict] = None
    for acte in actes:
        if not acte["bindable"] or acte["date_acte"] > vote_date:
            continue
        if best is None or (acte["date_acte"], acte["ordinal"]) > (
            best["date_acte"],
            best["ordinal"],
        ):
            best = acte
    return best["acte_uid"] if best else None


def _require_known_status(status: Optional[str]) -> None:
    if status is not None and status not in DOSSIER_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown status - expected one of: {', '.join(DOSSIER_STATUSES)}",
        )


@router.get(
    "",
    response_model=LoiListResponse,
    summary="Bills with at least one recorded scrutin, most recently voted first",
)
@limiter.limit(tiered_limit(30))
def list_lois(
    request: Request,
    status: Optional[str] = Query(
        None, description="Filter by derived status, e.g. promulguee or en_navette"
    ),
    theme: Optional[str] = Query(None, description="Filter by the bill's most frequent theme"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000),
):
    """Every dossier législatif that has a MonÉlu bill page, newest scrutin first.

    Only bills with at least one scrutin linked to them are listed - on the order
    of 70, not the ~2 900 dossiers of the legislature. The rest were deposited
    and never debated in séance, and have no page (a 404 on `/lois/{dossier_uid}`).

    `status` is MonÉlu's reading of where the bill stands, one of `promulguee`,
    `conseil_constitutionnel`, `rejetee`, `adoptee_definitivement`, `deposee`,
    `en_commission`, `en_navette`; `status_label` is the Assemblée's own wording
    of the deciding step, verbatim. Quote the label when precision matters -
    the status is derived from it by rule. An unknown `status` filter is a 422.

    `theme` is the most frequent theme among the bill's scrutins; themes are
    MonÉlu's classification, not the Assemblée's. `headline_scrutin_count`
    excludes amendment and article votes, which dominate: most bills have one
    or two headline scrutins and can have hundreds of amendment votes.
    """
    _require_known_status(status)
    params = {
        "collapsed": COLLAPSED_KINDS,
        "status": status,
        "theme": theme,
        "limit": limit,
        "offset": offset,
    }

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SQL_LIST_COUNT, params)
            total = cur.fetchone()["total"]
            cur.execute(SQL_LIST, params)
            rows = cur.fetchall()

    return LoiListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            LoiListItem(
                dossier_uid=r["dossier_uid"],
                titre=r["titre"],
                status=r["status"],
                status_label=r["status_label"],
                current_stage=r["current_stage"],
                parcours_start=r["parcours_start"],
                parcours_end=r["parcours_end"],
                last_scrutin_at=r["last_scrutin_at"],
                scrutin_count=r["scrutin_count"],
                headline_scrutin_count=r["headline_scrutin_count"],
                theme=r["theme"],
                lois_url=lois_url(r["dossier_uid"]),
            )
            for r in rows
        ],
    )


def _load_dossier(cur, dossier_uid: str) -> tuple[dict, list[dict]]:
    """The dossier row and its visible actes, or 404 when it has no page."""
    cur.execute(SQL_DOSSIER, {"dossier_uid": dossier_uid})
    dossier = cur.fetchone()
    if dossier is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    cur.execute(SQL_ACTES, {"dossier_uid": dossier_uid})
    return dossier, cur.fetchall()


@router.get(
    "/{dossier_uid}",
    response_model=LoiDetail,
    summary="One bill's full parcours, with its headline scrutins attached",
)
@limiter.limit(tiered_limit(30))
def get_loi(request: Request, dossier_uid: str):
    """Where one bill stands: every procedural step from deposit onward, with votes attached.

    `parcours` is the primary array: every acte of the dossier (deposit,
    commission work, séances, decisions, CMP, Conseil constitutionnel,
    promulgation) in `ordinal` order, flat. The tree is encoded by `parent_uid`
    and `depth`; `ordinal` is a pre-order walk, so a single pass rebuilds it.
    Undated actes are grouping nodes (a reading stage, "Travaux des
    commissions").

    Headline scrutins - votes on the whole text, motions, and other votes that
    are neither amendments nor single articles - sit on the acte they fall
    under, in `scrutins`. Amendment and article votes are **never listed here**:
    each acte carries `amendement_count` and `article_count`, and
    `/lois/{dossier_uid}/amendements` lists them. A bill can have hundreds.

    **The parcours is complete; the scrutins are not.** The Assemblée only
    began linking scrutins to their bill on `scrutin_coverage_start`
    (2026-03-26). When `parcours_predates_coverage` is true, the bill's earlier
    stages have real dated actes but no scrutin attached - that is an upstream
    gap, not evidence that nothing was voted. Say so when describing an older
    bill. Scrutins also cover recorded votes only; much passes by show of hands.

    `status` is derived by rule from the Assemblée's `status_label`, which is
    returned verbatim alongside it. 404 for an unknown uid and for a dossier
    with no scrutin at all, which has no page.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                dossier, actes = _load_dossier(cur, dossier_uid)
                params = {"dossier_uid": dossier_uid, "collapsed": COLLAPSED_KINDS}
                cur.execute(SQL_COLLAPSED_SCRUTINS, params)
                collapsed = cur.fetchall()
                # Last: an absent mart raises UndefinedTable and aborts the
                # transaction, so nothing may run on this cursor after it.
                cur.execute(SQL_HEADLINE_SCRUTINS, params)
                headline = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        raise MART_UNAVAILABLE from None

    by_acte: dict[str, list[LoiScrutin]] = {}
    unattached: list[LoiScrutin] = []
    for row in headline:
        scrutin = LoiScrutin(**row)
        acte_uid = bind_scrutin(row["voted_at"], actes)
        if acte_uid is None:
            unattached.append(scrutin)
        else:
            by_acte.setdefault(acte_uid, []).append(scrutin)

    counts: dict[str, dict[str, int]] = {}
    unattached_collapsed = 0
    for row in collapsed:
        acte_uid = bind_scrutin(row["voted_at"], actes)
        if acte_uid is None:
            unattached_collapsed += 1
            continue
        per_kind = counts.setdefault(acte_uid, {"amendement": 0, "article": 0})
        per_kind[row["scrutin_kind"]] += 1

    parcours = [
        LoiActe(
            acte_uid=a["acte_uid"],
            parent_uid=a["parent_uid"],
            depth=a["depth"],
            ordinal=a["ordinal"],
            code_acte=a["code_acte"],
            libelle=a["libelle"],
            date_acte=a["date_acte"],
            statut_label=a["statut_label"],
            scrutins=by_acte.get(a["acte_uid"], []),
            amendement_count=counts.get(a["acte_uid"], {}).get("amendement", 0),
            article_count=counts.get(a["acte_uid"], {}).get("article", 0),
        )
        for a in actes
    ]

    scrutin_dates = [_as_date(r["voted_at"]) for r in (*headline, *collapsed) if r["voted_at"]]
    parcours_start = dossier["parcours_start"]

    return LoiDetail(
        dossier_uid=dossier["dossier_uid"],
        titre=dossier["titre"],
        procedure_label=dossier["procedure_label"],
        initiateur=dossier["initiateur"],
        status=dossier["status"],
        status_label=dossier["status_label"],
        current_stage=dossier["current_stage"],
        parcours_start=parcours_start,
        parcours_end=dossier["parcours_end"],
        an_dossier_url=an_dossier_url(dossier["dossier_uid"]),
        scrutin_coverage_start=SCRUTIN_COVERAGE_START,
        parcours_predates_coverage=(
            parcours_start is not None and parcours_start < SCRUTIN_COVERAGE_START
        ),
        first_scrutin_at=min(scrutin_dates) if scrutin_dates else None,
        amendement_count=sum(c["amendement"] for c in counts.values()),
        article_count=sum(c["article"] for c in counts.values()),
        parcours=parcours,
        unattached_scrutins=unattached,
        unattached_collapsed_count=unattached_collapsed,
    )


@router.get(
    "/{dossier_uid}/amendements",
    response_model=LoiAmendementsResponse,
    summary="One bill's amendment and article scrutins, on demand",
)
@limiter.limit(tiered_limit(30))
def list_loi_amendements(
    request: Request,
    dossier_uid: str,
    acte_uid: Optional[str] = Query(
        None, description="Only the scrutins bound to this acte of the parcours"
    ),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """The amendment and single-article scrutins `/lois/{dossier_uid}` only counts.

    Oldest first, each with the `acte_uid` of the parcours step it falls under -
    pass `acte_uid` to list one séance's votes, matching that acte's
    `amendement_count` + `article_count`. `scrutin_kind` is `amendement` or
    `article`. An amendment vote's `result` is the fate of the amendment, not of
    the bill.

    Same 404 rules as the bill page: unknown uid, or a dossier with no page.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            _, actes = _load_dossier(cur, dossier_uid)
            cur.execute(
                SQL_COLLAPSED_SCRUTINS,
                {"dossier_uid": dossier_uid, "collapsed": COLLAPSED_KINDS},
            )
            rows = cur.fetchall()

    bound = [
        LoiAmendementScrutin(**row, acte_uid=bind_scrutin(row["voted_at"], actes)) for row in rows
    ]
    if acte_uid is not None:
        bound = [s for s in bound if s.acte_uid == acte_uid]

    return LoiAmendementsResponse(
        dossier_uid=dossier_uid,
        acte_uid=acte_uid,
        total=len(bound),
        limit=limit,
        offset=offset,
        items=bound[offset : offset + limit],
    )
