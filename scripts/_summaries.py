"""
scripts/_summaries.py
Shared plain-French summarization helpers for the Groq-backed generators.

Extracted from scripts/generate_vote_summaries.py when agenda items gained
summaries too (MON-211, ADR-030 §5). Both generators call the same model with
the same prompts, the same theme vocabulary and the same retry/parse logic, so
these live in one module rather than being copy-pasted per script - the rule
SKIP_RATE_THRESHOLD already follows in scripts/_http.py.

Nothing here is agenda- or vote-specific: callers build their own user message
and own their SQL.
"""

from __future__ import annotations

import json
import logging
import re
import time

log = logging.getLogger(__name__)

BATCH_SIZE = 5
MODEL = "openai/gpt-oss-120b"
TEMPERATURE = 0.1
MAX_TOKENS = 150
# A prompt carrying official text takes more of the budget for reasoning: at 150
# about one amendment reply in seven was cut before its JSON closed (#630).
OFFICIAL_TEXT_MAX_TOKENS = 400
# gpt-oss is a reasoning model and reasoning tokens count against MAX_TOKENS.
# At default effort a 150-token budget was fully consumed by reasoning and the
# summary came back truncated mid-sentence ("Le Parlement a"). "low" lands at
# ~70 tokens for a two-sentence summary, well inside the budget.
REASONING_EFFORT = "low"

VALID_THEMES = {
    "Économie & Budget",
    "Santé & Social",
    "Justice & Sécurité",
    "Énergie & Environnement",
    "Éducation & Culture",
    "Agriculture",
    "Transport & Logement",
    "Institutions",
    "International",
    "Autre",
}

PROCEDURAL_PATTERNS = re.compile(
    r"motion de rejet pr[ée]alable"
    r"|question pr[ée]alable"
    r"|motion de renvoi en commission"
    r"|motion r[ée]f[ée]rendaire"
    r"|motion de censure"
    r"|exception d.irrecevabilit[ée]",
    re.IGNORECASE,
)

PADDED_OPENING_PATTERN = re.compile(r"^\s*le texte porte sur\b", re.IGNORECASE)


# The model answers this when the official text is not enough, as its prompt asks.
DECLINED_PATTERN = re.compile(r'"summary"\s*:\s*""')


def is_procedural(title: str) -> bool:
    return bool(PROCEDURAL_PATTERNS.search(title))


def detect_motion_type(title: str) -> str:
    """Return a human-readable motion label for the procedural prompt."""
    lower = title.lower()
    if "motion de rejet" in lower:
        return "motion de rejet préalable"
    if "question préalable" in lower or "question prealable" in lower:
        return "question préalable"
    if "renvoi en commission" in lower:
        return "motion de renvoi en commission"
    if "motion référendaire" in lower or "motion referendaire" in lower:
        return "motion référendaire"
    if "motion de censure" in lower:
        return "motion de censure"
    if "exception d'irrecevabilité" in lower or "exception dirrecevabilite" in lower:
        return "exception d'irrecevabilité"
    return "motion procédurale"


# What goes to the model, cut so one long budget amendment cannot use up a call.
# The dispositif comes first: it is what the vote changes.
MAX_DISPOSITIF_CHARS = 1500
MAX_EXPOSE_CHARS = 800
MAX_ARTICLE_CHARS = 2500

# Wording that means the model is guessing at content it was not given (#630, #633).
GUESS_PATTERNS = re.compile(
    r"probablement|vraisemblablement|sans doute|certaines dispositions|notamment en\b"
    r"|semble viser|pourrait viser",
    re.IGNORECASE,
)
# A partial vote is never "the text": a reader takes that for the whole bill.
TEXT_SUBJECT_PATTERN = re.compile(
    r"^\s*(?:le|ce) texte\b"
    r"|^\s*(?:la|cette) proposition de (?:loi|r[ée]solution)\b"
    r"|^\s*(?:le|ce) projet de loi\b",
    re.IGNORECASE,
)
# "Supprimer les alinéas 31 à 35" is true and tells a reader nothing.
BARE_REFERENCE_PATTERN = re.compile(r"\balin[ée]as?\s+\d", re.IGNORECASE)
TOKEN_PATTERN = re.compile(r"[^\W\d_]{4,}", re.UNICODE)
# Share of a summary's words already in the title that makes it a restatement.
RESTATED_TITLE_RATIO = 0.8


def amendment_user_message(vote: dict) -> str:
    """The official text a summary is written from, dispositif first."""
    kind = "Sous-amendement" if vote["is_sub_amendment"] else "Amendement"
    message = f"Type : {kind}\nDispositif : {vote['dispositif'][:MAX_DISPOSITIF_CHARS]}"
    expose = vote.get("expose_sommaire")
    if expose:
        message += f"\nExposé de l'auteur : {expose[:MAX_EXPOSE_CHARS]}"
    return message


def article_user_message(vote: dict) -> str:
    """The official text of the article voted, under its own heading."""
    return f"{vote['article_label']}\n{vote['article_text'][:MAX_ARTICLE_CHARS]}"


def restates_title(summary: str, title: str) -> bool:
    """True when nearly every word of the summary is already in the title."""
    words = {w.lower() for w in TOKEN_PATTERN.findall(summary)}
    if not words:
        return True
    title_words = {w.lower() for w in TOKEN_PATTERN.findall(title)}
    return len(words & title_words) / len(words) >= RESTATED_TITLE_RATIO


def rejection_reason(summary: str, title: str) -> str | None:
    """Why a generated amendment or article summary must not be stored, None when it may."""
    if not summary:
        return "declined"
    if GUESS_PATTERNS.search(summary):
        return "guess"
    if TEXT_SUBJECT_PATTERN.search(summary):
        return "text_subject"
    if BARE_REFERENCE_PATTERN.search(summary):
        return "bare_reference"
    if restates_title(summary, title):
        return "restates_title"
    return None


def agenda_rejection_reason(summary: str) -> str | None:
    """Why a generated agenda line must not be stored, None when it may."""
    if GUESS_PATTERNS.search(summary):
        return "guess"
    if PADDED_OPENING_PATTERN.search(summary):
        return "padded_opening"
    return None


def call_groq(
    client, system: str, user: str, max_retries: int = 6, max_tokens: int = MAX_TOKENS
) -> str | None:
    """Call Groq with exponential backoff on 429. SDK retries are disabled (max_retries=0
    on the client) so this is the sole retry controller."""
    for attempt in range(max_retries):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=TEMPERATURE,
                max_tokens=max_tokens,
                reasoning_effort=REASONING_EFFORT,
            )
            return resp.choices[0].message.content.strip()
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status == 429 and attempt < max_retries - 1:
                wait = min(2**attempt, 60)
                log.warning(
                    "Rate limited — retrying in %ds (attempt %d/%d)", wait, attempt + 1, max_retries
                )
                time.sleep(wait)
            else:
                log.warning("Groq error: %s", exc)
                return None
    return None


def parse_response(raw: str) -> tuple[str, str] | None:
    """Parse JSON response from Groq. Returns (summary, theme) or None on failure."""
    try:
        # Extract JSON object even if surrounded by markdown fences
        match = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
        if not match:
            return None
        parsed = json.loads(match.group())
        summary = parsed.get("summary", "").strip()
        theme = parsed.get("theme", "").strip()
        if not summary or not theme:
            return None
        if theme not in VALID_THEMES:
            log.warning("Invalid theme %r — remapping to 'Autre'", theme)
            theme = "Autre"
        return summary, theme
    except (json.JSONDecodeError, AttributeError):
        return None
