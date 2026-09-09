"""
Unit tests for the LLM intent classifier (rag/chain/llm_router.py).
Groq is mocked throughout — these test the safety envelope, not the model:
whitelist enforcement, failure fallback, and the notable-deputy yield.
"""

import inspect
import json
from unittest.mock import MagicMock, patch

from rag.chain.llm_router import classify_intent, detect_claim, llm_route


def _groq_response(intent: str | None) -> MagicMock:
    resp = MagicMock()
    if intent is None:
        resp.choices[0].message.tool_calls = None
    else:
        call = MagicMock()
        call.function.arguments = json.dumps({"intent": intent})
        resp.choices[0].message.tool_calls = [call]
    return resp


def _claim_response(answer: str | None) -> MagicMock:
    """detect_claim() reads plain content, not a tool call (see llm_router)."""
    resp = MagicMock()
    resp.choices[0].message.content = answer
    return resp


def test_valid_intent_passes_whitelist():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _groq_response("vote_latest")
        assert classify_intent("Quel scrutin a eu lieu en dernier ?") == "vote_latest"


def test_rag_verdict_returns_none():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _groq_response("rag")
        assert classify_intent("Que dit la loi sur la justice ?") is None


def test_invented_intent_rejected_by_whitelist():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _groq_response("drop_table_votes")
        assert classify_intent("n'importe quoi") is None


def test_api_failure_returns_none():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.side_effect = TimeoutError("groq down")
        assert classify_intent("Quel scrutin a eu lieu en dernier ?") is None


def test_no_tool_call_returns_none():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _groq_response(None)
        assert classify_intent("question") is None


def test_llm_route_yields_to_notable_deputy():
    # Must return None (→ RAG) without even calling Groq
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        result = llm_route("Quel est le dernier vote de Marine Le Pen ?")
        assert result is None
        mock_groq.chat.completions.create.assert_not_called()


def test_llm_route_hard_guards_result_filtered_latest():
    # Even if the classifier (wrongly) picks vote_latest for a
    # result-filtered recency question, the hard guard yields to RAG.
    with (
        patch("rag.chain.llm_router._mentions_notable_deputy", return_value=False),
        patch("rag.chain.llm_router.classify_intent", return_value="vote_latest"),
    ):
        assert llm_route("Quels sont les votes rejetés les plus récents ?") is None


def test_llm_route_yields_to_db_backed_notable():
    # Braun-Pivet is not in the static keyword map but is in the
    # DB-backed notable map — llm_route must still yield to RAG.
    with (
        patch(
            "rag.chain.retriever.get_notable_deputy_ids", return_value={"PA1": "Yaël Braun-Pivet"}
        ),
        patch("rag.chain.llm_router._groq_client") as mock_groq,
    ):
        assert llm_route("Quel est le taux de présence de Yaël Braun-Pivet ?") is None
        mock_groq.chat.completions.create.assert_not_called()


def test_llm_route_fails_open_to_rag_when_db_lookup_breaks():
    with patch(
        "rag.chain.retriever.get_notable_deputy_ids", side_effect=ConnectionError("db down")
    ):
        assert llm_route("Une question quelconque sans nom de député ?") is None


def test_verify_claim_intent_rejected_by_whitelist():
    # verify_claim is in the tool enum but not in SQL_QUERIES - it must
    # fall to RAG like any non-whitelisted intent (ADR-023).
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _groq_response("verify_claim")
        assert classify_intent("Le député Untel a voté contre le SMIC") is None


# ---------------------------------------------------------------------------
# detect_claim() - ADR-023 nudge
# ---------------------------------------------------------------------------


def test_detect_claim_prefilter_skips_non_claims_without_groq_call():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        assert detect_claim("Qui a le plus d'absences ?") is False
        mock_groq.chat.completions.create.assert_not_called()


def test_detect_claim_flags_assertion():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response("ASSERTION")
        claim = "Marine Le Pen a voté pour la censure du gouvernement Bayrou"
        assert detect_claim(claim) is True
        mock_groq.chat.completions.create.assert_called_once()


def test_detect_claim_flags_plural_abstention():
    # "se sont abstenus" (non-elided pronoun) must pass the prefilter -
    # group claims are in scope (PR #208 review).
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response("ASSERTION")
        assert detect_claim("Les députés RN se sont abstenus sur la motion") is True
        mock_groq.chat.completions.create.assert_called_once()


