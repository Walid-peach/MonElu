"""
The iOS app generates its API client from a committed OpenAPI snapshot
(ADR-041 §4, #448). An API change that does not refresh the snapshot would ship
an app built against the old contract, so this fails first - on every PR,
whether or not the iOS workflow runs.

Fix a failure by running `python scripts/export_openapi.py` and committing the
result, never by editing the JSON by hand.
"""

import json

from api.config import DEFAULT_FRONTEND_BASE_URL
from scripts.export_openapi import DEFAULT_OUT, for_swift_generator, main, render, spec, write


def test_committed_snapshot_matches_the_app():
    assert main(["--check"]) == 0, (
        "ios/.../openapi.json is stale: run `python scripts/export_openapi.py`"
    )


def test_check_fails_when_an_operation_changes(tmp_path):
    out = tmp_path / "openapi.json"
    write(out)
    assert main(["--check", "--out", str(out)]) == 0

    document = json.loads(out.read_text(encoding="utf-8"))
    operation = document["paths"]["/app/config"]["get"]
    operation["operationId"] = "renamedHandler"
    out.write_text(render(document), encoding="utf-8")

    assert main(["--check", "--out", str(out)]) == 1


def test_check_fails_when_a_schema_changes(tmp_path):
    out = tmp_path / "openapi.json"
    write(out)
    document = json.loads(out.read_text(encoding="utf-8"))
    del document["components"]["schemas"]["AppConfig"]["properties"]["min_ios_version"]
    out.write_text(render(document), encoding="utf-8")

    assert main(["--check", "--out", str(out)]) == 1


def test_check_fails_when_the_snapshot_is_missing(tmp_path):
    assert main(["--check", "--out", str(tmp_path / "absent.json")]) == 1


def test_snapshot_does_not_depend_on_the_frontend_origin(monkeypatch):
    """The app description names the frontend origin, which Railway overrides;
    the snapshot must be the same on every machine."""
    baseline = render(spec())
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://example.test")
    import api.main

    monkeypatch.setattr(api.main.app, "openapi_schema", None)
    monkeypatch.setattr(
        api.main.app,
        "description",
        api.main.app.description.replace(DEFAULT_FRONTEND_BASE_URL, "https://example.test"),
    )
    assert render(spec()) == baseline


def test_snapshot_lives_in_the_generator_target():
    """Swift OpenAPI Generator's build plugin reads the spec from the target's
    own source directory, next to its config file."""
    assert DEFAULT_OUT.parent.name == "MonEluAPI"
    assert (DEFAULT_OUT.parent / "openapi-generator-config.yaml").exists()


def test_nullable_union_becomes_an_optional_field():
    """Swift OpenAPI Generator drops any property whose anyOf contains the
    `null` schema, so the snapshot must carry none (#448)."""
    schema = {
        "type": "object",
        "properties": {
            "vote_id": {"type": "string"},
            "result": {"anyOf": [{"type": "string"}, {"type": "null"}], "title": "Result"},
            "stats": {"anyOf": [{"$ref": "#/components/schemas/Stats"}, {"type": "null"}]},
            "id": {"anyOf": [{"type": "integer"}, {"type": "string"}]},
        },
        "required": ["vote_id", "result"],
    }
    assert for_swift_generator(schema) == {
        "type": "object",
        "properties": {
            "vote_id": {"type": "string"},
            "result": {"type": "string", "title": "Result"},
            "stats": {"$ref": "#/components/schemas/Stats"},
            "id": {"anyOf": [{"type": "integer"}, {"type": "string"}]},
        },
        # A nullable field leaves `required`: Swift's decodeIfPresent reads an
        # explicit null as nil, which a required non-optional field cannot.
        "required": ["vote_id"],
    }


def test_nullable_query_parameter_is_normalised():
    parameter = {
        "name": "since",
        "in": "query",
        "required": False,
        "schema": {"anyOf": [{"type": "string", "format": "date"}, {"type": "null"}]},
    }
    assert for_swift_generator(parameter)["schema"] == {"type": "string", "format": "date"}


def test_committed_snapshot_carries_no_null_schema():
    assert '"type": "null"' not in DEFAULT_OUT.read_text(encoding="utf-8")
