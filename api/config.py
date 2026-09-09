"""
api/config.py
Shared runtime configuration read from the environment.

Single home for values that more than one module needs, so a change to a
default or to normalisation happens in one place (MON-274).
"""

import os

DEFAULT_FRONTEND_BASE_URL = "https://mon-elu.vercel.app"


def frontend_base_url() -> str:
    """Public origin of the Next.js frontend, without a trailing slash.

    Used for the `/` redirect and for every share URL the API hands back
    (`/quiz/s/…`, `/chat/s/…`, `/verifier/v/…`).

    A domain move means setting this on Railway **and** `NEXT_PUBLIC_SITE_URL`
    on Vercel (MON-254) — they are the same origin under two names, and the
    frontend one is inlined at build time, so it needs a rebuild.
    """
    return os.getenv("FRONTEND_BASE_URL", DEFAULT_FRONTEND_BASE_URL).rstrip("/")
