"""
scripts/ingest_amendments.py
Attach the official AN amendment text to the amendment scrutins it was voted in
(#630, ADR-043), so vote summaries are written from the amendment rather than
from its title.

The export is about 348 MB and is only downloaded when a vote in the window
still has no text. A scrutin carries no amendment reference, so the match comes
from its title: number, first author and date. A vote that cannot be matched to
exactly one amendment gets no row and therefore no generated summary - a wrong
match would publish a confident summary of a different amendment.

Usage:
    python scripts/ingest_amendments.py
    python scripts/ingest_amendments.py --since 2025-07-01
    python scripts/ingest_amendments.py --zip-path /tmp/Amendements.json.zip
"""

import argparse
import html
import json
import logging
import os
import re
import sys
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from datetime import date, timedelta

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_amendments.py
    from _http import SKIP_RATE_THRESHOLD, connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
AMENDMENTS_ZIP_PATH = (
    "/static/openData/repository/17/loi/amendements_div_legis/Amendements.json.zip"
)

# A vote and its amendment's recorded `dateSort` can straddle a late sitting.
MAX_SORT_DRIFT_DAYS = 2
# Long budget amendments run to pages; the prompt only reads the start.
MAX_TEXT_CHARS = 4000
# Below this share of a window's amendment votes matched, the title or export
# shape has moved. Unlike SKIP_RATE_THRESHOLD, a few percent never matching is
# normal: about 4% of titles name a co-signatory or are mistyped upstream.
MIN_MATCH_RATE = 0.8
MIN_VOTES_FOR_MATCH_RATE = 20

TITLE_RE = re.compile(
    r"^(?:l.amendement|le sous-amendement) n[°º]\s*(?P<number>\d+)\s*"
    r"(?:\([^)]*rect[^)]*\)\s*)?"
    r"(?:et l\S* ?amendements? identiques?(?: suivants?)? )?"
    r"(?:de la |du |de )?(?:M\. |Mme )?"
    r"(?P<author>.+?)"
    r"(?= à l| à la | au | après | avant | et l| de suppression| de r| de s| l.article| \(|$)",
    re.IGNORECASE,
)
NUMBER_RE = re.compile(r"(?:[IVX]+-)?(\d+)")
TAG_RE = re.compile(r"<[^>]+>")

SQL_WINDOW_VOTES = """
SELECT v.vote_id, v.vote_title, v.voted_at::date AS voted_on,
       a.vote_id IS NOT NULL AS has_text
FROM votes v
LEFT JOIN vote_amendments a ON a.vote_id = v.vote_id
WHERE v.scrutin_kind = 'amendement' AND v.voted_at >= %s
"""

SQL_UPSERT = """
INSERT INTO vote_amendments (
    vote_id, amendment_uid, is_sub_amendment, dispositif, expose_sommaire
) VALUES (
    %(vote_id)s, %(amendment_uid)s, %(is_sub_amendment)s, %(dispositif)s, %(expose_sommaire)s
)
ON CONFLICT (vote_id) DO UPDATE SET
    amendment_uid = EXCLUDED.amendment_uid,
    is_sub_amendment = EXCLUDED.is_sub_amendment,
    dispositif = EXCLUDED.dispositif,
    expose_sommaire = EXCLUDED.expose_sommaire,
    ingested_at = NOW(),
    changed_at = CASE
        WHEN vote_amendments.dispositif IS DISTINCT FROM EXCLUDED.dispositif
          OR vote_amendments.expose_sommaire IS DISTINCT FROM EXCLUDED.expose_sommaire
        THEN NOW() ELSE vote_amendments.changed_at
    END
"""


def _normalize(text: str) -> str:
    """Lowercase without accents or non-breaking spaces, for name comparison."""
    decomposed = unicodedata.normalize("NFKD", html.unescape(text).replace("\xa0", " "))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower().strip()


def _text(value) -> str | None:
    """AN exports a null as a dict carrying xsi:nil, so only a str is a value."""
    return value if isinstance(value, str) and value.strip() else None


def clean_html(value) -> str | None:
    """Plain text from an export HTML fragment, capped at MAX_TEXT_CHARS."""
    raw = _text(value)
    if raw is None:
        return None
    spaced = re.sub(r"</p>|<br\s*/?>", " ", raw, flags=re.IGNORECASE)
    plain = html.unescape(TAG_RE.sub("", spaced)).replace("\xa0", " ")
    plain = re.sub(r"\s+", " ", plain).strip()
    return plain[:MAX_TEXT_CHARS] or None


def parse_title(title: str) -> tuple[str, str] | None:
    """(number, normalized first author) from a scrutin title, None if unparsable."""
    match = TITLE_RE.match(title.replace("’", "'"))
    if not match:
        return None
    return match.group("number"), _normalize(match.group("author"))


