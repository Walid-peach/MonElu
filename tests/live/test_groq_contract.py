"""
Live contract tests against the Groq API.

These exist because of the 2026-09 outage: Groq decommissioned
``llama-3.3-70b-versatile`` and ``llama-3.1-8b-instant``, and every LLM surface
in the app (/search, /verify, the nightly summary backfill) started returning
500s. Nothing caught it, because:

  * the unit tests mock the Groq client, so they assert how the code handles a
    well-formed response - never that the model actually produces one;
  * ``/health`` reports ``groq: ok`` from the *presence* of an API key string,
    without ever calling the API, so production looked green throughout.

So this suite deliberately does the one thing the rest of the test tree does
not: it spends real tokens against the real API. It is skipped unless
``GROQ_API_KEY`` is set and ``--run-live`` is passed, and it is not part of the
PR gate - run it on a schedule and after any model change.

    pytest tests/live -m live --run-live

Every assertion here corresponds to a way the swap to gpt-oss actually broke:
model existence, reasoning tokens eating ``max_tokens``, and schema adherence
on the classifier calls.
"""

import json
import os

import pytest
from groq import Groq

from rag.chain.llm_router import CLASSIFIER_MODEL
from rag.constants import LLM_MAX_TOKENS, LLM_MODEL

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not os.getenv("GROQ_API_KEY"), reason="live Groq test requires GROQ_API_KEY"
    ),
]


@pytest.fixture(scope="module")
def client() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"], timeout=60.0)


@pytest.fixture(scope="module")
def catalog(client: Groq) -> set[str]:
    return {m.id for m in client.models.list().data}


# ---------------------------------------------------------------------------
# Model existence - the check that would have caught the outage directly.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("model", [LLM_MODEL, CLASSIFIER_MODEL])
def test_configured_model_still_exists(model: str, catalog: set[str]):
    assert model in catalog, (
        f"{model} is no longer served by Groq. Available chat models: "
        f"{sorted(m for m in catalog if 'whisper' not in m and 'guard' not in m)}"
    )


# ---------------------------------------------------------------------------
# Call shapes. Each mirrors a real call site, including its token budget, so a
# budget too small for the model's reasoning tokens fails here.
# ---------------------------------------------------------------------------


def test_router_tool_call_returns_a_whitelisted_intent(client: Groq):
    """classify_intent()'s shape: forced tool call, small token budget."""
    from rag.chain.llm_router import (
        _CLASSIFIER_MAX_TOKENS,
        _CLASSIFIER_REASONING_EFFORT,
        _SYSTEM,
        _TOOL,
        SQL_QUERIES,
    )

    resp = client.chat.completions.create(
        model=CLASSIFIER_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": "Combien de députés siègent à l'Assemblée ?"},
        ],
        tools=[_TOOL],
        tool_choice={"type": "function", "function": {"name": "route_question"}},
        temperature=0.0,
        max_tokens=_CLASSIFIER_MAX_TOKENS,
        reasoning_effort=_CLASSIFIER_REASONING_EFFORT,
    )
    calls = resp.choices[0].message.tool_calls
    assert calls, "model returned no tool call - reasoning tokens likely ate max_tokens"
    args = json.loads(calls[0].function.arguments)
    assert "intent" in args, f"expected an 'intent' key, got {args}"
    assert args["intent"] in set(SQL_QUERIES) | {"rag"}


# The tool-call form of this classifier scored 2/4 on these same inputs, so the
# plain-text form below is the contract. See llm_router._CLAIM_SYSTEM.
CLAIM_FIXTURES = [
    ("Gabriel Attal a voté pour la réforme des retraites.", True),
    ("Le député Jean-Luc Mélenchon a voté contre le budget.", True),
    ("Marine Le Pen s'est abstenue sur le budget 2026.", True),
    ("Les députés RN ont voté contre la loi immigration.", True),
    ("Comment Gabriel Attal a-t-il voté sur les retraites ?", False),
    ("Est-ce que Marine Le Pen a voté pour le budget ?", False),
    ("Qui a voté contre la loi de finances ?", False),
    ("Quel député a le plus voté contre le gouvernement ?", False),
]


@pytest.mark.parametrize("text,is_claim", CLAIM_FIXTURES)
def test_detect_claim_matches_fixture(text: str, is_claim: bool):
    """The real detect_claim(), against the real model - no mock."""
    from rag.chain.llm_router import detect_claim

    assert detect_claim(text) is is_claim


