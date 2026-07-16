"""Unit tests for the feedback endpoints (MON-70 chat, MON-101 error reports)."""

from unittest.mock import patch

from api.routers.feedback import ChatFeedbackRequest, ErrorReportRequest


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


def test_chat_feedback_request_rejects_too_many_sources():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ChatFeedbackRequest(vote="up", question="Q", answer="A", sources=[{}] * 11)


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


def test_error_report_request_valid():
    req = ErrorReportRequest(
        entity_type="deputy",
        entity_id="PA722990",
        entity_label="Jean Dupont",
        page_url="/deputes/PA722990",
        message="Le taux de présence semble erroné.",
    )
    assert req.entity_type == "deputy"
    assert req.email is None


def test_error_report_request_rejects_bad_entity_type():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ErrorReportRequest(entity_type="party", message="M")


def test_error_report_request_rejects_empty_message():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ErrorReportRequest(entity_type="vote", message="")


def test_submit_error_report_inserts_row(client, mock_cursor):
    resp = client.post(
        "/feedback/report",
        json={
            "entity_type": "vote",
            "entity_id": "VTANR5L17V100",
            "entity_label": "Projet de loi de finances",
            "page_url": "/votes/VTANR5L17V100",
            "message": "Le résultat affiché ne correspond pas au scrutin officiel.",
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    args, _ = mock_cursor.execute.call_args
    assert "INSERT INTO feedback" in args[0]
    assert args[1][0] == "report"


def test_submit_error_report_db_error_returns_500(client):
    with patch("api.routers.feedback.get_conn", side_effect=RuntimeError("db down")):
        resp = client.post(
            "/feedback/report",
            json={"entity_type": "page", "message": "Erreur sur cette page."},
        )
    assert resp.status_code == 500
