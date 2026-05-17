"""Smoke tests for API routers — no real DB required."""

from unittest.mock import patch

import groq
import httpx

import api.db as _db

_DEPUTY_SUMMARY = {
    "deputy_id": "PA1",
    "full_name": "Jean Martin",
    "party": "Rassemblement National",
    "party_short": "RN",
    "department": "Paris",
    "circonscription": "1ère circonscription",
    "photo_url": None,
}

_DEPUTY_DETAIL = {
    **_DEPUTY_SUMMARY,
    "first_name": "Jean",
    "last_name": "Martin",
    "mandate_start": None,
    "mandate_end": None,
    "ingested_at": None,
}

_VOTE_SUMMARY = {
    "vote_id": "VTANR5L17V1",
    "voted_at": "2024-07-16T15:00:00",
    "vote_title": "Vote sur le projet de loi de finances",
    "result": "adopté",
    "votes_for": 289,
    "votes_against": 250,
    "abstentions": 10,
    "total_voters": 539,
}

_VOTE_DETAIL = {
    **_VOTE_SUMMARY,
    "vote_type": None,
    "dossier_id": None,
    "ingested_at": None,
}

_POSITION = {
    "position_id": 1,
    "deputy_id": "PA1",
    "full_name": "Jean Martin",
    "party_short": "RN",
    "position": "pour",
}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def test_health_ok(client, mock_cursor):
    mock_cursor.fetchone.side_effect = [{"count": 577}, {"count": 821}, {"count": 289_411}]
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["deputies"] == 577
    assert data["votes"] == 821
    assert data["positions"] == 289_411


def test_health_db_unavailable(client):
    with patch.object(_db, "_pool", None):
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "degraded"


# ---------------------------------------------------------------------------
# Deputies
# ---------------------------------------------------------------------------


def test_list_deputies(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [_DEPUTY_SUMMARY]
    resp = client.get("/deputies/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["full_name"] == "Jean Martin"


def test_search_deputies(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [_DEPUTY_SUMMARY]
    resp = client.get("/deputies/?search=Martin")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_get_deputy_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = _DEPUTY_DETAIL
    resp = client.get("/deputies/PA1")
    assert resp.status_code == 200
    assert resp.json()["deputy_id"] == "PA1"


def test_get_deputy_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/deputies/NONEXISTENT")
    assert resp.status_code == 404


def test_get_scorecard(client, mock_cursor):
    mock_cursor.fetchone.side_effect = [
        {"deputy_id": "PA1", "full_name": "Jean Martin"},
        {
            "total_votes": 100,
            "present_votes": 90,
            "votes_for": 60,
            "votes_against": 20,
            "abstentions": 10,
        },
    ]
    resp = client.get("/deputies/PA1/scorecard")
    assert resp.status_code == 200
    data = resp.json()
    assert 0.0 <= data["presence_rate"] <= 1.0
    assert data["total_votes"] == 100


def test_get_scorecard_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/deputies/NONEXISTENT/scorecard")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Votes
# ---------------------------------------------------------------------------


def test_list_votes(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [_VOTE_SUMMARY]
    resp = client.get("/votes/")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert len(data["items"]) == 1


def test_latest_votes(client, mock_cursor):
    mock_cursor.fetchall.return_value = [_VOTE_SUMMARY] * 5
    resp = client.get("/votes/latest")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
    assert len(items) == 5


def test_get_vote_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = _VOTE_DETAIL
    mock_cursor.fetchall.return_value = [_POSITION]
    resp = client.get("/votes/VTANR5L17V1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["vote_id"] == "VTANR5L17V1"
    assert "positions" in data
    assert len(data["positions"]) == 1


def test_get_vote_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/votes/NONEXISTENT")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Search (RAG)
# ---------------------------------------------------------------------------


def test_search_groq_timeout_returns_504(client):
    exc = groq.APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))
    with patch("api.routers.search.ask", side_effect=exc):
        resp = client.post("/search/", json={"question": "Combien de députés RN ?"})
    assert resp.status_code == 504
