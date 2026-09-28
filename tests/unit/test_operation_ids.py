"""
Pins the OpenAPI operationIds (ADR-041 §5, #438).

Generated clients - the iOS app's Swift OpenAPI Generator, ChatGPT Actions,
MCP-over-OpenAPI bridges - turn each operationId into a method name. FastAPI's
default (`list_deputies_deputies__get`) made those names unusable, and it also
changes whenever a path or method does. They are now the handler's own name in
camelCase, which only changes when someone renames a handler.

So a failure here means one of two things: a new handler reuses an existing
name (FastAPI would only warn and emit a duplicate id, which breaks generated
clients), or a handler was renamed, which is an API change for every generated
client and needs ADR-041 §5's add-first sequence rather than a silent rename.
"""

import re

import pytest

from api.main import _operation_id, app

_CAMEL = re.compile(r"[a-z][a-zA-Z0-9]*")


def _operation_ids() -> list[str]:
    return [
        operation["operationId"]
        for methods in app.openapi()["paths"].values()
        for method, operation in methods.items()
        if method not in {"head", "options"}
    ]


def test_operation_ids_are_unique():
    ids = _operation_ids()
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    assert not duplicates, f"handlers share a name, so their operationIds collide: {duplicates}"


def test_operation_ids_are_camel_case():
    bad = [i for i in _operation_ids() if not _CAMEL.fullmatch(i)]
    assert not bad, f"not camelCase: {bad}"


@pytest.mark.parametrize(
    "handler_name, expected",
    [
        ("list_deputies", "listDeputies"),
        ("export_scorecards_csv", "exportScorecardsCsv"),
        ("health", "health"),
        ("get_app_config", "getAppConfig"),
    ],
)
def test_operation_id_is_the_handler_name_in_camel_case(handler_name, expected):
    class _Route:
        name = handler_name

    assert _operation_id(_Route()) == expected


def test_known_operations_keep_their_names():
    """A few ids generated clients already depend on. Renaming one of these
    handlers is a breaking change - see the module docstring."""
    ids = set(_operation_ids())
    for expected in ("listDeputies", "getDeputy", "getVote", "getAppConfig", "getMyProfile"):
        assert expected in ids
