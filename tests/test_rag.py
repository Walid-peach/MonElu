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
        patch("rag.chain.rag_chain.llm_route", return_value=None),
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
        patch("rag.chain.rag_chain.sql_route", return_value=None),
        patch("rag.chain.rag_chain.llm_route", return_value=None),
        patch("rag.chain.rag_chain.retrieve", return_value=_FAKE_CHUNKS),
        patch("rag.chain.rag_chain._groq_client") as mock_groq,
    ):
        mock_groq.chat.completions.create.side_effect = timeout_exc
        with pytest.raises(groq.APITimeoutError):
            ask("Question quelconque ?")


def test_ask_stage_ordering():
    """sql_route wins over llm_route; llm_route wins over retrieval."""
    sql_answer = {"answer": "sql", "data_source": "SQL"}
    llm_answer = {"answer": "llm", "data_source": "SQL", "router": "llm"}

    with (
        patch("rag.chain.rag_chain.sql_route", return_value=sql_answer),
        patch("rag.chain.rag_chain.llm_route", return_value=llm_answer) as m_llm,
        patch("rag.chain.rag_chain.retrieve") as m_retrieve,
    ):
        assert ask("q")["answer"] == "sql"
        m_llm.assert_not_called()
        m_retrieve.assert_not_called()

    with (
        patch("rag.chain.rag_chain.sql_route", return_value=None),
        patch("rag.chain.rag_chain.llm_route", return_value=llm_answer),
        patch("rag.chain.rag_chain.retrieve") as m_retrieve,
    ):
        assert ask("q")["answer"] == "llm"
        m_retrieve.assert_not_called()


def test_ask_flags_claim_shaped_input():
    """RAG-path answers carry suggested_action='verify' when detect_claim fires (ADR-023)."""
    with (
        patch("rag.chain.rag_chain.sql_route", return_value=None),
        patch("rag.chain.rag_chain.llm_route", return_value=None),
        patch("rag.chain.rag_chain.detect_claim", return_value=True),
        patch("rag.chain.rag_chain.retrieve", return_value=_FAKE_CHUNKS),
        patch("rag.chain.rag_chain._groq_client") as mock_groq,
    ):
        mock_groq.chat.completions.create.return_value = _fake_groq_response("Réponse test.")
        result = ask("Marine Le Pen a voté pour la censure du gouvernement Bayrou")

    assert result["suggested_action"] == "verify"
    # The flag annotates a normal RAG answer - nothing else changes.
    assert result["answer"] == "Réponse test."
    assert result["data_source"] == "RAG"


def test_ask_suggested_action_defaults_to_none():
    with (
        patch("rag.chain.rag_chain.sql_route", return_value=None),
        patch("rag.chain.rag_chain.llm_route", return_value=None),
        patch("rag.chain.rag_chain.detect_claim", return_value=False),
        patch("rag.chain.rag_chain.retrieve", return_value=_FAKE_CHUNKS),
        patch("rag.chain.rag_chain._groq_client") as mock_groq,
    ):
        mock_groq.chat.completions.create.return_value = _fake_groq_response("Réponse test.")
        result = ask("Qui a le plus d'absences ?")

    assert result["suggested_action"] is None


# ---------------------------------------------------------------------------
# retrieve()
# ---------------------------------------------------------------------------


def _make_retriever_mocks(semantic_rows: list[dict]):
    """Build (mock_openai_client, mock_pool) for use in retrieve() tests.

    Patches _openai_client (already created at import time, not the class)
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
        patch("rag.chain.retriever._get_retriever_pool", return_value=mock_pool),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Question sans résultat")

    assert results == []


def test_retrieve_runs_single_semantic_query_no_pin():
    """MON-76: the notable-deputy pin (a second, separate query that forced a
    notable_deputy chunk to the front) was removed — exact cosine scan has
    perfect recall at this corpus size (see decision 5 in docs/decisions.md).
    retrieve() must issue exactly one SELECT against document_chunks."""
    semantic_rows = [
        {
            "content": "Yaël Braun-Pivet est député(e) des Yvelines.",
            "metadata": {"chunk_type": "deputy", "deputy_id": "PA1"},
            "similarity": 0.65,
        }
    ]
    mock_openai, mock_pool = _make_retriever_mocks(semantic_rows)
    cursor = mock_pool.getconn.return_value.cursor.return_value

    with (
        patch("rag.chain.retriever._openai_client", mock_openai),
        patch("rag.chain.retriever._get_retriever_pool", return_value=mock_pool),
        patch("rag.chain.retriever.register_vector"),
    ):
        results = retrieve("Quel est le taux de présence de Yaël Braun-Pivet ?")

    assert cursor.execute.call_count == 1
    assert results[0]["metadata"]["chunk_type"] == "deputy"
