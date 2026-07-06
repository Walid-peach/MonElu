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