def test_detect_claim_rejects_interrogative_with_vote_verb():
    # "Comment X a-t-elle voté ?" passes the prefilter; the classifier
    # decides it is a question, not a claim.
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response("QUESTION")
        assert detect_claim("Comment Marine Le Pen a-t-elle voté sur la censure ?") is False
        mock_groq.chat.completions.create.assert_called_once()


def test_detect_claim_api_failure_degrades_to_false():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.side_effect = TimeoutError("groq down")
        assert detect_claim("Le député Untel a voté contre le SMIC") is False


def test_detect_claim_empty_content_degrades_to_false():
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response(None)
        assert detect_claim("Le député Untel a voté contre le SMIC") is False


def test_search_chain_never_imports_verify_chain():
    # ADR-023 rule 7: no code path from /search may invoke verify_claim().
    import rag.chain.llm_router as llm_router_mod
    import rag.chain.rag_chain as rag_chain_mod

    for mod in (llm_router_mod, rag_chain_mod):
        assert "chain.verify" not in inspect.getsource(mod)
        assert "chain import verify" not in inspect.getsource(mod)


def test_llm_route_tags_result_with_router_field():
    fake_answer = {
        "answer": "x",
        "question": "q",
        "chunks_retrieved": 0,
        "sources": [],
        "query_type": "vote_latest",
        "confidence": "high",
        "data_source": "SQL",
        "caveat": "c",
    }
    with (
        patch("rag.chain.llm_router._mentions_notable_deputy", return_value=False),
        patch("rag.chain.llm_router.classify_intent", return_value="vote_latest"),
        patch("rag.chain.llm_router.execute_intent", return_value=dict(fake_answer)),
    ):
        result = llm_route("Quel scrutin a eu lieu en dernier ?")
        assert result["router"] == "llm"
        assert result["data_source"] == "SQL"


# ---------------------------------------------------------------------------
# Reasoning-model call-shape guards (no network).
#
# gpt-oss models bill reasoning tokens against max_tokens *before* emitting any
# content or tool call. The original budgets (32/64, inherited from
# llama-3.1-8b-instant) were consumed entirely by reasoning, so Groq returned
# either an empty completion or tool_use_failed and both classifiers silently
# degraded to their "no answer" branch. These pin the settings that fix that,
# so a later "trim the token budget" change fails here instead of in prod.
# ---------------------------------------------------------------------------


def test_classifier_calls_pass_a_reasoning_budget():
    """Both classifier calls must send reasoning_effort and a real token budget."""
    from rag.chain.llm_router import _CLASSIFIER_MAX_TOKENS, _CLASSIFIER_REASONING_EFFORT

    assert _CLASSIFIER_REASONING_EFFORT == "low"
    # 150 was empirically enough for the summary path; classification needs far
    # less, but the floor guards against a regression to the old 32/64.
    assert _CLASSIFIER_MAX_TOKENS >= 256

    for fn, arg in (
        (classify_intent, "Quel scrutin a eu lieu en dernier ?"),
        (detect_claim, "Le député Untel a voté contre le SMIC"),
    ):
        with patch("rag.chain.llm_router._groq_client") as mock_groq:
            mock_groq.chat.completions.create.return_value = _claim_response("QUESTION")
            mock_groq.chat.completions.create.return_value.choices[0].message.tool_calls = None
            fn(arg)
            kwargs = mock_groq.chat.completions.create.call_args.kwargs
            assert kwargs["reasoning_effort"] == _CLASSIFIER_REASONING_EFFORT, fn.__name__
            assert kwargs["max_tokens"] == _CLASSIFIER_MAX_TOKENS, fn.__name__


def test_detect_claim_truncated_reply_degrades_to_false():
    """A reply cut off mid-word (finish_reason='length') must not read as a claim."""
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response("ASSER")
        assert detect_claim("Le député Untel a voté contre le SMIC") is False


def test_detect_claim_does_not_use_tool_calling():
    """
    Regression guard for the swap to gpt-oss-20b. The tool-call form made the
    model emit enum values as parameter names, which Groq rejects outright;
    claim detection is one bit and must stay a plain-text reply.
    """
    with patch("rag.chain.llm_router._groq_client") as mock_groq:
        mock_groq.chat.completions.create.return_value = _claim_response("ASSERTION")
        assert detect_claim("Le député Untel a voté contre le SMIC") is True
        kwargs = mock_groq.chat.completions.create.call_args.kwargs
        assert "tools" not in kwargs
        assert "tool_choice" not in kwargs
