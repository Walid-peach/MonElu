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


PLACEHOLDER_PREFIXES = ("sk-...", "gsk_...", "your-", "changeme")


def is_placeholder(value: str | None) -> bool:
    """True when a secret is unset, blank, or still holds an example value from `.env.example`.

    The startup warnings and `/health` in `main.py` and the 503 guard in `routers/verify.py`
    all read this one check, so a prefix added to `PLACEHOLDER_PREFIXES` reaches every caller.
    """
    return (
        not value
        or not value.strip()
        or any(value.strip().startswith(p) for p in PLACEHOLDER_PREFIXES)
    )
