"""
Tests for the retry helpers in scripts/_http.py.

download_with_retry (MON-222): permanent 4xx errors must not be retried, and the
final RuntimeError must carry the last HTTP status code instead of a bare
"Failed to download".

connect_with_retry (MON-255): transient proxy drops must be absorbed, and every
ingest script must go through the helper rather than psycopg2.connect directly.
"""

from pathlib import Path
from unittest.mock import Mock, patch

import psycopg2
import pytest
import requests

from scripts._http import connect_with_retry, download_with_retry

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"


def _response(status_code: int) -> Mock:
    resp = Mock(spec=requests.Response)
    resp.status_code = status_code
    resp.content = b"payload"
    if status_code >= 400:
        error = requests.HTTPError(f"{status_code} error")
        error.response = resp
        resp.raise_for_status = Mock(side_effect=error)
    else:
        resp.raise_for_status = Mock()
    return resp


class TestDownloadWithRetryPermanentErrors:
    def test_404_raises_immediately_without_retrying(self):
        with patch("scripts._http.requests.get", return_value=_response(404)) as mock_get:
            with pytest.raises(RuntimeError, match="HTTP 404"):
                download_with_retry("https://example.com/missing.zip")
        assert mock_get.call_count == 1

    def test_403_raises_immediately_without_retrying(self):
        with patch("scripts._http.requests.get", return_value=_response(403)) as mock_get:
            with pytest.raises(RuntimeError, match="HTTP 403"):
                download_with_retry("https://example.com/forbidden.zip")
        assert mock_get.call_count == 1


class TestDownloadWithRetryTransientErrors:
    def test_429_retries_then_raises_with_last_status(self):
        with patch("scripts._http.requests.get", return_value=_response(429)) as mock_get:
            with patch("scripts._http.time.sleep"):
                with pytest.raises(RuntimeError, match="last status: 429"):
                    download_with_retry("https://example.com/rate-limited.zip")
        assert mock_get.call_count == 5

    def test_500_retries_then_raises_with_last_status(self):
        with patch("scripts._http.requests.get", return_value=_response(500)) as mock_get:
            with patch("scripts._http.time.sleep"):
                with pytest.raises(RuntimeError, match="last status: 500"):
                    download_with_retry("https://example.com/server-error.zip")
        assert mock_get.call_count == 5

    def test_success_after_transient_failure(self):
        with patch(
            "scripts._http.requests.get",
            side_effect=[_response(500), _response(200)],
        ):
            with patch("scripts._http.time.sleep"):
                assert download_with_retry("https://example.com/ok.zip") == b"payload"

    def test_network_error_with_no_response_is_retried_not_raised_immediately(self):
        with patch(
            "scripts._http.requests.get",
            side_effect=requests.ConnectionError("connection refused"),
        ) as mock_get:
            with patch("scripts._http.time.sleep"):
                with pytest.raises(RuntimeError, match="Failed to download"):
                    download_with_retry("https://example.com/unreachable.zip")
        assert mock_get.call_count == 5


class TestConnectWithRetry:
    """connect_with_retry is what absorbs a PgBouncer drop mid-run (MON-255)."""

    def test_retries_operational_errors_then_raises(self):
        with patch(
            "scripts._http.psycopg2.connect",
            side_effect=psycopg2.OperationalError("server closed the connection"),
        ) as mock_connect:
            with patch("scripts._http.time.sleep"):
                with pytest.raises(RuntimeError, match="Could not connect to DB"):
                    connect_with_retry("postgresql://x/y")
        assert mock_connect.call_count == 5

    def test_succeeds_after_a_transient_drop(self):
        conn = Mock()
        with patch(
            "scripts._http.psycopg2.connect",
            side_effect=[psycopg2.OperationalError("proxy drop"), conn],
        ):
            with patch("scripts._http.time.sleep"):
                assert connect_with_retry("postgresql://x/y") is conn


class TestIngestScriptsUseConnectWithRetry:
    """Drift guard (MON-255).

    ingest_deputies and ingest_votes are `critical=True` steps in
    run_ingestion_prod.py - their failure aborts the whole daily run, including
    the RAG rebuild, dbt and the monitoring probes downstream. They connected
    with a bare psycopg2.connect() while the two *tolerated* steps retried, so a
    single 06:00 UTC proxy reset took the pipeline down. Assert on the source so
    the next ingest script cannot quietly reintroduce the unprotected connect.
    """

    INGEST_MODULES = [
        "ingest_deputies.py",
        "ingest_votes.py",
        "ingest_positions.py",
        "ingest_agenda.py",
    ]

    @pytest.mark.parametrize("module", INGEST_MODULES)
    def test_no_bare_psycopg2_connect(self, module):
        source = (SCRIPTS_DIR / module).read_text(encoding="utf-8")
        assert "psycopg2.connect(" not in source, (
            f"{module} opens a connection without retry - use connect_with_retry() "
            "from scripts._http so a transient proxy drop does not abort ingestion."
        )

    @pytest.mark.parametrize("module", INGEST_MODULES)
    def test_imports_connect_with_retry(self, module):
        source = (SCRIPTS_DIR / module).read_text(encoding="utf-8")
        assert "connect_with_retry" in source, f"{module} does not use connect_with_retry"
