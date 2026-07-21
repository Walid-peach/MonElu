"""Smoke tests for API routers — no real DB required."""

import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch

import groq
import httpx

import api.db as _db
from api.routers.votes import _decode_cursor, _encode_cursor

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
    "deputy_id": "PA1",
    "full_name": "Jean Martin",
    "party_short": "RN",
    "position": "pour",
}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def test_health_ok(client, mock_cursor):
    mock_cursor.fetchone.side_effect = [
        {"deputies": 577, "votes": 821, "positions": 289_411, "last_vote": None},
        {"count": 577},
        {"count": 821},
    ]
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
    mock_cursor.fetchone.return_value = {
        "deputy_id": "PA1",
        "full_name": "Jean Martin",
        "total_votes": 100,
        "present_votes": 90,
        "presence_rate": 0.9,
        "votes_for": 60,
        "votes_against": 20,
        "abstentions": 10,
        "votes_for_pct": 0.667,
        "abstention_pct": 0.111,
        "eligible_solennels": 35,
        "solennels_cast": 32,
        "solennel_participation_rate": 0.914,
        "eligible_voting_days": 126,
        "voting_days_present": 77,
        "voting_days_rate": 0.611,
    }
    resp = client.get("/deputies/PA1/scorecard")
    assert resp.status_code == 200
    data = resp.json()
    assert 0.0 <= data["presence_rate"] <= 1.0
    assert data["total_votes"] == 100
    assert data["solennel_participation_rate"] == 0.914
    assert data["voting_days_rate"] == 0.611


def test_get_scorecard_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/deputies/NONEXISTENT/scorecard")
    assert resp.status_code == 404


def test_get_alignment(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "deputy_id": "PA1",
        "full_name": "Jean Martin",
        "party": "Rassemblement National",
        "total_votes": 25,
        "aligned_votes": 20,
        "dissident_votes": 5,
        "party_alignment_rate": 0.8,
        "dissident_rate": 0.2,
        "updated_at": None,
    }
    resp = client.get("/deputies/PA1/alignment")
    assert resp.status_code == 200
    data = resp.json()
    assert data["party_alignment_rate"] == 0.8
    assert data["dissident_votes"] == 5


def test_get_alignment_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/deputies/NONEXISTENT/alignment")
    assert resp.status_code == 404


def test_get_dissident_votes(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": "VTANR5L17V1",
            "voted_at": "2024-07-16T15:00:00",
            "vote_title": "Vote sur le projet de loi de finances",
            "result": "adopté",
            "position": "pour",
            "majority_position": "contre",
        }
    ]
    resp = client.get("/deputies/PA1/dissident-votes")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["position"] == "pour"
    assert data["items"][0]["majority_position"] == "contre"


def test_get_dissident_votes_empty(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 0}
    mock_cursor.fetchall.return_value = []
    resp = client.get("/deputies/PA1/dissident-votes")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_get_diverging_votes(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": "VTANR5L17V1",
            "voted_at": "2024-07-16T15:00:00",
            "vote_title": "Vote sur le projet de loi de finances",
            "result": "adopté",
            "summary_plain": "Ce texte prévoit...",
            "position_a": "pour",
            "position_b": "contre",
        }
    ]
    resp = client.get("/deputies/PA1/diverging-votes?other_deputy_id=PA2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["deputy_a_id"] == "PA1"
    assert data["deputy_b_id"] == "PA2"
    assert data["total"] == 1
    assert data["items"][0]["position_a"] == "pour"
    assert data["items"][0]["position_b"] == "contre"


def test_get_diverging_votes_requires_other_deputy_id(client, mock_cursor):
    resp = client.get("/deputies/PA1/diverging-votes")
    assert resp.status_code == 422


def test_get_diverging_votes_empty(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 0}
    mock_cursor.fetchall.return_value = []
    resp = client.get("/deputies/PA1/diverging-votes?other_deputy_id=PA2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_get_deputy_stats(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "avg_presence_rate": 0.8,
        "avg_solennel_participation_rate": 0.75,
        "avg_voting_days_rate": 0.7,
        "avg_votes_for_pct": 0.6,
        "avg_abstention_pct": 0.1,
    }
    resp = client.get("/deputies/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["avg_votes_for_pct"] == 0.6
    assert data["avg_abstention_pct"] == 0.1


def test_get_deputy_stats_scoped_to_party(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "avg_presence_rate": 0.85,
        "avg_solennel_participation_rate": 0.8,
        "avg_voting_days_rate": 0.75,
        "avg_votes_for_pct": 0.65,
        "avg_abstention_pct": 0.05,
    }
    resp = client.get("/deputies/stats?party=Renaissance")
    assert resp.status_code == 200
    select_params = mock_cursor.execute.call_args_list[-1].args[1]
    assert select_params == ["Renaissance"]


def test_get_deputy_votes_includes_summary_plain(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 1}
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": "VTANR5L17V1",
            "voted_at": "2024-07-16T15:00:00",
            "vote_title": "Vote sur le projet de loi de finances",
            "result": "adopté",
            "position": "pour",
            "summary_plain": "Ce texte prévoit...",
        }
    ]
    resp = client.get("/deputies/PA1/votes")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"][0]["summary_plain"] == "Ce texte prévoit..."


