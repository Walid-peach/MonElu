"""Smoke tests for the RAG chain — Groq and OpenAI are mocked."""

from unittest.mock import MagicMock, patch

import groq
import httpx
import pytest

from rag.chain.rag_chain import ask
from rag.chain.retriever import retrieve

_FAKE_CHUNKS = [
    {
        "content": "Jean Martin a voté pour le projet de loi de finances.",
        "metadata": {"chunk_type": "vote", "deputy_id": "PA1"},
        "similarity": 0.92,
    }
]


def _fake_groq_response(text: str) -> MagicMock:
    resp = MagicMock()
    resp.choices[0].message.content = text
    return resp


# ---------------------------------------------------------------------------
# ask()
# ---------------------------------------------------------------------------


def test_ask_returns_required_keys():
    with (
        patch("rag.chain.rag_chain.sql_route", return_value=None),
        patch("rag.chain.rag_chain.retrieve", return_value=_FAKE_CHUNKS),
        patch("rag.chain.rag_chain._groq_client") as mock_groq,
    ):
        mock_groq.chat.completions.create.return_value = _fake_groq_response("Réponse test.")
        result = ask("Quel est le bilan de Yaël Braun-Pivet ?")

    assert "answer" in result
    assert "sources" in result
    assert "chunks_retrieved" in result
    assert "question" in result
    assert result["chunks_retrieved"] == len(_FAKE_CHUNKS)
    assert result["answer"] == "Réponse test."


def test_ask_propagates_groq_timeout():
    timeout_exc = groq.APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))
    with (
        patch("rag.chain.rag_chain.retrieve", return_value=_FAKE_CHUNKS),
        patch("rag.chain.rag_chain._groq_client") as mock_groq,
    ):
        mock_groq.chat.completions.create.side_effect = timeout_exc
        with pytest.raises(groq.APITimeoutError):
            ask("Question quelconque ?")


# ---------------------------------------------------------------------------
# retrieve()
# ---------------------------------------------------------------------------


def _make_retriever_mocks(semantic_rows: list[dict]):
    """Build (mock_openai_client, mock_psycopg2_conn) for use in retrieve() tests."""
    embedding_resp = MagicMock()
    embedding_resp.data = [MagicMock()]
    embedding_resp.data[0].embedding = [0.0] * 1536

    mock_openai = MagicMock()
    mock_openai.embeddings.create.return_value = embedding_resp

    cursor = MagicMock()
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)
    # First fetchall: notable-deputy pinned chunk (empty) — second: semantic results
    cursor.fetchall.side_effect = [[], semantic_rows]

    conn = MagicMock()
    conn.cursor.return_value = cursor

    return mock_openai, conn


def test_retrieve_returns_list_with_correct_keys():
    semantic_rows = [
        {
            "content": "Vote sur le PLF 2025.",
            "metadata": {"chunk_type": "vote"},
            "similarity": 0.88,
        }
    ]
    mock_openai, mock_conn = _make_retriever_mocks(semantic_rows)
    cursor = mock_conn.cursor.return_value

    with (
        patch("rag.chain.retriever.OpenAI", return_value=mock_openai),
        patch("rag.chain.retriever.psycopg2.connect", return_value=mock_conn),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Quels votes ont été adoptés ?")

    assert isinstance(results, list)
    for chunk in results:
        assert "content" in chunk
        assert "metadata" in chunk
        assert "similarity" in chunk
    # Pin query runs first (fetchall called twice: once for pin, once for semantic)
    assert cursor.fetchall.call_count == 2


def test_retrieve_returns_empty_list_when_no_chunks():
    mock_openai, mock_conn = _make_retriever_mocks([])
    # Both fetchall calls return empty
    mock_conn.cursor.return_value.fetchall.side_effect = [[], []]

    with (
        patch("rag.chain.retriever.OpenAI", return_value=mock_openai),
        patch("rag.chain.retriever.psycopg2.connect", return_value=mock_conn),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Question sans résultat")

    assert results == []
