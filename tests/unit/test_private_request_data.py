"""What a visitor sends stays out of logs and Sentry (docs/app-store/app-privacy.md).

A question, a claim, quiz answers, a location or the followed deputies must not
reach the Railway logs or a Sentry event: /confidentialite and the iPhone app's
privacy manifest both say so.
"""

import logging
from unittest.mock import patch

import pytest

from api.main import _drop_private_request_data, _DropQueryString

TYPED_TEXT = "ma question très personnelle"


def test_sentry_event_keeps_method_and_path_only():
    event = {
        "request": {
            "method": "GET",
            "url": "https://api.example/feed?deputies=PA1&theme=sante",
            "query_string": "deputies=PA1&theme=sante",
            "data": {"question": TYPED_TEXT},
            "cookies": {"a": "b"},
        }
    }
    request = _drop_private_request_data(event, None)["request"]
    assert request == {"method": "GET", "url": "https://api.example/feed"}


def test_sentry_event_without_request_is_untouched():
    event = {"message": "boom"}
    assert _drop_private_request_data(event, None) == {"message": "boom"}


def test_sentry_sdk_reads_no_body_and_no_locals():
    import sentry_sdk

    options = sentry_sdk.get_client().options
    assert options["max_request_body_size"] == "never"
    assert options["include_local_variables"] is False
    assert options["send_default_pii"] is False


def _access_record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        0,
        '%s - "%s %s HTTP/%s" %d',
        ("1.2.3.4:5678", "GET", path, "1.1", 200),
        None,
    )


def test_access_log_drops_the_query_string():
    record = _access_record("/feed?deputies=PA1&deputies=PA2&theme=sante")
    assert _DropQueryString().filter(record) is True
    assert record.getMessage() == '1.2.3.4:5678 - "GET /feed HTTP/1.1" 200'


def test_access_log_filter_is_installed():
    filters = logging.getLogger("uvicorn.access").filters
    assert any(isinstance(f, _DropQueryString) for f in filters)


def test_access_log_filter_leaves_other_records_alone():
    record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 0, "plain", None, None)
    assert _DropQueryString().filter(record) is True
    assert record.getMessage() == "plain"


@pytest.mark.parametrize(
    ("path", "target", "payload"),
    [
        ("/search/", "api.routers.search.ask", {"question": TYPED_TEXT}),
        ("/verify/", "api.routers.verify.verify_claim", {"claim": TYPED_TEXT}),
    ],
)
def test_pipeline_error_log_does_not_name_the_text(client, caplog, path, target, payload):
    with patch(target, side_effect=RuntimeError("pipeline down")):
        with caplog.at_level(logging.ERROR):
            resp = client.post(path, json=payload)
    assert resp.status_code == 500
    assert caplog.records, "the error is still logged"
    for record in caplog.records:
        assert TYPED_TEXT not in record.getMessage()
