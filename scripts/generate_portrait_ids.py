r"""
scripts/generate_portrait_ids.py
Regenerates the portrait-proxy allowlist (MON-251).

`/api/portraits/<id>.jpg` used to accept any id matching /^\d{1,9}$/ — a
billion URLs, each costing one Vercel function invocation plus one outbound
fetch to assemblee-nationale.fr. MON-198 bounded the *legitimate* serving cost
by deputy count (~648 URLs); this list bounds the *abusive* cost the same way,
by 404-ing anything outside the real set without touching the AN.

The set is every deputy the 17th legislature has seated, so it grows only on a
by-election or a replacement — a few times a year. It is checked in rather than
fetched at build time so the frontend build gains no new dependency on the
production API being reachable (the sitemap prerender already flakes on that).

    make portrait-ids                       # DB mode, via DATABASE_URL
    python scripts/generate_portrait_ids.py --api https://monelu-production.up.railway.app
    python scripts/generate_portrait_ids.py --check    # exit 1 if the file is stale

A stale list is a cosmetic degradation, not an outage: DeputyAvatar falls back
to initials when a portrait 404s. Refresh it when a new deputy is seated.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts._http import download_with_retry  # noqa: E402

AN_PORTRAIT_PREFIX = "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/"
PORTRAIT_URL = re.compile(re.escape(AN_PORTRAIT_PREFIX) + r"(\d{1,9})\.jpg$", re.IGNORECASE)

# Sanity floor for a regeneration; see main(). The 17th legislature has seated
# 648 deputies so far, all with a portrait.
MIN_EXPECTED_IDS = 500

OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "src",
    "lib",
    "portraitIds.ts",
)

HEADER = """/**
 * Portrait-proxy allowlist (MON-251) — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 * Every portrait id the Assemblée Nationale has published for a 17th-legislature
 * deputy. `/api/portraits/<id>.jpg` serves only these, so an attacker looping
 * over invented ids gets a cheap 404 instead of a function invocation that
 * fetches assemblee-nationale.fr on our behalf.
 *
 * The id is the numeric part of the deputy_id (`PA842137` -> `842137`).
 *
 * Regenerate with `make portrait-ids` when a by-election seats a new deputy.
 * A stale entry is cosmetic, not an outage: DeputyAvatar falls back to initials
 * when a portrait 404s.
 */
export const PORTRAIT_IDS: ReadonlySet<string> = new Set([
"""

FOOTER = "])\n"


def ids_from_db(database_url: str) -> list[str]:
    import psycopg2

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT photo_url FROM deputies WHERE photo_url IS NOT NULL")
            rows = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()
    return _extract(rows)


def ids_from_api(base_url: str) -> list[str]:
    """Page through GET /deputies so the list can be refreshed without DB creds."""
    import json

    photo_urls: list[str] = []
    offset, limit = 0, 100
    while True:
        raw = download_with_retry(f"{base_url.rstrip('/')}/deputies?limit={limit}&offset={offset}")
        page = json.loads(raw)
        if "total" not in page:
            # Without it the loop below cannot tell "last page" from "first page
            # of a reshaped response", and would write a truncated allowlist -
            # which 404s every portrait it dropped.
            raise SystemExit(f"GET /deputies returned no `total` field: keys={sorted(page)}")
        items = page.get("items", [])
        photo_urls.extend(item["photo_url"] for item in items if item.get("photo_url"))
        offset += limit
        if offset >= page["total"] or not items:
            break
    return _extract(photo_urls)


def _extract(photo_urls: list[str]) -> list[str]:
    ids = {m.group(1) for url in photo_urls if (m := PORTRAIT_URL.match(url or ""))}
    # Numeric sort so the generated file's diff stays readable when ids are added.
    return sorted(ids, key=int)


def render(ids: list[str]) -> str:
    return HEADER + "".join(f"  '{i}',\n" for i in ids) + FOOTER


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate the portrait-proxy allowlist")
    parser.add_argument(
        "--api", default=None, help="Read deputies from a live API instead of the DB"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write; exit 1 if the checked-in file differs from the source of truth.",
    )
    args = parser.parse_args()

    if args.api:
        ids = ids_from_api(args.api)
    else:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise SystemExit("DATABASE_URL is not set (or pass --api to read from a live API).")
        ids = ids_from_db(database_url)

    # A short list is as damaging as an empty one and much easier to miss: every
    # id it drops is a portrait that 404s. The Assemblée seats 577 deputies at
    # any moment and the set only grows, so anything under 500 means a truncated
    # fetch or a reshaped response, not a real shrink.
    if len(ids) < MIN_EXPECTED_IDS:
        raise SystemExit(
            f"Refusing to write {len(ids)} portrait ids (expected at least "
            f"{MIN_EXPECTED_IDS}) — the source looks truncated."
        )

    rendered = render(ids)
    with open(OUTPUT_PATH, encoding="utf-8") as fh:
        current = fh.read()

    if args.check:
        if current != rendered:
            missing = sorted(set(ids) - set(re.findall(r"'(\d+)'", current)), key=int)
            extra = sorted(set(re.findall(r"'(\d+)'", current)) - set(ids), key=int)
            print(f"{OUTPUT_PATH} is stale ({len(ids)} ids upstream).")
            if missing:
                print(f"  Portraits that would 404: {', '.join(missing)}")
            if extra:
                print(f"  Ids no longer upstream: {', '.join(extra)}")
            print("  Refresh with: make portrait-ids")
            raise SystemExit(1)
        print(f"Portrait allowlist is up to date ({len(ids)} ids).")
        return

    if current == rendered:
        print(f"Portrait allowlist unchanged ({len(ids)} ids).")
        return
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        fh.write(rendered)
    print(f"Wrote {len(ids)} portrait ids to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
