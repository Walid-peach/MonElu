"""
`GET /app/config` (ADR-041 §5, #438): what a native app reads at launch
instead of hardcoding, because a shipped binary cannot be redeployed.

The failure modes that matter are the silent ones: a malformed override that
the app cannot parse, or a missing variable that quietly disables a feature.
"""

import re

import pytest

import api.app_config_data as cfg


def test_defaults(client, monkeypatch):
    for var in ("APP_MIN_IOS_VERSION", *cfg.FEATURE_ENV_VARS.values()):
        monkeypatch.delenv(var, raising=False)

    body = client.get("/app/config").json()

    assert body["min_ios_version"] == cfg.DEFAULT_MIN_IOS_VERSION
    assert body["features"] == {"chat": True, "verify": True}
    assert body["data_horizon"] == "2025-07-01"
    assert [c["id"] for c in body["caveats"]] == [cid for cid, _ in cfg.CAVEATS]


def test_needs_no_account(client):
    assert client.get("/app/config").status_code == 200


@pytest.mark.parametrize("value", ["0", "false", "OFF", " no "])
def test_a_feature_can_be_switched_off(client, monkeypatch, value):
    monkeypatch.setenv("APP_FEATURE_CHAT", value)
    assert client.get("/app/config").json()["features"] == {"chat": False, "verify": True}


@pytest.mark.parametrize("value", ["", "1", "true", "maybe"])
def test_anything_else_keeps_a_feature_on(monkeypatch, value):
    monkeypatch.setenv("APP_FEATURE_VERIFY", value)
    assert cfg.feature_enabled("verify") is True


def test_min_version_override(client, monkeypatch):
    monkeypatch.setenv("APP_MIN_IOS_VERSION", "1.4.2")
    assert client.get("/app/config").json()["min_ios_version"] == "1.4.2"


@pytest.mark.parametrize("value", ["1.4", "v1.4.2", "1.4.2-beta", "latest"])
def test_malformed_min_version_falls_back_to_the_default(monkeypatch, value, caplog):
    monkeypatch.setenv("APP_MIN_IOS_VERSION", value)
    assert cfg.min_ios_version() == cfg.DEFAULT_MIN_IOS_VERSION
    assert "APP_MIN_IOS_VERSION" in caplog.text


def test_caveat_ids_are_unique_and_stable_slugs():
    ids = [cid for cid, _ in cfg.CAVEATS]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r"[a-z][a-z_]*", cid) for cid in ids)
