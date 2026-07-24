"""Unit tests for the quiz vote_id validation gate (MON-171)."""

from unittest.mock import MagicMock, patch

import pytest
import requests

from scripts.check_quiz_votes import missing_from_api, vote_exists_via_api


def _resp(status_code):
    resp = MagicMock()
    resp.status_code = status_code
    return resp


@patch("scripts.check_quiz_votes.time.sleep")
@patch("scripts.check_quiz_votes.requests.get")
def test_200_means_present(mock_get, _sleep):
    mock_get.return_value = _resp(200)
    assert vote_exists_via_api("https://api.example", "VT1") is True
    mock_get.assert_called_once()


@patch("scripts.check_quiz_votes.time.sleep")
@patch("scripts.check_quiz_votes.requests.get")
def test_404_means_missing_without_retry(mock_get, _sleep):
    mock_get.return_value = _resp(404)
    assert vote_exists_via_api("https://api.example", "VT1") is False
    mock_get.assert_called_once()


@patch("scripts.check_quiz_votes.time.sleep")
@patch("scripts.check_quiz_votes.requests.get")
def test_transient_errors_are_retried_until_success(mock_get, _sleep):
    mock_get.side_effect = [
        _resp(429),
        _resp(503),
        requests.ConnectionError("boom"),
        _resp(200),
    ]
    assert vote_exists_via_api("https://api.example", "VT1") is True
    assert mock_get.call_count == 4


@patch("scripts.check_quiz_votes.time.sleep")
@patch("scripts.check_quiz_votes.requests.get")
def test_retry_exhaustion_raises(mock_get, _sleep):
    mock_get.return_value = _resp(503)
    with pytest.raises(RuntimeError, match="HTTP 503"):
        vote_exists_via_api("https://api.example", "VT1")
    assert mock_get.call_count == 5


@patch("scripts.check_quiz_votes.time.sleep")
@patch("scripts.check_quiz_votes.requests.get")
def test_missing_from_api_collects_only_404s(mock_get, _sleep):
    from api.quiz_data import QUIZ_VOTE_IDS

    first = sorted(QUIZ_VOTE_IDS)[0]
    mock_get.side_effect = lambda url, timeout: _resp(404 if url.endswith(first) else 200)
    assert missing_from_api("https://api.example") == [first]
