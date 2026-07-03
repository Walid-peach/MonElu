"""
rag/chain/llm_router.py

Second-stage intent classification for questions the regex router
(sql_router.py) doesn't match. A small, fast Groq model picks one of
the *existing* whitelisted intents via function calling — the SQL
itself stays hard-coded and parameterized in sql_router.SQL_QUERIES,
so the zero-hallucination guarantee of the SQL path is preserved: the
LLM only ever selects which pre-written query to run, never writes SQL.

Any failure — API error, timeout, unknown intent, "rag" verdict —
returns None and the caller falls back to standard RAG retrieval.
"""

import json
import logging
import os

from dotenv import load_dotenv
from groq import Groq

from rag.chain.sql_router import (
    SQL_QUERIES,
    _has_notable_deputy,
    execute_intent,
)

load_dotenv()

log = logging.getLogger(__name__)

# Fast/cheap model — this is a classification call, not generation.
CLASSIFIER_MODEL = "llama-3.1-8b-instant"
_CLASSIFIER_TIMEOUT = 5.0

_groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=_CLASSIFIER_TIMEOUT)

# Human descriptions keep the tool schema self-documenting for the model.
INTENT_DESCRIPTIONS = {
    "deputy_total_count": "how many deputies are tracked (total / en exercice)",
    "deputy_count_by_party": "deputy count per parliamentary group / which group is largest",
    "deputy_by_department": "which deputies represent a département or circonscription",
    "deputy_top_presence": "ranking of deputies with the BEST presence/attendance rate",
    "deputy_bottom_presence": "ranking of deputies with the WORST presence/attendance rate",
    "deputy_top_abstention": "ranking of deputies with the most abstentions",
    "deputy_most_contre": "ranking of deputies who voted AGAINST most often",
    "deputy_most_pour": "ranking of deputies who voted FOR most often",
    "deputy_dissidents": "deputies who vote differently from their own group's majority",
    "party_abstention_rate": "abstention rate per parliamentary group",
    "party_presence_rate": "presence rate per group, incl. comparisons between groups",
    "party_position_totals": "per-group pour/contre/abstention totals, 'votes more for or against'",
    "party_alignment": "voting discipline/cohesion per group",
    "vote_total_count": "total number of votes analysed",
    "vote_result_count": "how many votes were adopted vs rejected overall",
    "vote_latest": "the most recent vote(s) in the chamber, no result filter",
    "vote_first": "the earliest recorded vote",
    "vote_top_participation": "votes with the highest turnout / most votants",
    "vote_closest": "the closest/tightest votes (smallest pour/contre margin)",
    "votes_by_period": "vote counts for a specific month/year or this week/month",
}

_TOOL = {
    "type": "function",
    "function": {
        "name": "route_question",
        "description": (
            "Classify a French question about the Assemblée Nationale into one "
            "of the predefined aggregate intents, or 'rag' if it is about a "
            "specific deputy, a specific vote/law, opinions, or anything not "
            "listed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": [*INTENT_DESCRIPTIONS.keys(), "rag"],
                    "description": "\n".join(f"- {k}: {v}" for k, v in INTENT_DESCRIPTIONS.items()),
                },
            },
            "required": ["intent"],
        },
    },
}

_SYSTEM = (
    "You classify French civic questions about the Assemblée Nationale. "
    "Pick the single best intent, or 'rag' when the question is about a "
    "specific deputy's record, a specific law or vote's content, requires "
    "text understanding, or matches no intent. When a question filters "
    "recent votes by result (adopté/rejeté), answer 'rag'. Always call "
    "the tool."
)


def classify_intent(question: str) -> str | None:
    """Return a whitelisted intent name, or None (→ RAG)."""
    try:
        response = _groq_client.chat.completions.create(
            model=CLASSIFIER_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": question},
            ],
            tools=[_TOOL],
            tool_choice={"type": "function", "function": {"name": "route_question"}},
            temperature=0.0,
            max_tokens=64,
        )
        calls = response.choices[0].message.tool_calls
        if not calls:
            return None
        intent = json.loads(calls[0].function.arguments).get("intent")
    except Exception as exc:
        log.warning("LLM router classification failed: %s", exc)
        return None

    # Whitelist enforcement — anything the model invents falls to RAG.
    if intent not in SQL_QUERIES:
        return None
    return intent


def llm_route(question: str) -> dict | None:
    """
    LLM-classified routing for questions the regex router missed.
    Same output contract as sql_router.route(); None → RAG fallback.
    """
    # Deputy-specific questions belong to RAG (notable-deputy pin) —
    # cheaper to check here than to rely on the classifier.
    if _has_notable_deputy(question):
        return None

    intent = classify_intent(question)
    if not intent:
        return None

    log.debug("LLM router intent=%s — bypassing RAG", intent)
    result = execute_intent(intent, question)
    if result is not None:
        result["data_source"] = "SQL"
        result["router"] = "llm"
    return result
