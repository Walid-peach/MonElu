"""MON-274: one definition of the frontend origin, honoured everywhere."""

import pytest

from api.config import DEFAULT_FRONTEND_BASE_URL, frontend_base_url


def test_defaults_to_the_current_domain_when_unset(monkeypatch):
    monkeypatch.delenv("FRONTEND_BASE_URL", raising=False)
    assert frontend_base_url() == DEFAULT_FRONTEND_BASE_URL


@pytest.mark.parametrize("raw", ["https://monelu.fr", "https://monelu.fr/", "https://monelu.fr///"])
def test_strips_trailing_slashes(monkeypatch, raw):
    monkeypatch.setenv("FRONTEND_BASE_URL", raw)
    assert frontend_base_url() == "https://monelu.fr"


def test_root_redirect_honours_the_override(client, monkeypatch):
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://monelu.fr/")
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"] == "https://monelu.fr"


def test_root_redirect_falls_back_to_the_current_domain(client, monkeypatch):
    monkeypatch.delenv("FRONTEND_BASE_URL", raising=False)
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"] == DEFAULT_FRONTEND_BASE_URL
