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
    """Build (mock_openai_client, mock_pool) for use in retrieve() tests.

    Patches _openai_client (already created at import time, not the class),
    get_notable_deputy_ids (bypasses DB for notable-deputy lookup),
    and _get_retriever_pool (bypasses real connection pool creation).
    """
    embedding_resp = MagicMock()
    embedding_resp.data = [MagicMock()]
    embedding_resp.data[0].embedding = [0.0] * 1536

    mock_openai = MagicMock()
    mock_openai.embeddings.create.return_value = embedding_resp

    cursor = MagicMock()
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)
    # With get_notable_deputy_ids returning {} there is no pin query; only the
    # semantic fetchall runs (one call).
    cursor.fetchall.return_value = semantic_rows

    conn = MagicMock()
    conn.cursor.return_value = cursor

    pool = MagicMock()
    pool.getconn.return_value = conn

    return mock_openai, pool


def test_retrieve_returns_list_with_correct_keys():
    semantic_rows = [
        {
            "content": "Vote sur le PLF 2025.",
            "metadata": {"chunk_type": "vote"},
            "similarity": 0.88,
        }
    ]
    mock_openai, mock_pool = _make_retriever_mocks(semantic_rows)

    with (
        patch("rag.chain.retriever._openai_client", mock_openai),
        patch("rag.chain.retriever.get_notable_deputy_ids", return_value={}),
        patch("rag.chain.retriever._get_retriever_pool", return_value=mock_pool),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Quels votes ont été adoptés ?")

    assert isinstance(results, list)
    assert len(results) > 0
    for chunk in results:
        assert "content" in chunk
        assert "metadata" in chunk
        assert "similarity" in chunk
    # Embedding was requested exactly once
    mock_openai.embeddings.create.assert_called_once()


def test_retrieve_returns_empty_list_when_no_chunks():
    mock_openai, mock_pool = _make_retriever_mocks([])

    with (
        patch("rag.chain.retriever._openai_client", mock_openai),
        patch("rag.chain.retriever.get_notable_deputy_ids", return_value={}),
        patch("rag.chain.retriever._get_retriever_pool", return_value=mock_pool),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Question sans résultat")

    assert results == []
