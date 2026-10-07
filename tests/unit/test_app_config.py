"""
`GET /app/config` (ADR-041 §5, #438): what a native app reads at launch
instead of hardcoding, because a shipped binary cannot be redeployed.

The failure modes that matter are the silent ones: a malformed override that
the app cannot parse, or a missing variable that quietly disables a feature.
"""

import pathlib
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


def test_site_url_is_the_frontend_origin(client, monkeypatch):
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://monelu.example/")
    assert client.get("/app/config").json()["site_url"] == "https://monelu.example"


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


def test_caveats_match_the_websites_llms_txt():
    """The app and the website must print the same caveats (ADR-041 §4).

    Parsed out of the TypeScript source rather than imported, since the two live
    in different runtimes; the list is plain single-quoted strings, and the
    parse asserts it found them all rather than silently comparing nothing.
    """
    source = (
        pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "llms.ts"
    ).read_text(encoding="utf-8")
    start = source.index("export const CAVEATS = [")
    block = source[start : source.index("\n]", start)]
    web = [text.replace("\\'", "'") for text in re.findall(r"'((?:[^'\\]|\\.)*)'", block)]

    assert len(web) == len(cfg.CAVEATS), "CAVEATS in llms.ts changed length or shape"
    assert web == [text for _, text in cfg.CAVEATS]


def test_bill_coverage_caveat_names_the_api_coverage_start():
    """The caveat states the date the bill page's API uses as its boundary."""
    from api.routers.lois import SCRUTIN_COVERAGE_START

    months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
              "septembre", "octobre", "novembre", "décembre"]  # fmt: skip
    d = SCRUTIN_COVERAGE_START
    text = dict(cfg.CAVEATS)["bill_coverage"]
    assert f"**{d.day} {months[d.month - 1]} {d.year}**" in text
