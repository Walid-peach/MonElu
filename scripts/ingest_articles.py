"""
scripts/ingest_articles.py
Attach the official text of an article to the article scrutins it was voted in
(#642, ADR-044), so a vote summary says what that article does rather than what
the whole bill does.

A scrutin names its bill and article only in its title, so the bill comes from
that title and from the document list in the dossiers export. The article comes
from the HTML the AN publishes for that text. A vote with no certain match gets
no row and therefore no generated summary.

Usage:
    python scripts/ingest_articles.py
    python scripts/ingest_articles.py --since 2025-07-01
    python scripts/ingest_articles.py --zip-path /tmp/Dossiers_Legislatifs.json.zip
"""

import argparse
import html
import json
import logging
import os
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict
from datetime import date, timedelta
from io import BytesIO

import psycopg2.extras
from dotenv import load_dotenv

try:
    from scripts._http import connect_with_retry, download_with_retry
except ImportError:  # running as a plain file: python scripts/ingest_articles.py
    from _http import connect_with_retry, download_with_retry

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

AN_BASE_URL = os.getenv("AN_API_BASE_URL", "https://data.assemblee-nationale.fr")
DOSSIERS_ZIP_PATH = (
    "/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip"
)
TEXT_URL = "https://www.assemblee-nationale.fr/dyn/opendata/{uid}.html"

# Long articles run to pages; the prompt only reads the start.
MAX_TEXT_CHARS = 4000
# "(Supprimé)" or "(Conforme)" under a heading is not an article's text.
MIN_ARTICLE_CHARS = 60
# Below this many votes a window with no text proves nothing about the source.
MIN_VOTES_FOR_YIELD = 20

ARTICLE_SUFFIXES = (
    "bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies|undecies|duodecies"
    "|terdecies|quaterdecies|quindecies|sexdecies|septdecies|octodecies|novodecies|vicies"
)
ARTICLE_PATTERN = (
    r"(?P<number>(?i:premier|unique|liminaire)|\d+(?:er)?)"
    rf"(?:\s+(?P<suffix>(?i:{ARTICLE_SUFFIXES})))?"
    r"(?:\s+(?P<letters>[A-Z]{1,3}))?(?!\w)"
)
HEADING_RE = re.compile(rf"^(?i:article)\s+{ARTICLE_PATTERN}")
TITLE_RE = re.compile(
    rf"^l.article\s+{ARTICLE_PATTERN}"
    r"(?:\s+et\s+(?:rapport annex[ée]|annexe|[ÉE]tats?\s+[A-Z]))?\s*"
    r"(?:\([^)]*\)\s*)?"
    r"(?:de la|du|de l.)\s*(?P<bill>.+?)\s*(?:\([^()]*\)\s*)*\.?$",
    re.IGNORECASE,
)
# A text the Assemblée examines: as deposited or as its committee adopted it.
# BTA and TAP are what it adopted afterwards, so they say nothing of a rejection.
EXAMINED_TEXT_RE = re.compile(r"^(?:PION|PRJL|PNRE)ANR5L\d+B(?:TC)?\d")
PARAGRAPH_RE = re.compile(r'<p class="(assnat[\w-]+)"[^>]*>(.*?)</p>', re.DOTALL)
HEADING_CLASS = "assnat9ArticleNum"
BODY_CLASS = "assnatLoiTexte"
STRUCTURE_CLASS_RE = re.compile(r"assnat\d")
IMAGE_RE = re.compile(r"<img[^>]*>")
TAG_RE = re.compile(r"<[^>]+>")

SQL_PENDING_VOTES = """
SELECT v.vote_id, v.vote_title, v.voted_at::date AS voted_on,
       a.vote_id IS NOT NULL AS has_text
FROM votes v
LEFT JOIN vote_articles a ON a.vote_id = v.vote_id
WHERE v.scrutin_kind = 'article' AND v.voted_at >= %s
"""

SQL_UPSERT = """
INSERT INTO vote_articles (vote_id, text_uid, article_label, article_text)
VALUES (%(vote_id)s, %(text_uid)s, %(article_label)s, %(article_text)s)
ON CONFLICT (vote_id) DO UPDATE SET
    text_uid = EXCLUDED.text_uid,
    article_label = EXCLUDED.article_label,
    article_text = EXCLUDED.article_text,
    ingested_at = NOW(),
    changed_at = CASE
        WHEN vote_articles.article_text IS DISTINCT FROM EXCLUDED.article_text
        THEN NOW() ELSE vote_articles.changed_at
    END
"""


def _normalize(text: str) -> str:
    """Lowercase words without accents or punctuation, for title comparison."""
    decomposed = unicodedata.normalize("NFKD", html.unescape(text).replace("’", "'"))
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def article_key(match: re.Match) -> str:
    """One spelling for "article premier", "1er", and "1 er" in any heading."""
    number = match["number"].lower()
    number = "1" if number in ("premier", "1er") else number
    parts = [number, (match["suffix"] or "").lower(), match["letters"] or ""]
    return " ".join(part for part in parts if part)


def parse_title(title: str) -> tuple[str, str] | None:
    """(article key, normalized bill) from a scrutin title, None if unparsable."""
    match = TITLE_RE.match(title.replace("’", "'"))
    return (article_key(match), _normalize(match["bill"])) if match else None


def bill_key(denomination: str, title: str) -> str:
    """The bill as a scrutin names it.

    Budget documents repeat their kind inside the title: "projet de loi de
    finances de finances pour 2026" for what a scrutin calls "de finances pour 2026".
    """
    key = _normalize(title)
    denomination = _normalize(denomination)
    if not key.startswith(denomination):
        key = f"{denomination} {key}"
    return re.sub(r"\b(de finance\w*(?: de la securite sociale)?) \1\b", r"\1", key)


