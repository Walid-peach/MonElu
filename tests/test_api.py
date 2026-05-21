"""Smoke tests for API routers — no real DB required."""

import asyncio
from unittest.mock import MagicMock, patch

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
    with patch.dict(
        "os.environ",
        {"OPENAI_API_KEY": "sk-real", "GROQ_API_KEY": "gsk_real"},  # pragma: allowlist secret
    ):
        resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"
    assert data["openai"] == "ok"
    assert data["groq"] == "ok"
    assert data["deputies"] == 577
    assert data["votes"] == 821
    assert data["positions"] == 289_411


def test_health_db_unavailable(client):
    with patch.object(_db, "_pool", None):
        resp = client.get("/health")
    assert resp.status_code == 207
    assert resp.json()["status"] == "degraded"
    assert resp.json()["db"] == "degraded"


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


# ---------------------------------------------------------------------------
# Edge cases — boundary conditions (issue #57)
# ---------------------------------------------------------------------------


def test_scorecard_zero_votes(client, mock_cursor):
    """Deputy who has never voted — division-by-zero guards must yield 0.0."""
    mock_cursor.fetchone.side_effect = [
        {"deputy_id": "PA99", "full_name": "Nouveau Député"},
        {
            "total_votes": 0,
            "present_votes": 0,
            "votes_for": 0,
            "votes_against": 0,
            "abstentions": 0,
        },
    ]
    resp = client.get("/deputies/PA99/scorecard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["presence_rate"] == 0.0
    assert data["votes_for_pct"] == 0.0
    assert data["abstention_pct"] == 0.0


def test_search_empty_chunks(client):
    """ask() returning zero chunks must yield 200 with an empty sources list, not 500."""
    empty = {"answer": "Aucune information.", "question": "?", "chunks_retrieved": 0, "sources": []}
    with patch("api.routers.search.ask", return_value=empty):
        resp = client.post("/search/", json={"question": "Question sans résultat ?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["chunks_retrieved"] == 0
    assert data["sources"] == []


def test_list_deputies_offset_exceeds_max(client):
    """offset > 10_000 is rejected by FastAPI query validation."""
    resp = client.get("/deputies/?offset=10001")
    assert resp.status_code == 422


def test_list_votes_offset_exceeds_max(client):
    """offset > 10_000 is rejected by FastAPI query validation."""
    resp = client.get("/votes/?offset=10001")
    assert resp.status_code == 422


def test_rate_limit_handler_includes_retry_after():
    """429 response from _rate_limit_handler must carry a Retry-After header."""
    from limits import parse as parse_limit
    from slowapi.errors import RateLimitExceeded
    from starlette.requests import Request as StarletteRequest

    from api.main import _rate_limit_handler

    limit_item = parse_limit("30/minute")
    mock_limit = MagicMock()
    mock_limit.limit = limit_item

    exc = RateLimitExceeded(mock_limit)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/deputies/",
        "headers": [],
        "query_string": b"",
    }
    request = StarletteRequest(scope)

    response = asyncio.run(_rate_limit_handler(request, exc))
    assert response.status_code == 429
    assert "Retry-After" in response.headers
    assert int(response.headers["Retry-After"]) == 60


def test_health_degraded_when_openai_key_is_placeholder(client, mock_cursor):
    """Health endpoint returns 207 and marks openai=degraded when key is a placeholder."""
    mock_cursor.fetchone.side_effect = [{"count": 577}, {"count": 821}, {"count": 289_411}]
    with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-..."}):  # pragma: allowlist secret
        resp = client.get("/health")
    assert resp.status_code == 207
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["openai"] == "degraded"
    assert data["db"] == "ok"
