"""
ingest_votes.py
Downloads the Scrutins ZIP export from the Assemblée Nationale open-data portal
and upserts each scrutin into the votes table.

Usage:
    python scripts/ingest_votes.py                      # default: rolling 12 months
    python scripts/ingest_votes.py --since 2024-07-07   # full legislature 17
    python scripts/ingest_votes.py --since 2026-01-01   # current year only
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
import unicodedata
import zipfile
from datetime import date, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_votes.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DATABASE_URL = os.getenv("DATABASE_URL")

SCRUTINS_ZIP_PATH = "/static/openData/repository/17/loi/scrutins/Scrutins.json.zip"

# Shape of an AN dossier législatif reference, e.g. "DLR5L17N52985". Mirrored by
# frontend/src/lib/an.ts::DOSSIER_REF, which refuses to build the "Voir le dossier
# officiel" link for anything else (MON-258).
DOSSIER_REF_RE = re.compile(r"^DLR[A-Za-z0-9]+$")

# ── scrutin_kind (ADR-035 §4, migration 012) ────────────────────────────────
# What the chamber actually voted on, classified from objet.libelle at ingestion
# time so MON-244 can split headline scrutins from the amendment count instead of
# listing 400 amendment votes on a bill page. Ordered rules, first match wins.
#
# Order is load-bearing: an amendment's libellé names the article it amends
# ("l'amendement n° 15 de M. Rancoule à l'article premier de la proposition…"),
# so the amendment test has to run before the article test. Sous-amendements are
# amendments for this purpose - they are the same noise on the same timeline.
_AMENDEMENT_RE = re.compile(r"^(l'|le |la |les )?(sous-)?amendements?\b")
_ARTICLE_RE = re.compile(r"^(l'|les )?articles?\b")

SCRUTIN_KINDS = ("ensemble", "motion", "amendement", "article", "autre")


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_all_scrutins(since: str | None = None, zip_path: str | None = None) -> list[dict]:
    """Load scrutins from a local ZIP (zip_path) or download one.

    Filtered to dateScrutin >= since.
    """
    if zip_path:
        log.info("Reading scrutins ZIP from %s…", zip_path)
        with open(zip_path, "rb") as fh:
            raw = fh.read()
    else:
        url = f"{AN_BASE_URL}{SCRUTINS_ZIP_PATH}"
        log.info("Downloading scrutins ZIP from %s…", url)
        raw = download_with_retry(url)

    items = []
    skipped = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        scrutin_files = [n for n in zf.namelist() if n.startswith("json/") and n.endswith(".json")]
        log.info("ZIP contains %d scrutin files.", len(scrutin_files))
        for name in scrutin_files:
            with zf.open(name) as f:
                data = json.load(f)
            scrutin = data.get("scrutin") or data
            if since:
                date_raw = (scrutin.get("dateScrutin") or "")[:10]
                if date_raw and date_raw < since:
                    skipped += 1
                    continue
            items.append(scrutin)

    if since:
        log.info("Loaded %d scrutins since %s (skipped %d older).", len(items), since, skipped)
    else:
        log.info("Total scrutins loaded: %d", len(items))
    return items


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def _to_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def extract_dossier_ref(item: dict) -> str | None:
    """Dossier reference carried by a scrutin, exactly as published.

    Returned unvalidated on purpose: ``parse_vote`` drops a non-conforming value
    and ``check_dossier_refs`` reports it, so the two callers see the same raw
    string rather than one silently repairing what the other is meant to detect.
    """
    dossier_ref = item.get("dossierRef") or None
    if isinstance(dossier_ref, dict):
        dossier_ref = dossier_ref.get("#text") or dossier_ref.get("ref")
    # Also check objet.dossierLegislatif - the only populated location since 2026-03.
    if not dossier_ref:
        obj = item.get("objet") or {}
        dossier_ref = obj.get("dossierLegislatif") or None
        if isinstance(dossier_ref, dict):
            dossier_ref = dossier_ref.get("dossierRef") or dossier_ref.get("#text")
    return str(dossier_ref) if dossier_ref else None


def is_dossier_ref(value: str | None) -> bool:
    return bool(value) and DOSSIER_REF_RE.match(value) is not None


def _normalise_libelle(value: str | None) -> str:
    """Lowercase, strip accents, normalise curly apostrophes and whitespace."""
    decomposed = unicodedata.normalize("NFD", value or "")
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped.lower().replace("\u2019", "'")).strip()


def classify_scrutin_kind(libelle: str | None) -> str:
    """Classify a scrutin as ensemble | motion | amendement | article | autre.

    Measured over the full export (8 434 scrutins, 2026-09-22): 7 216 amendement,
    872 article, 222 ensemble, 81 motion, 43 autre. Over the 2 608 dossier-tagged
    scrutins the split is 2 261 / 241 / 72 / 19 / 15, which is what ADR-035 §4's
    "collapse the amendments" rendering rule is sized against.

    ``autre`` is a real bucket, not a parse failure: suspensions de séance and
    requests to extend the sitting are votes on nothing in the text.
    """
    normalised = _normalise_libelle(libelle)
    if not normalised:
        return "autre"
    if _AMENDEMENT_RE.match(normalised):
        return "amendement"
    if "motion" in normalised:
        return "motion"
    if normalised.startswith("l'ensemble"):
        return "ensemble"
    if _ARTICLE_RE.match(normalised):
        return "article"
    return "autre"


def parse_vote(item: dict) -> dict | None:
    try:
        uid = item.get("uid") or ""
        if not uid:
            return None

        date_raw = item.get("dateScrutin") or ""
        voted_at = date_raw[:10] if date_raw else None

        titre = item.get("titre") or ""
        if isinstance(titre, dict):
            titre = titre.get("#text") or titre.get("libelle") or ""
        vote_title = str(titre).strip()

        type_vote = item.get("typeVote") or {}
        vote_type = type_vote.get("codeTypeVote") if isinstance(type_vote, dict) else str(type_vote)

        sort = item.get("sort") or {}
        result = sort.get("code") if isinstance(sort, dict) else str(sort)

        syn = item.get("syntheseVote") or {}
        decompte = syn.get("decompte") or {}
        votes_for = _to_int(decompte.get("pour"))
        votes_against = _to_int(decompte.get("contre"))
        abstentions = _to_int(decompte.get("abstentions"))
        total_voters = _to_int(syn.get("nombreVotants"))

        dossier_ref = extract_dossier_ref(item)
        objet = item.get("objet") or {}
        libelle = objet.get("libelle") if isinstance(objet, dict) else None

        return {
            "vote_id": uid,
            "voted_at": voted_at,
            "vote_title": vote_title,
            "vote_type": str(vote_type) if vote_type else None,
            "result": str(result) if result else None,
            "votes_for": votes_for,
            "votes_against": votes_against,
            "abstentions": abstentions,
            "total_voters": total_voters,
            "dossier_id": dossier_ref if is_dossier_ref(dossier_ref) else None,
            # objet.libelle and titre are byte-identical on all 8 434 scrutins in
            # the export, which is what lets backfill_scrutin_kinds() below
            # classify already-stored rows from vote_title with the same function.
            "scrutin_kind": classify_scrutin_kind(libelle or vote_title),
        }
    except Exception as exc:
        log.debug("Could not parse scrutin %s — %s", item.get("uid"), exc)
        return None


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO votes (
    vote_id, voted_at, vote_title, vote_type, result,
    votes_for, votes_against, abstentions, total_voters,
    dossier_id, scrutin_kind, ingested_at, changed_at
) VALUES (
    %(vote_id)s, %(voted_at)s, %(vote_title)s, %(vote_type)s, %(result)s,
    %(votes_for)s, %(votes_against)s, %(abstentions)s, %(total_voters)s,
    %(dossier_id)s, %(scrutin_kind)s, NOW(), NOW()
)
ON CONFLICT (vote_id) DO UPDATE SET
    voted_at      = EXCLUDED.voted_at,
    vote_title    = EXCLUDED.vote_title,
    vote_type     = EXCLUDED.vote_type,
    result        = EXCLUDED.result,
    votes_for     = EXCLUDED.votes_for,
    votes_against = EXCLUDED.votes_against,
    abstentions   = EXCLUDED.abstentions,
    total_voters  = EXCLUDED.total_voters,
    dossier_id    = EXCLUDED.dossier_id,
    scrutin_kind  = EXCLUDED.scrutin_kind,
    ingested_at   = NOW(),
    -- `ingested_at` stays unconditional: dbt's source freshness reads it as
    -- "the last run that wrote this row" (transform/models/staging/sources.yml)
    -- and the marts publish max(ingested_at) as their `updated_at`.
    -- `changed_at` is the other half (GH #353, migration 011): the last run
    -- that wrote something *different*, which is what run_ingestion_prod.py
    -- builds the frontend cache-invalidation scope from. Never merge the two
    -- into one column, and never turn this into a `WHERE` that skips the row -
    -- a skipped row cannot stamp `ingested_at` either.
    -- `ingested_at`/`changed_at` are excluded from the comparison on purpose:
    -- they move on every write, so including them would make every row differ
    -- from itself. `scrutin_kind` is excluded too, for a different reason: it is
    -- a pure function of `vote_title`, which is already in the comparison, so it
    -- can only change when that does - and including it would mark all ~8 400
    -- rows changed on the first run after migration 012, purging a day of cached
    -- pages to publish a column no page reads yet.
    changed_at    = CASE WHEN (
                        votes.voted_at, votes.vote_title, votes.vote_type, votes.result,
                        votes.votes_for, votes.votes_against, votes.abstentions,
                        votes.total_voters, votes.dossier_id
                      ) IS DISTINCT FROM (
                        EXCLUDED.voted_at, EXCLUDED.vote_title, EXCLUDED.vote_type,
                        EXCLUDED.result, EXCLUDED.votes_for, EXCLUDED.votes_against,
                        EXCLUDED.abstentions, EXCLUDED.total_voters, EXCLUDED.dossier_id
                      ) THEN NOW() ELSE votes.changed_at END;
"""


