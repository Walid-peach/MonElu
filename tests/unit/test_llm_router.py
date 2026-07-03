"""
Unit tests for the LLM intent classifier (rag/chain/llm_router.py).
Groq is mocked throughout — these test the safety envelope, not the model:
whitelist enforcement, failure fallback, and the notable-deputy yield.
"""

import json
from unittest.mock import MagicMock, patch

from rag.chain.llm_router import classify_intent, llm_route


def _groq_response(intent: str | None) -> MagicMock:
    resp = MagicMock()
    if intent is None:
        resp.choices[0].message.tool_calls = None
    else:
        call = MagicMock()
        call.function.arguments = json.dumps({"intent": intent})
        resp.choices[0].message.tool_calls = [call]
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
        patch("rag.chain.llm_router.classify_intent", return_value="vote_latest"),
        patch("rag.chain.llm_router.execute_intent", return_value=dict(fake_answer)),
    ):
        result = llm_route("Quel scrutin a eu lieu en dernier ?")
        assert result["router"] == "llm"
        assert result["data_source"] == "SQL"
