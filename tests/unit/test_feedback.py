"""Unit tests for the chat feedback endpoint (MON-70)."""

from unittest.mock import patch

from api.routers.feedback import ChatFeedbackRequest


def test_chat_feedback_request_valid():
    req = ChatFeedbackRequest(
        vote="up", question="Qui a voté pour ?", answer="Réponse.", sources=[]
    )
    assert req.vote == "up"


def test_chat_feedback_request_rejects_bad_vote():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ChatFeedbackRequest(vote="maybe", question="Q", answer="A", sources=[])


def test_submit_chat_feedback_inserts_row(client, mock_cursor):
    resp = client.post(
        "/feedback/chat",
        json={"vote": "up", "question": "Q", "answer": "A", "sources": [{"content": "c"}]},
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    args, _ = mock_cursor.execute.call_args
    assert "INSERT INTO feedback" in args[0]


def test_submit_chat_feedback_db_error_returns_500(client):
    with patch("api.routers.feedback.get_conn", side_effect=RuntimeError("db down")):
        resp = client.post(
            "/feedback/chat",
            json={"vote": "down", "question": "Q", "answer": "A", "sources": []},
        )
    assert resp.status_code == 500
