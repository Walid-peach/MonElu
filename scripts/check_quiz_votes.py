"""
scripts/check_quiz_votes.py
Validation gate for the quiz question set (MON-171).

Asserts that every vote_id in api.quiz_data.QUIZ_VOTE_IDS exists in the
production votes table. QUIZ_VOTE_IDS is self-referential (the request
validator only checks membership in the curated set), so without this gate a
typo'd or upstream-renumbered vote_id silently shrinks every deputy's
`compared` count and skews all agreement percentages — no error, no log.

Two modes:

    python scripts/check_quiz_votes.py
        DB mode (default) — checks the votes table via DATABASE_URL.
        Run daily by ingest_prod.yml; catches upstream renumbering.

    python scripts/check_quiz_votes.py --api https://monelu-production.up.railway.app
        API mode — checks GET /votes/{id} against a live API, no DB
        credentials needed. Run per-PR by ci.yml; catches a typo'd
        vote_id in a quarterly refresh before it merges.

Exits 1 with the list of missing vote_ids on any failure.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.quiz_data import QUIZ_VERSION, QUIZ_VOTE_IDS  # noqa: E402

MAX_RETRIES = 5
BACKOFF_BASE = 2  # exponential backoff: waits of 1, 2, 4, 8 s between attempts


def missing_from_db(database_url: str) -> list[str]:
    """Return quiz vote_ids absent from the votes table."""
    import psycopg2

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT vote_id FROM votes WHERE vote_id = ANY(%s)",
                (sorted(QUIZ_VOTE_IDS),),
            )
            present = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return sorted(QUIZ_VOTE_IDS - present)


def vote_exists_via_api(base_url: str, vote_id: str) -> bool:
    """GET /votes/{id}: 200 = present, 404 = missing; retry 429/5xx/network."""
    url = f"{base_url.rstrip('/')}/votes/{vote_id}"
    last_error: str | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=30)
        except requests.RequestException as exc:
            last_error = str(exc)
        else:
            if resp.status_code == 200:
                return True
            if resp.status_code == 404:
                return False
            last_error = f"HTTP {resp.status_code}"
        if attempt < MAX_RETRIES - 1:
            time.sleep(BACKOFF_BASE**attempt)
    raise RuntimeError(f"Could not check {url} after {MAX_RETRIES} attempts: {last_error}")


def missing_from_api(base_url: str) -> list[str]:
    """Return quiz vote_ids the live API does not know."""
    missing = []
    for i, vote_id in enumerate(sorted(QUIZ_VOTE_IDS)):
        if i:
            # Pace at 2 s per request (true 30 req/min) so the check stays
            # under the API's global rate limit even if the question set grows.
            time.sleep(2)
        if not vote_exists_via_api(base_url, vote_id):
            missing.append(vote_id)
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api",
        metavar="BASE_URL",
        help="check via GET /votes/{id} on this API instead of DATABASE_URL",
    )
    args = parser.parse_args()

    if args.api:
        source = args.api
        try:
            missing = missing_from_api(args.api)
        except RuntimeError as exc:
            # Prod unreachable is a different failure from a missing vote_id —
            # keep it to one readable line instead of a traceback in CI logs.
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
    else:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("DATABASE_URL is not set (or pass --api <base_url>).", file=sys.stderr)
            return 1
        source = "votes table"
        missing = missing_from_db(database_url)

    total = len(QUIZ_VOTE_IDS)
    if missing:
        print(
            f"FAIL: {len(missing)}/{total} quiz vote_ids ({QUIZ_VERSION}) "
            f"missing from {source}: {', '.join(missing)}",
            file=sys.stderr,
        )
        print(
            "The quiz would silently skip these scrutins, skewing every agreement "
            "percentage. Fix api/quiz_data.py (see docs/quiz-curation.md).",
            file=sys.stderr,
        )
        return 1

    print(f"OK: all {total} quiz vote_ids ({QUIZ_VERSION}) present in {source}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