def _upsert_records(records: list[dict]) -> None:
    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, records, page_size=500)
        log.info("Upsert complete — %d votes written.", len(records))
    finally:
        conn.close()


BACKFILL_KIND_SQL = """
SELECT vote_id, vote_title FROM votes WHERE scrutin_kind IS NULL
"""


def backfill_scrutin_kinds() -> int:
    """Classify any vote still missing a ``scrutin_kind``. Returns rows written.

    Migration 012 adds the column NULL on every existing row, and the daily cron
    only re-upserts a 30-day ``--since`` window (CLAUDE.md decision 8's correction
    horizon), so the upsert above would take months to reach the whole table and
    would never reach a vote the AN has stopped republishing. This pass closes
    that gap on the first run after the migration and no-ops on every run after.

    It classifies from ``vote_title`` rather than from the export, which is exact:
    ``titre`` and ``objet.libelle`` are byte-identical on all 8 434 scrutins in
    the export, and it is the same ``classify_scrutin_kind`` either way — there is
    no second implementation of the rules to drift.

    ``changed_at`` is deliberately left alone: this writes a column the frontend
    does not read yet, so it is not a reason to purge a day of cached pages
    (GH #353). ``ingested_at`` is left alone for the same reason it is everywhere
    else — our own derived value is not a new AN record.
    """
    conn = connect_with_retry(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(BACKFILL_KIND_SQL)
                rows = cur.fetchall()
                if not rows:
                    log.info("scrutin_kind: nothing to backfill.")
                    return 0
                updates = [
                    {"vote_id": vote_id, "scrutin_kind": classify_scrutin_kind(vote_title)}
                    for vote_id, vote_title in rows
                ]
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE votes SET scrutin_kind = %(scrutin_kind)s WHERE vote_id = %(vote_id)s",
                    updates,
                    page_size=500,
                )
        log.info("scrutin_kind: backfilled %d votes outside the --since window.", len(updates))
        return len(updates)
    finally:
        conn.close()


