"""
`Cache-Control` on public reads (ADR-041 §5, #438).

The header lets a CDN and the iOS app's URLCache absorb traffic the website's
ISR cache used to absorb. What matters most is where it must *not* appear: a
per-caller response or a live-state response served from a shared cache would
leak one person's account to another or hide an outage.
"""

import pytest
from fastapi import FastAPI, HTTPException, Response
from fastapi.testclient import TestClient

from api.cache_headers import PUBLIC_CACHE_CONTROL, add_public_cache_control, is_cacheable


@pytest.fixture(scope="module")
def mini():
    app = FastAPI()
    app.middleware("http")(add_public_cache_control)

    for path in ("/deputies", "/account/me", "/keys/usage", "/health", "/accounting"):
        app.get(path)(lambda: {"ok": True})

    @app.post("/quiz/match")
    def post():
        return {"ok": True}

    @app.get("/votes/missing")
    def missing():
        raise HTTPException(status_code=404)

    @app.get("/votes/own-header")
    def own_header(response: Response):
        response.headers["Cache-Control"] = "no-store"
        return {"ok": True}

    return TestClient(app)


def test_public_get_is_cacheable(mini):
    assert mini.get("/deputies").headers["cache-control"] == PUBLIC_CACHE_CONTROL


@pytest.mark.parametrize("path", ["/account/me", "/keys/usage", "/health"])
def test_per_caller_and_live_routes_are_never_cached(mini, path):
    assert "cache-control" not in mini.get(path).headers


def test_prefix_match_is_by_path_segment(mini):
    """`/accounting` is not under `/account`."""
    assert mini.get("/accounting").headers["cache-control"] == PUBLIC_CACHE_CONTROL


def test_writes_are_never_cached(mini):
    assert "cache-control" not in mini.post("/quiz/match").headers


def test_errors_are_never_cached(mini):
    r = mini.get("/votes/missing")
    assert r.status_code == 404
    assert "cache-control" not in r.headers


def test_a_handlers_own_header_wins(mini):
    assert mini.get("/votes/own-header").headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "method, path, status, expected",
    [
        ("GET", "/votes", 200, True),
        ("GET", "/votes", 304, False),
        ("GET", "/votes", 429, False),
        ("GET", "/", 307, False),
        ("HEAD", "/votes", 200, False),
        ("GET", "/account", 200, False),
        ("GET", "/health", 200, False),
    ],
)
def test_is_cacheable(method, path, status, expected):
    assert is_cacheable(method, path, status) is expected


def test_real_app_marks_a_public_read(client):
    """End to end on the real app: /app/config needs no database."""
    r = client.get("/app/config")
    assert r.status_code == 200
    assert r.headers["cache-control"] == PUBLIC_CACHE_CONTROL
