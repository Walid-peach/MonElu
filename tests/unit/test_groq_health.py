"""/health's Groq probe (GH #385).

During #351 /health read `groq: ok` while every LLM endpoint returned 500s. These
tests pin the two failure modes that outage combined - a rejected key and a
decommissioned model - plus the constraints on the probe: cached, and never
able to make /health itself hang or fail.
"""

from unittest.mock import patch

import groq
import httpx
import pytest

import api.groq_health as gh

# Captured at import, before conftest's autouse fixture stubs it for every test.
_REAL_FETCH_CATALOG = gh._fetch_catalog
_KEY = "gsk_real"  # pragma: allowlist secret
_REAL_KEYS = {"OPENAI_API_KEY": "sk-real", "GROQ_API_KEY": _KEY}  # pragma: allowlist secret
_PLACEHOLDER = {"OPENAI_API_KEY": "sk-real", "GROQ_API_KEY": "gsk_..."}  # pragma: allowlist secret
_STATS = [
    {
        "deputies": 577,
        "votes": 821,
        "positions": 289_411,
        "last_vote": None,
        "db_size_bytes": 150 * 1024 * 1024,
    },
    {"count": 577},
    {"count": 821},
    {"oid": None},
]


def _status_error(cls, code: int):
    request = httpx.Request("GET", "https://api.groq.com/openai/v1/models")
    return cls("rejected", response=httpx.Response(code, request=request), body=None)


def test_ok_when_every_configured_model_is_served():
    with patch.object(gh, "_fetch_catalog", return_value={*gh.REQUIRED_MODELS, "other"}):
        assert gh.groq_status(_KEY) == (gh.OK, None)


@pytest.mark.parametrize(
    "exc",
    [_status_error(groq.AuthenticationError, 401), _status_error(groq.PermissionDeniedError, 403)],
)
def test_failing_when_the_key_is_rejected(exc):
    with patch.object(gh, "_fetch_catalog", side_effect=exc):
        status, detail = gh.groq_status(_KEY)
    assert status == gh.FAILING
    assert str(exc.status_code) in detail


@pytest.mark.parametrize("model", gh.REQUIRED_MODELS)
def test_failing_when_a_configured_model_is_decommissioned(model):
    catalog = set(gh.REQUIRED_MODELS) - {model}
    with patch.object(gh, "_fetch_catalog", return_value=catalog):
        status, detail = gh.groq_status(_KEY)
    assert status == gh.FAILING
    assert model in detail


@pytest.mark.parametrize(
    "exc",
    [
        groq.APITimeoutError(request=httpx.Request("GET", "https://api.groq.com")),
        _status_error(groq.InternalServerError, 503),
        _status_error(groq.RateLimitError, 429),
    ],
)
def test_unknown_when_the_probe_itself_fails(exc):
    with patch.object(gh, "_fetch_catalog", side_effect=exc):
        status, _ = gh.groq_status(_KEY)
    assert status == gh.UNKNOWN


def test_cache_hit_does_not_call_groq():
    with patch.object(gh, "_fetch_catalog", return_value=set(gh.REQUIRED_MODELS)) as fetch:
        gh.groq_status(_KEY)
        gh.groq_status(_KEY)
    assert fetch.call_count == 1


def test_expired_cache_reprobes():
    with (
        patch.object(gh, "_fetch_catalog", return_value=set(gh.REQUIRED_MODELS)) as fetch,
        patch.object(gh.time, "monotonic", side_effect=[0.0, gh._PROBE_TTL_SECONDS + 1, 0.0]),
    ):
        gh.groq_status(_KEY)
        gh.groq_status(_KEY)
    assert fetch.call_count == 2


def test_unknown_is_retried_sooner_than_a_verdict():
    assert gh._UNKNOWN_TTL_SECONDS < gh._PROBE_TTL_SECONDS
    with (
        patch.object(
            gh,
            "_fetch_catalog",
            side_effect=groq.APIConnectionError(
                request=httpx.Request("GET", "https://api.groq.com")
            ),
        ) as fetch,
        patch.object(gh.time, "monotonic", side_effect=[0.0, gh._UNKNOWN_TTL_SECONDS + 1, 0.0]),
    ):
        gh.groq_status(_KEY)
        gh.groq_status(_KEY)
    assert fetch.call_count == 2


def test_rotated_key_reprobes():
    with patch.object(gh, "_fetch_catalog", return_value=set(gh.REQUIRED_MODELS)) as fetch:
        gh.groq_status(_KEY)
        gh.groq_status("gsk_rotated")  # pragma: allowlist secret
    assert fetch.call_count == 2


def test_probe_client_is_bounded():
    """No retries and a short timeout, so an unresponsive Groq cannot hang /health."""
    with patch.object(gh, "Groq") as client_cls:
        client_cls.return_value.models.list.return_value.data = []
        _REAL_FETCH_CATALOG(_KEY)
    kwargs = client_cls.call_args.kwargs
    assert kwargs["max_retries"] == 0
    assert kwargs["timeout"] <= 5


# ---------------------------------------------------------------------------
# Through /health
# ---------------------------------------------------------------------------


def _get_health(client, mock_cursor):
    mock_cursor.fetchone.side_effect = list(_STATS)
    with patch.dict("os.environ", _REAL_KEYS):
        return client.get("/health")


def test_health_reports_a_decommissioned_model(client, mock_cursor):
    with patch.object(gh, "_fetch_catalog", return_value={gh.CLASSIFIER_MODEL}):
        resp = _get_health(client, mock_cursor)
    assert resp.status_code == 207
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["groq"] == "failing"
    assert gh.LLM_MODEL in data["groq_detail"]


def test_health_reports_a_rejected_key(client, mock_cursor):
    with patch.object(
        gh, "_fetch_catalog", side_effect=_status_error(groq.AuthenticationError, 401)
    ):
        resp = _get_health(client, mock_cursor)
    assert resp.status_code == 207
    assert resp.json()["groq"] == "failing"


def test_health_survives_a_groq_outage(client, mock_cursor):
    """A probe error is reported, never raised, and does not flip status."""
    with patch.object(gh, "_fetch_catalog", side_effect=RuntimeError("boom")):
        resp = _get_health(client, mock_cursor)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["groq"] == "unknown"
    assert data["groq_detail"] == "probe failed: RuntimeError"


def test_health_skips_the_probe_for_a_placeholder_key(client, mock_cursor):
    mock_cursor.fetchone.side_effect = list(_STATS)
    with (
        patch.object(gh, "_fetch_catalog") as fetch,
        patch.dict("os.environ", _PLACEHOLDER),
    ):
        resp = client.get("/health")
    fetch.assert_not_called()
    assert resp.json()["groq"] == "degraded"