def check_dossier_refs(raw_items: list[dict]) -> None:
    """Exit 1 when the dossier reference stops looking like a dossier reference.

    ``objet.dossierLegislatif`` is a ``{libelle, dossierRef}`` dict, and until
    commit 7e29131 the parser stringified the whole dict instead of reading
    ``dossierRef``. Nothing failed: the corrupt value was upserted, the frontend
    regex in ``an.ts`` rejected it, and the "Voir le dossier officiel" link was
    simply not rendered on 1 570 production votes for four months (MON-258).

    A shape change on that subtree fails the same silent way, so the check is on
    the *share* of dossier-carrying scrutins whose reference is malformed rather
    than on the parse succeeding at all. Scrutins with no dossier are not counted:
    the AN published none before 2026-03 (ADR-035), so an all-null run is normal
    history, not a regression.
    """
    seen = 0
    malformed: list[tuple[str, str]] = []
    for item in raw_items:
        raw = extract_dossier_ref(item)
        if raw is None:
            continue
        seen += 1
        if not is_dossier_ref(raw):
            malformed.append((str(item.get("uid") or "?"), raw))

    if not malformed:
        log.info(
            "Dossier references: %d/%d scrutins carry one, all well-formed.", seen, len(raw_items)
        )
        return

    rate = len(malformed) / seen
    log.error(
        "Malformed dossier references: %d/%d (%.0f%%). First offenders: %s",
        len(malformed),
        seen,
        rate * 100,
        "; ".join(f"{uid}={raw[:80]!r}" for uid, raw in malformed[:3]),
    )
    if rate > SKIP_RATE_THRESHOLD:
        # Abort before upserting: these rows would be written with a NULL
        # dossier_id, which reads downstream as "this scrutin has no bill"
        # rather than as a broken feed.
        sys.exit(1)