def parse_amendment(doc: dict) -> dict | None:
    """The fields matching and summaries need, None for a non-séance amendment."""
    amendment = doc["amendement"]
    identification = amendment["identification"]
    if identification.get("prefixeOrganeExamen") != "AN":
        return None
    number = NUMBER_RE.match(identification.get("numeroLong") or "")
    if not number:
        return None
    cycle = amendment.get("cycleDeVie") or {}
    content = ((amendment.get("corps") or {}).get("contenuAuteur")) or {}
    signatories = _text((amendment.get("signataires") or {}).get("libelle")) or ""
    return {
        "uid": amendment["uid"],
        "number": number.group(1),
        # "M. Bloch,  Mme D'Intorni et M. Michelet" -> the first signatory.
        "author": _normalize(re.split(r",| et ", html.unescape(signatories))[0]),
        "deposited_on": (_text(cycle.get("dateDepot")) or "")[:10] or None,
        "decided_on": (_text(cycle.get("dateSort")) or "")[:10] or None,
        "is_sub_amendment": _text(amendment.get("amendementParentRef")) is not None,
        "dispositif": clean_html(content.get("dispositif")),
        "expose_sommaire": clean_html(content.get("exposeSommaire")),
    }


def match_amendment(number_author: tuple[str, str], voted_on: date, index: dict) -> dict | None:
    """The one amendment a vote is about, None when that is not certain.

    Numbers restart with every text, so a number alone is meaningless. The
    author narrows it, the dates exclude other readings, and a decided amendment
    beats an undated one, because the export leaves `dateSort` empty on most
    amendments that never reached a vote.
    """
    number, author = number_author
    candidates = []
    for amendment in index.get(number, []):
        if author not in amendment["author"]:
            continue
        deposited = amendment["deposited_on"]
        decided = amendment["decided_on"]
        if deposited and date.fromisoformat(deposited) > voted_on:
            continue
        if decided and abs((date.fromisoformat(decided) - voted_on).days) > MAX_SORT_DRIFT_DAYS:
            continue
        candidates.append(amendment)
    decided_only = [a for a in candidates if a["decided_on"]]
    pool = decided_only or candidates
    return pool[0] if len(pool) == 1 else None


def read_amendments(zip_path: str) -> tuple[dict, int, int]:
    """Séance amendments by number, with how many files were read and skipped."""
    index: dict = defaultdict(list)
    total = skipped = 0
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if not member.filename.endswith(".json") or "incorrect_data" in member.filename:
                continue
            total += 1
            try:
                parsed = parse_amendment(json.loads(archive.read(member)))
            except (KeyError, TypeError, AttributeError, ValueError) as exc:
                log.debug("Skipped %s: %s", member.filename, exc)
                skipped += 1
                continue
            if parsed:
                index[parsed["number"]].append(parsed)
    return index, total, skipped


def check_amendment_yield(total: int, skipped: int, with_text: int, window_votes: int) -> None:
    """Exit 1 on an upstream shape change (the MON-220 rule every parser follows)."""
    if total == 0:
        log.error("Amendments export held no JSON file - its layout has changed.")
        sys.exit(1)
    if skipped / total > SKIP_RATE_THRESHOLD:
        log.error("Skipped %d of %d amendments - the export shape has changed.", skipped, total)
        sys.exit(1)
    if window_votes >= MIN_VOTES_FOR_MATCH_RATE and with_text / window_votes < MIN_MATCH_RATE:
        log.error(
            "Only %d of %d amendment votes have official text - "
            "the title format or the export has changed.",
            with_text,
            window_votes,
        )
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Attach official amendment text to votes")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Match amendment votes on or after this date (YYYY-MM-DD).",
    )
    parser.add_argument("--zip-path", help="Use a local export instead of downloading it.")
    args = parser.parse_args()

    conn = connect_with_retry(os.environ["DATABASE_URL"])
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SQL_WINDOW_VOTES, (args.since,))
        window = [dict(row) for row in cur.fetchall()]
    pending = [vote for vote in window if not vote["has_text"]]
    log.info("%d amendment votes since %s, %d without text", len(window), args.since, len(pending))
    if not pending:
        conn.close()
        return

    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = args.zip_path
        if not zip_path:
            zip_path = os.path.join(tmp_dir, "Amendements.json.zip")
            with open(zip_path, "wb") as fh:
                fh.write(download_with_retry(f"{AN_BASE_URL}{AMENDMENTS_ZIP_PATH}", timeout=300))
        index, total, skipped = read_amendments(zip_path)

    rows = []
    for vote in pending:
        title = parse_title(vote["vote_title"])
        amendment = match_amendment(title, vote["voted_on"], index) if title else None
        if amendment is None or not amendment["dispositif"]:
            continue
        rows.append(
            {
                "vote_id": vote["vote_id"],
                "amendment_uid": amendment["uid"],
                "is_sub_amendment": amendment["is_sub_amendment"],
                "dispositif": amendment["dispositif"],
                "expose_sommaire": amendment["expose_sommaire"],
            }
        )

    with_text = len(window) - len(pending) + len(rows)
    check_amendment_yield(total, skipped, with_text, len(window))
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, SQL_UPSERT, rows, page_size=100)
    conn.commit()
    conn.close()
    log.info(
        "Done - matched %d of %d pending votes, %d of %d files parsed",
        len(rows),
        len(pending),
        total - skipped,
        total,
    )


if __name__ == "__main__":
    main()