def test_get_deputy_votes_since_filter(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 5}
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": "VTANR5L17V2",
            "voted_at": "2026-07-05T15:00:00",
            "vote_title": "Vote récent",
            "result": "adopté",
            "position": "contre",
            "summary_plain": None,
        }
    ]
    resp = client.get("/deputies/PA1/votes?since=2026-07-01T00:00:00&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    # total reflects the unfiltered count (pre-existing pagination semantics on
    # this endpoint); only items are narrowed by since.
    assert data["total"] == 5
    assert len(data["items"]) == 1
    # The SELECT (last execute call) must carry deputy_id, the decoded since
    # timestamp, and the limit — in that order.
    select_params = mock_cursor.execute.call_args_list[-1].args[1]
    assert select_params == ["PA1", datetime(2026, 7, 1, 0, 0, 0), 5]


def test_get_deputy_votes_since_in_the_future_returns_no_items(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"count": 5}
    mock_cursor.fetchall.return_value = []
    resp = client.get("/deputies/PA1/votes?since=2099-01-01T00:00:00")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert data["items"] == []


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
    # Partial page (1 row < default limit) → no further pages.
    assert data["next_cursor"] is None


def test_list_votes_returns_next_cursor(client, mock_cursor):
    """A full page hands back an opaque next_cursor that round-trips to its keyset."""
    ts = datetime(2024, 7, 16, 15, 0, 0)
    row = {**_VOTE_SUMMARY, "voted_at": ts, "vote_id": "VTANR5L17V1"}
    mock_cursor.fetchone.return_value = {"count": 5_000}
    mock_cursor.fetchall.return_value = [row]  # one row == limit=1 → full page
    resp = client.get("/votes/?limit=1")
    assert resp.status_code == 200
    cursor = resp.json()["next_cursor"]
    assert cursor is not None
    assert _decode_cursor(cursor) == (ts, "VTANR5L17V1")


def test_list_votes_before_cursor_overrides_offset(client, mock_cursor):
    """A valid before= cursor drives the keyset predicate and zeroes the offset."""
    ts = datetime(2024, 7, 16, 15, 0, 0)
    token = _encode_cursor(ts, "VTANR5L17V1")
    mock_cursor.fetchone.return_value = {"count": 5_000}
    mock_cursor.fetchall.return_value = [_VOTE_SUMMARY]
    resp = client.get(f"/votes/?before={token}&offset=100")
    assert resp.status_code == 200
    assert resp.json()["total"] == 5_000
    # The SELECT (last execute call) must carry the decoded cursor values, and the
    # offset must be zeroed because keyset paging supersedes it.
    select_params = mock_cursor.execute.call_args.args[1]
    assert ts in select_params
    assert "VTANR5L17V1" in select_params
    assert select_params[-1] == 0


def test_list_votes_invalid_cursor_rejected(client):
    """A malformed before= cursor returns 422, not 500."""
    resp = client.get("/votes/?before=not-a-valid-cursor")
    assert resp.status_code == 422


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
    mock_cursor.fetchone.return_value = {
        "deputy_id": "PA99",
        "full_name": "Nouveau Député",
        "total_votes": 0,
        "present_votes": 0,
        "presence_rate": 0.0,
        "votes_for": 0,
        "votes_against": 0,
        "abstentions": 0,
        "votes_for_pct": 0.0,
        "abstention_pct": 0.0,
        "eligible_solennels": 0,
        "solennels_cast": 0,
        "solennel_participation_rate": 0.0,
        "eligible_voting_days": 0,
        "voting_days_present": 0,
        "voting_days_rate": 0.0,
    }
    resp = client.get("/deputies/PA99/scorecard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_votes"] == 0
    assert data["solennel_participation_rate"] == 0.0
    assert data["voting_days_rate"] == 0.0
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
    # Additive field (ADR-023): absent from ask() results → null, never an error.
    assert data["suggested_action"] is None


def test_search_propagates_suggested_action(client):
    """suggested_action='verify' from ask() reaches the response body (ADR-023 nudge)."""
    flagged = {
        "answer": "Réponse.",
        "question": "Le député X a voté contre le SMIC",
        "chunks_retrieved": 1,
        "sources": [{"content": "c", "metadata": {}, "similarity": 0.9}],
        "suggested_action": "verify",
    }
    with patch("api.routers.search.ask", return_value=flagged):
        resp = client.post("/search/", json={"question": "Le député X a voté contre le SMIC"})
    assert resp.status_code == 200
    assert resp.json()["suggested_action"] == "verify"


def test_list_deputies_offset_exceeds_max(client):
    """offset > 10_000 is rejected by FastAPI query validation."""
    resp = client.get("/deputies/?offset=10001")
    assert resp.status_code == 422


def test_list_votes_offset_exceeds_max(client):
    """offset > 2_000 is rejected by query validation (use ?before= cursor instead)."""
    resp = client.get("/votes/?offset=2001")
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
    mock_cursor.fetchone.side_effect = [
        {"deputies": 577, "votes": 821, "positions": 289_411, "last_vote": None},
        {"count": 577},
        {"count": 821},
    ]
    with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-..."}):  # pragma: allowlist secret
        resp = client.get("/health")
    assert resp.status_code == 207
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["openai"] == "degraded"
    assert data["db"] == "ok"


# ---------------------------------------------------------------------------
# Verify (MON-126)
# ---------------------------------------------------------------------------

_VERIFY_KEYS_SET = {
    "GROQ_API_KEY": "gsk_test_not_a_real_key",  # pragma: allowlist secret
    "OPENAI_API_KEY": "sk-test-not-a-real-key",  # pragma: allowlist secret
}

_VERIFY_CHAIN_RESULT = {
    "claim": "Gabriel Attal a voté contre l'augmentation du SMIC",
    "verdict": "faux",
    "explanation": "Le scrutin cité montre un vote pour.",
    "deputy": {"deputy_id": "PA2", "name": "Gabriel Attal", "party": "EPR"},
    "citations": [
        {
            "vote_id": "VTANR5L17V1",
            "title": "Vote sur l'augmentation du SMIC",
            "voted_at": "2025-09-01",
            "result": "rejeté",
            "deputy_position": "pour",
        }
    ],
    "confidence": "ÉLEVÉ",
    "data_horizon": "2025-07-01",
}

_VERIFY_ROW = {
    "id": "3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001",
    "claim": _VERIFY_CHAIN_RESULT["claim"],
    "verdict": _VERIFY_CHAIN_RESULT["verdict"],
    "explanation": _VERIFY_CHAIN_RESULT["explanation"],
    "deputy": _VERIFY_CHAIN_RESULT["deputy"],
    "citations": _VERIFY_CHAIN_RESULT["citations"],
    "confidence": "ÉLEVÉ",
    "data_horizon": "2025-07-01",
    "created_at": datetime(2026, 7, 14, 12, 0, 0),
}


def test_verify_post_persists_and_returns_verdict(client, mock_cursor):
    mock_cursor.fetchone.return_value = dict(_VERIFY_ROW)
    with (
        patch("api.routers.verify.verify_claim", return_value=dict(_VERIFY_CHAIN_RESULT)),
        patch.dict("os.environ", _VERIFY_KEYS_SET),
    ):
        resp = client.post("/verify/", json={"claim": _VERIFY_CHAIN_RESULT["claim"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "faux"
    assert data["id"] == _VERIFY_ROW["id"]
    assert data["share_url"].endswith(f"/verifier/v/{_VERIFY_ROW['id']}")
    assert data["citations"][0]["vote_id"] == "VTANR5L17V1"
    assert data["citations"][0]["deputy_position"] == "pour"
    assert data["deputy"]["name"] == "Gabriel Attal"
    assert data["confidence"] == "ÉLEVÉ"
    assert data["data_horizon"] == "2025-07-01"
    assert data["verified_at"] == "2026-07-14T12:00:00"


def test_verify_post_503_when_keys_unset(client):
    placeholders = {
        "GROQ_API_KEY": "gsk_...",  # pragma: allowlist secret
        "OPENAI_API_KEY": "sk-...",  # pragma: allowlist secret
    }
    with patch.dict("os.environ", placeholders):
        resp = client.post("/verify/", json={"claim": "Une affirmation à vérifier ici"})
    assert resp.status_code == 503
    assert "configurée" in resp.json()["detail"]


def test_verify_post_claim_too_short_rejected(client):
    resp = client.post("/verify/", json={"claim": "court"})
    assert resp.status_code == 422


def test_verify_post_groq_timeout_returns_504(client):
    exc = groq.APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))
    with (
        patch("api.routers.verify.verify_claim", side_effect=exc),
        patch.dict("os.environ", _VERIFY_KEYS_SET),
    ):
        resp = client.post("/verify/", json={"claim": "Une affirmation à vérifier ici"})
    assert resp.status_code == 504


def test_verify_get_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = dict(_VERIFY_ROW)
    resp = client.get(f"/verify/{_VERIFY_ROW['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "faux"
    assert data["share_url"].endswith(f"/verifier/v/{_VERIFY_ROW['id']}")


def test_verify_get_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/verify/3f0e8a4e-6f0f-4a63-9c40-df3a54d9c999")
    assert resp.status_code == 404


def test_verify_get_invalid_uuid_rejected(client):
    resp = client.get("/verify/not-a-uuid")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Departments (MON-107)
# ---------------------------------------------------------------------------

_DEPT_DEPUTY_ROWS = [
    {
        "deputy_id": "PA1",
        "full_name": "Jean Martin",
        "party": "Rassemblement National",
        "party_short": "RN",
        "department": "Gironde",
        "circonscription": "1ère circonscription",
        "photo_url": None,
    },
    {
        "deputy_id": "PA2",
        "full_name": "Anne Durand",
        "party": "La France insoumise",
        "party_short": "LFI",
        "department": "Gironde",
        "circonscription": "2ème circonscription",
        "photo_url": None,
    },
]

_DEPT_SPLIT_ROWS = [
    {
        "vote_id": "VTANR5L17V1",
        "voted_at": datetime(2025, 7, 16, 15, 0),
        "vote_title": "Vote sur le projet de loi de finances",
        "result": "adopté",
        "pour": 1,
        "contre": 1,
        "abstention": 0,
    },
]

_DEPT_RATE_ROWS = [
    {
        "deputy_id": "PA1",
        "presence_rate": 0.8,
        "solennel_participation_rate": 0.9,
        "party_alignment_rate": 0.95,
        "dissident_rate": 0.05,
    },
    {
        "deputy_id": "PA2",
        "presence_rate": 0.6,
        "solennel_participation_rate": 0.7,
        "party_alignment_rate": 0.85,
        "dissident_rate": 0.15,
    },
]


def test_get_department(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [_DEPT_DEPUTY_ROWS, _DEPT_SPLIT_ROWS, _DEPT_RATE_ROWS]
    resp = client.get("/departments/33")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "33"
    assert data["name"] == "Gironde"
    assert data["deputy_count"] == 2
    assert data["deputies"][0]["presence_rate"] == 0.8
    assert data["avg_presence_rate"] == 0.7
    assert {p["party"]: p["count"] for p in data["party_distribution"]} == {
        "Rassemblement National": 1,
        "La France insoumise": 1,
    }
    assert data["most_dissident"]["deputy_id"] == "PA2"
    assert data["split_votes"][0]["vote_id"] == "VTANR5L17V1"


def test_get_department_zero_padded_code(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [_DEPT_DEPUTY_ROWS, _DEPT_SPLIT_ROWS, _DEPT_RATE_ROWS]
    resp = client.get("/departments/099")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "99"
    assert data["name"] == "Français établis hors de France"


def test_get_department_unknown_code(client, mock_cursor):
    resp = client.get("/departments/xx")
    assert resp.status_code == 404


def test_get_department_no_active_deputies(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [[]]
    resp = client.get("/departments/2A")
    assert resp.status_code == 404


def test_get_department_marts_missing(client, mock_cursor):
    import psycopg2.errors

    mock_cursor.fetchall.side_effect = [
        _DEPT_DEPUTY_ROWS,
        _DEPT_SPLIT_ROWS,
        psycopg2.errors.UndefinedTable("mart missing"),
    ]
    resp = client.get("/departments/33")
    assert resp.status_code == 200
    data = resp.json()
    assert data["deputies"][0]["presence_rate"] is None
    assert data["avg_presence_rate"] is None
    assert data["most_dissident"] is None
    assert data["split_votes"][0]["vote_id"] == "VTANR5L17V1"


# ---------------------------------------------------------------------------
# Groups (MON-150)
# ---------------------------------------------------------------------------

_GROUP_MEMBER_ROWS = [
    {
        "deputy_id": "PA1",
        "full_name": "Jean Martin",
        "party": "Rassemblement National",
        "party_short": "RN",
        "department": "Gironde",
        "circonscription": "1ère circonscription",
        "photo_url": None,
    },
    {
        "deputy_id": "PA2",
        "full_name": "Anne Durand",
        "party": "Rassemblement National",
        "party_short": "RN",
        "department": "Paris",
        "circonscription": "2ème circonscription",
        "photo_url": None,
    },
]

_GROUP_VOTE_ROWS = [
    {
        "vote_id": "VTANR5L17V2",
        "voted_at": datetime(2025, 8, 1, 10, 0),
        "vote_title": "Vote sur le budget 2026",
        "result": "adopté",
        "pour": 2,
        "contre": 0,
        "abstention": 0,
    },
    {
        "vote_id": "VTANR5L17V1",
        "voted_at": datetime(2025, 7, 16, 15, 0),
        "vote_title": "Vote sur le projet de loi de finances",
        "result": "adopté",
        "pour": 1,
        "contre": 1,
        "abstention": 0,
    },
]

_GROUP_RATE_ROWS = [
    {"deputy_id": "PA1", "presence_rate": 0.8, "dissident_rate": 0.05},
    {"deputy_id": "PA2", "presence_rate": 0.6, "dissident_rate": 0.15},
]


def test_get_group(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [_GROUP_MEMBER_ROWS, _GROUP_VOTE_ROWS, _GROUP_RATE_ROWS]
    resp = client.get("/groups/rassemblement-national")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == "rassemblement-national"
    assert data["name"] == "Rassemblement National"
    assert data["member_count"] == 2
    assert data["avg_presence_rate"] == 0.7
    assert data["avg_dissident_rate"] == 0.1
    assert data["most_dissident_members"][0]["deputy_id"] == "PA2"
    assert [v["vote_id"] for v in data["divided_votes"]] == ["VTANR5L17V1"]
    assert data["divided_votes"][0]["majority_position"] == "pour"
    assert [v["vote_id"] for v in data["recent_scrutins"]] == [
        "VTANR5L17V2",
        "VTANR5L17V1",
    ]


def test_get_group_unknown_slug(client, mock_cursor):
    resp = client.get("/groups/does-not-exist")
    assert resp.status_code == 404


def test_get_group_normalizes_slug_case(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [_GROUP_MEMBER_ROWS, _GROUP_VOTE_ROWS, _GROUP_RATE_ROWS]
    resp = client.get("/groups/Rassemblement-National")
    assert resp.status_code == 200
    assert resp.json()["slug"] == "rassemblement-national"


def test_get_group_no_active_deputies(client, mock_cursor):
    mock_cursor.fetchall.side_effect = [[]]
    resp = client.get("/groups/liot")
    assert resp.status_code == 404


def test_get_group_marts_missing(client, mock_cursor):
    import psycopg2.errors

    mock_cursor.fetchall.side_effect = [
        _GROUP_MEMBER_ROWS,
        _GROUP_VOTE_ROWS,
        psycopg2.errors.UndefinedTable("mart missing"),
    ]
    resp = client.get("/groups/rassemblement-national")
    assert resp.status_code == 200
    data = resp.json()
    assert data["members"][0]["presence_rate"] is None
    assert data["avg_presence_rate"] is None
    assert data["avg_dissident_rate"] is None
    assert data["most_dissident_members"] == []
    assert [v["vote_id"] for v in data["recent_scrutins"]] == [
        "VTANR5L17V2",
        "VTANR5L17V1",
    ]


# ---------------------------------------------------------------------------
# CSV exports (MON-97)
# ---------------------------------------------------------------------------

_SCORECARD_ROW = {
    "deputy_id": "PA1",
    "full_name": "Jean Martin",
    "party": "Rassemblement National",
    "party_short": "RN",
    "department": "Paris",
    "total_votes": 100,
    "present_votes": 90,
    "presence_rate": 0.9,
    "votes_for": 60,
    "votes_against": 20,
    "abstentions": 10,
    "votes_for_pct": 0.667,
    "abstention_pct": 0.111,
    "eligible_solennels": 35,
    "solennels_cast": 32,
    "solennel_participation_rate": 0.914,
    "eligible_voting_days": 126,
    "voting_days_present": 77,
    "voting_days_rate": 0.611,
}


def test_export_scorecards_csv(client, mock_cursor):
    mock_cursor.fetchall.return_value = [_SCORECARD_ROW]
    resp = client.get("/deputies/scorecard.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert 'filename="monelu_scorecard_deputes.csv"' in resp.headers["content-disposition"]
    # UTF-8 BOM so Excel detects the encoding
    assert resp.content.startswith(b"\xef\xbb\xbf")
    lines = resp.text.lstrip("\ufeff").splitlines()
    assert lines[0].startswith("deputy_id,full_name,party,")
    assert lines[1].startswith("PA1,Jean Martin,Rassemblement National,RN,Paris,100,90,0.9,")


def test_list_scorecards_json(client, mock_cursor):
    mock_cursor.fetchall.return_value = [_SCORECARD_ROW]
    resp = client.get("/deputies/scorecards")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["deputy_id"] == "PA1"
    assert data["items"][0]["party_short"] == "RN"
    assert data["items"][0]["presence_rate"] == 0.9


def test_export_deputy_votes_csv(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"full_name": "Jean Martin"}
    mock_cursor.fetchall.return_value = [
        {
            "deputy_id": "PA1",
            "vote_id": "VTANR5L17V1",
            "voted_at": "2024-07-16T15:00:00",
            "vote_title": "Vote sur le projet de loi de finances",
            "theme": "budget",
            "result": "adopté",
            "position": "pour",
        }
    ]
    resp = client.get("/deputies/PA1/votes.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert 'filename="monelu_depute_PA1_votes.csv"' in resp.headers["content-disposition"]
    assert resp.content.startswith(b"\xef\xbb\xbf")
    lines = resp.text.lstrip("\ufeff").splitlines()
    assert lines[0] == "deputy_id,vote_id,voted_at,vote_title,theme,result,position"
    assert lines[1].endswith(",adopté,pour")


def test_export_deputy_votes_csv_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/deputies/NONEXISTENT/votes.csv")
    assert resp.status_code == 404


def test_export_vote_positions_csv(client, mock_cursor):
    mock_cursor.fetchone.return_value = {"vote_id": "VTANR5L17V1"}
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": "VTANR5L17V1",
            "deputy_id": "PA1",
            "full_name": "Jean Martin",
            "party": "Rassemblement National",
            "party_short": "RN",
            "department": "Paris",
            "position": "pour",
        }
    ]
    resp = client.get("/votes/VTANR5L17V1/positions.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert (
        'filename="monelu_scrutin_VTANR5L17V1_positions.csv"'
        in (resp.headers["content-disposition"])
    )
    assert resp.content.startswith(b"\xef\xbb\xbf")
    lines = resp.text.lstrip("\ufeff").splitlines()
    assert lines[0] == "vote_id,deputy_id,full_name,party,party_short,department,position"
    assert lines[1] == "VTANR5L17V1,PA1,Jean Martin,Rassemblement National,RN,Paris,pour"


def test_export_vote_positions_csv_not_found(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/votes/NOPE/positions.csv")
    assert resp.status_code == 404


def test_list_scorecards_marts_missing(client, mock_cursor):
    import psycopg2.errors

    mock_cursor.fetchall.side_effect = psycopg2.errors.UndefinedTable("mart missing")
    resp = client.get("/deputies/scorecards")
    assert resp.status_code == 503


def test_export_scorecards_csv_marts_missing(client, mock_cursor):
    import psycopg2.errors

    mock_cursor.fetchall.side_effect = psycopg2.errors.UndefinedTable("mart missing")
    resp = client.get("/deputies/scorecard.csv")
    assert resp.status_code == 503


def test_export_deputy_votes_csv_marts_missing(client, mock_cursor):
    import psycopg2.errors

    mock_cursor.fetchone.return_value = {"full_name": "Jean Martin"}
    mock_cursor.fetchall.side_effect = psycopg2.errors.UndefinedTable("mart missing")
    resp = client.get("/deputies/PA1/votes.csv")
    assert resp.status_code == 503
