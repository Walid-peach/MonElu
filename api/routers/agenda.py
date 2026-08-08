"""
api/routers/agenda.py

Agenda endpoints (MON-212, ADR-030) — "à l'ordre du jour cette semaine".

One read endpoint over `agenda_items`: upcoming séance publique points,
grouped by sitting day. No dbt mart — ADR-030 reads the raw table directly,
same as api/routers/groups.py does for group pages.

An item is visible only when both conditions hold (ADR-030 §2):
- it was seen in the most recent completed ingestion run (last_seen_at
  equals the table's max — ingest_agenda.py stamps every row touched in a
  run with the same transaction-frozen NOW());
- neither its réunion nor its own state is Annulé/Supprimé.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from starlette.requests import Request

from api.db import get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import AgendaDay, AgendaItem, AgendaResponse

router = APIRouter()

# A "sane maximum" per the issue's acceptance criteria — the agenda feed's
# forward coverage is limited (MON-208 spike) and every real use case is a
# week-or-month-scale window, not a full-legislature scan.
AGENDA_MAX_SPAN_DAYS = 90

_CANCELLED_STATES = ("Annulé", "Supprimé")

# Module-level so integration tests can exercise the exact SQL (a mocked
# cursor can't catch a date-vs-timestamp comparison bug).
_AGENDA_QUERY = """
    SELECT a.point_uid, a.sitting_start, a.sitting_end, a.objet,
           a.point_type, a.summary_plain, a.theme, a.dossier_id,
           v.vote_id, v.result
    FROM agenda_items a
    -- Earliest scrutin on or after the sitting *date* (ADR-030 §4) — date,
    -- not sitting_start's time-of-day, so a same-day scrutin that happened
    -- earlier than this point's slot still links.
    LEFT JOIN LATERAL (
        SELECT vote_id, result
        FROM votes
        WHERE votes.dossier_id = a.dossier_id
          AND votes.voted_at::date >= a.sitting_start::date
        ORDER BY votes.voted_at ASC
        LIMIT 1
    ) v ON a.dossier_id IS NOT NULL
    WHERE a.last_seen_at = (SELECT MAX(last_seen_at) FROM agenda_items)
      AND a.reunion_etat NOT IN %s
      AND (a.point_etat IS NULL OR a.point_etat NOT IN %s)
      AND a.sitting_start >= %s
      AND a.sitting_start < %s
    ORDER BY a.sitting_start ASC, a.point_uid ASC
"""


def _week_window(today: date) -> tuple[date, date]:
    """Monday-to-Sunday window containing `today` — the default "this week"."""
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


def _dossier_url(dossier_id: str) -> str:
    """Official AN dossier page — same construction MON-89 uses on vote cards."""
    return f"https://www.assemblee-nationale.fr/dyn/17/dossiers/{dossier_id}"


def _resolve_window(from_date: Optional[date], to_date: Optional[date]) -> tuple[date, date]:
    if (from_date is None) != (to_date is None):
        raise HTTPException(status_code=422, detail="from and to must be provided together")

    if from_date is None:
        return _week_window(date.today())

    if to_date < from_date:
        raise HTTPException(status_code=422, detail="to must not precede from")

    if (to_date - from_date).days > AGENDA_MAX_SPAN_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"Window too large — max {AGENDA_MAX_SPAN_DAYS} days",
        )

    return from_date, to_date


@router.get("", response_model=AgendaResponse)
@limiter.limit(tiered_limit(30))
def get_agenda(
    request: Request,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
):
    from_date, to_date = _resolve_window(from_date, to_date)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                _AGENDA_QUERY,
                (
                    _CANCELLED_STATES,
                    _CANCELLED_STATES,
                    from_date,
                    to_date + timedelta(days=1),
                ),
            )
            rows = cur.fetchall()

    days: list[AgendaDay] = []
    for row in rows:
        item = AgendaItem(
            point_uid=row["point_uid"],
            sitting_start=row["sitting_start"],
            sitting_end=row["sitting_end"],
            objet=row["objet"],
            point_type=row["point_type"],
            summary_plain=row["summary_plain"],
            theme=row["theme"],
            dossier_id=row["dossier_id"],
            dossier_url=_dossier_url(row["dossier_id"]) if row["dossier_id"] else None,
            vote_id=row["vote_id"],
            result=row["result"],
        )
        sitting_date = row["sitting_start"].date()
        if days and days[-1].sitting_date == sitting_date:
            days[-1].items.append(item)
        else:
            days.append(AgendaDay(sitting_date=sitting_date, items=[item]))

    return AgendaResponse(from_date=from_date, to_date=to_date, days=days)
