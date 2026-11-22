"""
api/an_links.py

URLs on the Assemblée nationale's own site that the API hands back.

The website builds the same URL in `frontend/src/lib/an.ts` (`anScrutinUrl`).
"""

import re
from typing import Optional

_SCRUTIN_UID = re.compile(r"VTANR5L(\d{1,3})V(\d{1,9})")

AN_SCRUTINS_INDEX_URL = "https://www.assemblee-nationale.fr/dyn/17/scrutins"


def an_scrutin_url(vote_id: Optional[str]) -> Optional[str]:
    """Official AN page of one scrutin, or None when the id is not an AN scrutin uid.

    The AN serves it at `/dyn/<legislature>/scrutins/<number>`; the full uid in
    that path is a 404 (#617).
    """
    match = _SCRUTIN_UID.fullmatch(vote_id or "")
    if not match:
        return None
    legislature, number = match.groups()
    return f"https://www.assemblee-nationale.fr/dyn/{legislature}/scrutins/{number}"
