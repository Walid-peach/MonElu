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


def call_groq(client, system: str, user: str, max_retries: int = 6) -> str | None:
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
                max_tokens=MAX_TOKENS,
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
