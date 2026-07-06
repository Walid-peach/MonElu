"""Unit tests for the API key tier (MON-98): resolution, tiered limits, usage endpoint."""

from unittest.mock import MagicMock, patch

import api.auth as auth
from api.limiter import rate_limit_key, tiered_limit


def _reset_cache():
    auth._cache_by_hash = {}
    auth._cache_loaded_at = 0.0


def test_resolve_api_key_missing_header_returns_none():
    assert auth.resolve_api_key(None) is None
    assert auth.resolve_api_key("") is None


def test_resolve_api_key_hits_cache_without_reload():
    _reset_cache()
    record = auth.ApiKeyRecord(id=1, label="Test", rate_limit_multiplier=4)
    auth._cache_by_hash[auth._hash_key("secret")] = record
    import time

    auth._cache_loaded_at = time.monotonic()

    with patch.object(auth, "_reload_cache") as reload_mock:
        result = auth.resolve_api_key("secret")
    reload_mock.assert_not_called()
    assert result == record
    _reset_cache()


def test_resolve_api_key_unknown_key_returns_none():
    _reset_cache()
    import time

    auth._cache_loaded_at = time.monotonic()
    with patch.object(auth, "_reload_cache"):
        assert auth.resolve_api_key("not-a-real-key") is None
    _reset_cache()


def test_record_usage_swallows_db_errors():
    with patch.object(auth, "get_conn", side_effect=RuntimeError("db down")):
        auth.record_usage(1, "/deputies/")  # must not raise


def test_rate_limit_key_anonymous_falls_back_to_ip():
    request = MagicMock()
    request.headers.get.return_value = None
    with patch.object(auth, "resolve_api_key", return_value=None):
        key = rate_limit_key(request)
    assert "apikey:" not in key


def test_rate_limit_key_keyed_embeds_id_and_multiplier():
    request = MagicMock()
    request.headers.get.return_value = "raw-key"
    record = auth.ApiKeyRecord(id=7, label="Partner", rate_limit_multiplier=10)
    with patch("api.limiter.resolve_api_key", return_value=record):
        key = rate_limit_key(request)
    assert key == "apikey:7:10"


def test_tiered_limit_anonymous_uses_base():
    limit_fn = tiered_limit(30)
    assert limit_fn("203.0.113.5") == "30/minute"


def test_tiered_limit_keyed_scales_by_multiplier():
    limit_fn = tiered_limit(30)
    assert limit_fn("apikey:7:4") == "120/minute"


def test_get_key_usage_requires_header(client):
    resp = client.get("/keys/usage")
    assert resp.status_code == 401


def test_get_key_usage_returns_usage_for_valid_key(client, mock_cursor):
    record = auth.ApiKeyRecord(id=1, label="Test NGO", rate_limit_multiplier=4)
    mock_cursor.fetchall.return_value = [
        {"endpoint": "/deputies/", "day": "2026-07-01", "request_count": 12},
    ]
    with patch("api.routers.keys.resolve_api_key", return_value=record):
        resp = client.get("/keys/usage", headers={"X-API-Key": "whatever"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "Test NGO"
    assert data["rate_limit_multiplier"] == 4
    assert data["items"][0]["request_count"] == 12


def test_end_to_end_keyed_request_gets_higher_effective_limit():
    """Drives a real @limiter.limit(tiered_limit(...)) route end to end: anonymous is
    capped at the base limit, a keyed request with a multiplier gets base * multiplier —
    proving the decorator, key_func, and tiered_limit actually compose correctly, not
    just in isolation."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient as FastAPITestClient
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from starlette.requests import Request as StarletteRequest

    from api.limiter import limiter, tiered_limit

    test_app = FastAPI()
    test_app.state.limiter = limiter
    test_app.add_middleware(SlowAPIMiddleware)
    test_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @test_app.get("/_test_tiered_limit_endpoint")
    @limiter.limit(tiered_limit(1))
    def _tiered_endpoint(request: StarletteRequest):
        return {"ok": True}

    with FastAPITestClient(test_app) as tc:
        # Anonymous: 1 request/minute — the second in the same window is rejected.
        assert tc.get("/_test_tiered_limit_endpoint").status_code == 200
        assert tc.get("/_test_tiered_limit_endpoint").status_code == 429

        # Keyed with a 3x multiplier: 3 requests succeed before the 4th trips the limit.
        record = auth.ApiKeyRecord(id=99, label="E2E", rate_limit_multiplier=3)
        headers = {"X-API-Key": "whatever"}
        with patch("api.limiter.resolve_api_key", return_value=record):
            for _ in range(3):
                assert tc.get("/_test_tiered_limit_endpoint", headers=headers).status_code == 200
            assert tc.get("/_test_tiered_limit_endpoint", headers=headers).status_code == 429
