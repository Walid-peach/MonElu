"""Daily counters for the web app install flow (#598, epic #593).

ADR-041 §2 keeps Android on the website and its installable web app until a
measured trigger fires. These counters are that measurement: how often the
install entry points are used, how the browser's install window is answered,
how many installs happen, and how often the site is opened as the installed
app. The Vercel plan does not record custom analytics events, so the counts
are kept here, first-party.

Each request adds one to a `(Paris day, event)` row and nothing else: no IP,
user agent, URL, identifier or exact time is stored, so there is no personal
data to protect, export or delete.
"""

import logging
from typing import Literal, get_args

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.db import get_conn
from api.limiter import limiter, tiered_limit

logger = logging.getLogger(__name__)

router = APIRouter()

InstallEvent = Literal[
    "install_section_tap",
    "menu_entry_tap",
    "install_prompt_shown",
    "install_prompt_accepted",
    "install_prompt_dismissed",
    "app_installed",
    "app_store_badge_tap",
    "standalone_visit",
]

# Mirrored by the CHECK in data/migrations/014_install_events.sql and by
# INSTALL_EVENTS in frontend/src/lib/installEvents.ts.
INSTALL_EVENTS: tuple[str, ...] = get_args(InstallEvent)

SQL_INCREMENT = """
    INSERT INTO install_event_counts (day, event, count)
    VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, %(event)s, 1)
    ON CONFLICT (day, event) DO UPDATE SET count = install_event_counts.count + 1
"""


class InstallEventRequest(BaseModel):
    event: InstallEvent


class InstallEventResponse(BaseModel):
    status: str = "ok"


@router.post(
    "",
    response_model=InstallEventResponse,
    summary="Compter une étape du parcours d'installation de l'application web",
)
@limiter.limit(tiered_limit(20))
def record_install_event(request: Request, body: InstallEventRequest):
    """Add one to today's count for an install-flow event. Write-only.

    `event` is one of: `install_section_tap` (the homepage "MonÉlu sur votre
    téléphone" link), `menu_entry_tap` (the mobile Menu entry),
    `install_prompt_shown` / `install_prompt_accepted` /
    `install_prompt_dismissed` (the browser's install window and its answer),
    `app_installed` (the browser's `appinstalled` event), `app_store_badge_tap`
    and `standalone_visit` (a session opened as the installed web app, sent once
    per session by the site).

    Only a per-day total per event is kept, by Paris date; nothing about the
    caller is stored, and there is no read endpoint. Meant for the site's own UI.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(SQL_INCREMENT, {"event": body.event})
            conn.commit()
    except Exception:
        logger.exception("Failed to record install event")
        raise HTTPException(
            status_code=500,
            detail="Service temporairement indisponible. Réessayez dans quelques secondes.",
        ) from None
    return InstallEventResponse()