def test_verify_json_mode_returns_parseable_json(client: Groq):
    """verify_claim()'s shape: response_format=json_object at 1024 tokens."""
    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Tu vérifies des affirmations sur les votes de l'Assemblée "
                    "nationale. Réponds UNIQUEMENT en JSON avec les clés verdict "
                    "(vrai|faux|trompeur|inverifiable), explication, vote_ids."
                ),
            },
            {
                "role": "user",
                "content": "Affirmation: X a voté pour Y. Aucun scrutin correspondant.",
            },
        ],
        temperature=0.0,
        max_tokens=LLM_MAX_TOKENS,
        response_format={"type": "json_object"},
    )
    choice = resp.choices[0]
    assert choice.finish_reason != "length", (
        f"{LLM_MAX_TOKENS} tokens was not enough for JSON + reasoning"
    )
    parsed = json.loads(choice.message.content)
    assert "verdict" in parsed


def test_summary_fits_its_token_budget():
    """
    generate_vote_summaries.py's shape. At default reasoning effort the 150-token
    budget was fully consumed by reasoning and the summary came back as
    'Le Parlement a' with finish_reason='length'.
    """
    from scripts.generate_vote_summaries import MAX_TOKENS, MODEL, REASONING_EFFORT, TEMPERATURE

    resp = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=60.0).chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "Résume en français simple, 2 phrases maximum."},
            {
                "role": "user",
                "content": (
                    "Scrutin sur la proposition de loi visant à réformer le "
                    "financement des collectivités territoriales. Adopté par "
                    "289 voix contre 241."
                ),
            },
        ],
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        reasoning_effort=REASONING_EFFORT,
    )
    choice = resp.choices[0]
    assert choice.finish_reason != "length", (
        f"summary truncated at MAX_TOKENS={MAX_TOKENS}: "
        f"{choice.message.content!r} - reasoning tokens are eating the budget"
    )
    content = (choice.message.content or "").strip()
    assert len(content) > 40, f"summary implausibly short: {content!r}"


# The short synthetic fixtures above under-represent production: verify formats
# up to 5 retrieved chunks into the prompt, and a harder claim buys more
# reasoning. These use a realistic context so LLM_MAX_TOKENS is exercised
# against something close to what the endpoint actually sends.

_CANDIDATE_CHUNKS = "\n\n".join(
    f"Scrutin {1200 + i} du 2026-0{i + 1}-15 - Titre: Projet de loi de finances "
    f"rectificative pour 2026, article {i + 3}, relatif au financement des "
    f"collectivités territoriales et à la répartition de la dotation globale de "
    f"fonctionnement. Résultat: {'adopté' if i % 2 else 'rejeté'}. "
    f"Pour: {289 - i * 7}, Contre: {241 + i * 5}, Abstentions: {12 + i}. "
    f"Position de Gabriel Attal: {'pour' if i % 2 else 'contre'}."
    for i in range(5)
)


def test_verify_survives_a_realistic_context(client: Groq):
    """
    A truncated verify body fails _parse_llm_verdict and is forced to
    "inverifiable" - a plausible-looking wrong verdict rather than an error - so
    running out of budget here is silent in production. This is the regression
    test for that.
    """
    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Tu vérifies des affirmations sur les votes de l'Assemblée "
                    "nationale. Analyse chaque scrutin candidat, puis réponds "
                    "UNIQUEMENT en JSON avec les clés verdict "
                    "(vrai|faux|trompeur|inverifiable), explication (2-4 phrases, "
                    "en français), vote_ids (liste des scrutins cités)."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Affirmation: Gabriel Attal a systématiquement voté pour le "
                    f"budget 2026.\n\nScrutins candidats:\n{_CANDIDATE_CHUNKS}"
                ),
            },
        ],
        temperature=0.0,
        max_tokens=LLM_MAX_TOKENS,
        response_format={"type": "json_object"},
    )
    choice = resp.choices[0]
    assert choice.finish_reason != "length", (
        f"verify truncated at LLM_MAX_TOKENS={LLM_MAX_TOKENS} on a 5-chunk "
        f"context; _parse_llm_verdict would force 'inverifiable'"
    )
    assert "verdict" in json.loads(choice.message.content)


def test_rag_answer_survives_a_realistic_context(client: Groq):
    """ask()'s shape at production context size - a truncated answer is user-visible."""
    resp = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Tu réponds en français clair sur les votes de l'Assemblée "
                    "nationale, en te basant uniquement sur le contexte fourni. "
                    "Termine par une ligne 'Confiance: haute|moyenne|faible'."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Contexte:\n{_CANDIDATE_CHUNKS}\n\nQuestion: Quels votes sur "
                    "le budget ont eu lieu, comment Gabriel Attal s'est-il "
                    "positionné, et quel en a été le résultat ?"
                ),
            },
        ],
        temperature=0.2,
        max_tokens=LLM_MAX_TOKENS,
    )
    choice = resp.choices[0]
    assert choice.finish_reason != "length", (
        f"RAG answer truncated at LLM_MAX_TOKENS={LLM_MAX_TOKENS}"
    )
    # extract_confidence() parses this trailer; a truncated answer loses it.
    assert "Confiance" in (choice.message.content or "")