def upsert_votes(raw_items: list[dict]) -> int:
    """Parse raw scrutin dicts and upsert into votes table. Returns count written."""
    records = [r for item in raw_items if (r := parse_vote(item)) is not None]
    skipped = len(raw_items) - len(records)
    skip_rate = skipped / len(raw_items) if raw_items else 0.0
    log.info("Parsed %d valid records (skipped %d unparseable).", len(records), skipped)
    if skip_rate > SKIP_RATE_THRESHOLD:
        log.error(
            "High parse failure rate: %d/%d records skipped (%.0f%%). "
            "Check the AN data format for unexpected changes.",
            skipped,
            len(raw_items),
            skip_rate * 100,
        )
        # Abort without upserting: writing the surviving records would still
        # stamp them with a fresh ingested_at, masking the failure from dbt
        # source freshness checks (MON-220).
        sys.exit(1)
    check_dossier_refs(raw_items)
    _upsert_records(records)
    return len(records)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest AN scrutins into MonÉlu DB")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Only ingest votes on or after this date (YYYY-MM-DD). Default: rolling 12 months.",
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Path to an already-downloaded Scrutins.json.zip (skips the download).",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        raise EnvironmentError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    log.info("=== Starting vote ingestion (since %s) ===", args.since)
    raw_items = fetch_all_scrutins(since=args.since, zip_path=args.zip_path)
    upsert_votes(raw_items)
    # Separate pass, deliberately outside upsert_votes: it reaches rows this run
    # never looked at, so it is a maintenance sweep over the table rather than
    # part of writing the window.
    backfill_scrutin_kinds()
    log.info("=== Vote ingestion finished ===")


if __name__ == "__main__":
    main()