def parse_document(doc: dict) -> dict | None:
    """A text the Assemblée examined, None for any other document."""
    document = doc.get("document", doc)
    uid = document.get("uid") or ""
    if not EXAMINED_TEXT_RE.match(uid):
        return None
    chrono = (document.get("cycleDeVie") or {}).get("chrono") or {}
    published = chrono.get("datePublicationWeb") or chrono.get("datePublication")
    published = published or chrono.get("dateDepot")
    title = (document.get("titres") or {}).get("titrePrincipal")
    if not isinstance(published, str) or not isinstance(title, str):
        return None
    return {
        "uid": uid,
        "published_on": published[:10],
        "bill": bill_key(document.get("denominationStructurelle") or "", title),
    }


def read_texts(archive_bytes: bytes) -> dict[str, list[dict]]:
    """Examined texts by bill, newest first."""
    index: dict = defaultdict(list)
    with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
        for member in archive.infolist():
            if "/document/" not in member.filename or not member.filename.endswith(".json"):
                continue
            parsed = parse_document(json.loads(archive.read(member)))
            if parsed:
                index[parsed["bill"]].append(parsed)
    for texts in index.values():
        texts.sort(key=lambda t: (t["published_on"], t["uid"]), reverse=True)
    return index


def parse_articles(page: str) -> dict[str, dict]:
    """Each article of a bill's HTML by key. A joint heading ("Articles 1er et 2") has none."""
    articles: dict[str, dict] = {}
    current = None
    for css_class, body in PARAGRAPH_RE.findall(IMAGE_RE.sub("", page)):
        plain = re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", body)).replace("\xa0", " "))
        plain = plain.strip()
        if css_class == HEADING_CLASS:
            match = HEADING_RE.match(re.sub(r"\b1\s+er\b", "1er", plain))
            current = None
            if match:
                current = articles.setdefault(article_key(match), {"label": plain, "body": []})
        elif STRUCTURE_CLASS_RE.match(css_class):
            current = None
        elif css_class == BODY_CLASS and current is not None and plain:
            current["body"].append(plain)
    return articles


def find_article(
    article: str, bill: str, voted_on: date, index: dict, load_page
) -> tuple[str, str, str] | None:
    """(text uid, label, text) of the article as last examined before the vote.

    The newest text holding the heading wins even when it has no content: that
    means the article stood deleted there, and an older reading is not what was
    voted.
    """
    for text in index.get(bill, []):
        if date.fromisoformat(text["published_on"]) > voted_on:
            continue
        found = load_page(text["uid"]).get(article)
        if found is None:
            continue
        body = " ".join(found["body"])[:MAX_TEXT_CHARS]
        return (text["uid"], found["label"], body) if len(body) >= MIN_ARTICLE_CHARS else None
    return None


def check_article_yield(texts: int, with_text: int, window_votes: int) -> None:
    """Exit 1 on an upstream shape change (the MON-220 rule every parser follows).

    Not a ratio as for amendments: a budget bill has no article headings, so a
    window that is mostly budget votes is normal while no text at all is not.
    """
    if texts == 0:
        log.error("Dossiers export held no examined text - its layout has changed.")
        sys.exit(1)
    if window_votes >= MIN_VOTES_FOR_YIELD and with_text == 0:
        log.error("None of %d article votes has official text.", window_votes)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Attach official article text to votes")
    parser.add_argument(
        "--since",
        default=(date.today() - timedelta(days=365)).isoformat(),
        help="Match article votes on or after this date (YYYY-MM-DD).",
    )
    parser.add_argument("--zip-path", help="Use a local export instead of downloading it.")
    args = parser.parse_args()

    conn = connect_with_retry(os.environ["DATABASE_URL"])
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SQL_PENDING_VOTES, (args.since,))
        window = [dict(row) for row in cur.fetchall()]
    pending = [vote for vote in window if not vote["has_text"]]
    log.info("%d article votes since %s, %d without text", len(window), args.since, len(pending))
    if not pending:
        conn.close()
        return

    if args.zip_path:
        with open(args.zip_path, "rb") as fh:
            archive_bytes = fh.read()
    else:
        archive_bytes = download_with_retry(f"{AN_BASE_URL}{DOSSIERS_ZIP_PATH}", timeout=120)
    index = read_texts(archive_bytes)

    pages: dict[str, dict] = {}

    def load_page(uid: str) -> dict:
        if uid not in pages:
            try:
                page = download_with_retry(TEXT_URL.format(uid=uid), timeout=120)
                pages[uid] = parse_articles(page.decode("utf-8", errors="ignore"))
            except RuntimeError as exc:  # a text the AN has not published as HTML
                log.warning("No HTML for %s: %s", uid, exc)
                pages[uid] = {}
        return pages[uid]

    rows = []
    for vote in pending:
        title = parse_title(vote["vote_title"])
        found = find_article(*title, vote["voted_on"], index, load_page) if title else None
        if found:
            text_uid, label, text = found
            rows.append(
                {
                    "vote_id": vote["vote_id"],
                    "text_uid": text_uid,
                    "article_label": label,
                    "article_text": text,
                }
            )

    check_article_yield(len(index), len(window) - len(pending) + len(rows), len(window))
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, SQL_UPSERT, rows, page_size=100)
    conn.commit()
    conn.close()
    log.info("Done - matched %d of %d pending votes", len(rows), len(pending))


if __name__ == "__main__":
    main()
