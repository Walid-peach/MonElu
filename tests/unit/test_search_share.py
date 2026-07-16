"""Unit tests for the chat share endpoints (MON-66, ADR-024)."""

import datetime
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from api.routers.search import ShareRequest


def test_share_request_valid():
    req = ShareRequest(question="Qui a voté pour ?", answer="Réponse.", sources=[])
    assert req.question == "Qui a voté pour ?"
    assert req.confidence is None


def test_share_request_rejects_too_many_sources():
    with pytest.raises(ValidationError):
        ShareRequest(question="Q", answer="A", sources=[{}] * 21)


def test_share_request_rejects_empty_answer():
    with pytest.raises(ValidationError):
        ShareRequest(question="Q", answer="", sources=[])


def test_share_answer_inserts_row_and_returns_share_url(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "id": "11111111-1111-1111-1111-111111111111",
        "question": "Q",
        "answer": "A",
        "sources": [{"content": "c", "metadata": {}, "similarity": 0.9}],
        "confidence": "medium",
        "data_source": "RAG",
        "caveat": None,
        "created_at": datetime.datetime(2026, 7, 17, tzinfo=datetime.timezone.utc),
    }
    resp = client.post(
        "/search/share",
        json={
            "question": "Q",
            "answer": "A",
            "sources": [{"content": "c", "metadata": {}, "similarity": 0.9}],
            "confidence": "medium",
            "data_source": "RAG",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "11111111-1111-1111-1111-111111111111"
    assert body["share_url"].endswith("/chat/s/11111111-1111-1111-1111-111111111111")
    args, _ = mock_cursor.execute.call_args
    assert "INSERT INTO chat_shares" in args[0]


def test_share_answer_db_error_returns_500(client):
    with patch("api.routers.search.get_conn", side_effect=RuntimeError("db down")):
        resp = client.post(
            "/search/share",
            json={"question": "Q", "answer": "A", "sources": []},
        )
    assert resp.status_code == 500


def test_get_share_returns_stored_snapshot(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "id": "11111111-1111-1111-1111-111111111111",
        "question": "Q",
        "answer": "A",
        "sources": [],
        "confidence": "medium",
        "data_source": "RAG",
        "caveat": None,
        "created_at": datetime.datetime(2026, 7, 17, tzinfo=datetime.timezone.utc),
    }
    resp = client.get("/search/share/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 200
    assert resp.json()["question"] == "Q"


def test_get_share_returns_404_when_missing(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/search/share/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 404


def test_get_share_rejects_invalid_uuid(client):
    resp = client.get("/search/share/not-a-uuid")
    assert resp.status_code == 422
