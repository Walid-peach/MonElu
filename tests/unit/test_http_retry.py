"""
Tests for download_with_retry in scripts/_http.py (MON-222):
permanent 4xx errors must not be retried, and the final RuntimeError must
carry the last HTTP status code instead of a bare "Failed to download".
"""

from unittest.mock import Mock, patch

import pytest
import requests

from scripts._http import download_with_retry


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
