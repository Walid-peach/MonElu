"""
scripts/export_openapi.py
Write the API's OpenAPI spec to the snapshot the iOS app generates its client
from (ADR-041 §4, #448).

The app's `MonEluAPI` package builds its Swift client from a committed copy of
`/openapi.json`, not from the live API, so a build never depends on the
network and an API change reaches the app only through a reviewed diff.
tests/unit/test_openapi_snapshot.py fails when the committed copy differs from
`api.main:app.openapi()`, so an API change without a refreshed snapshot fails
CI on every PR, iOS workflow or not.

The spec is built in-process from the FastAPI app: no server, no network, no
database.

The snapshot is the app's spec with one normalisation, `for_swift_generator`:
FastAPI writes every `Optional` field as `anyOf: [T, {"type": "null"}]`, and
Swift OpenAPI Generator does not support the `null` schema - it drops the whole
property, so a response would decode with most of its fields silently missing.
The normalisation removes the `null` member and takes the property out of
`required`, which Swift decodes with `decodeIfPresent`: an absent field and an
explicit `null` both become `nil`, exactly what the API means by either.

Usage:
    python scripts/export_openapi.py          # rewrite the snapshot
    python scripts/export_openapi.py --check  # exit 1 if it drifts
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from api.config import DEFAULT_FRONTEND_BASE_URL, frontend_base_url  # noqa: E402

DEFAULT_OUT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "ios"
    / "Packages"
    / "MonEluAPI"
    / "Sources"
    / "MonEluAPI"
    / "openapi.json"
)


def spec() -> dict:
    """The API's OpenAPI document, independent of the machine it is built on.

    The app description names the frontend origin, which `FRONTEND_BASE_URL`
    overrides per environment; it is written back to the default so the
    snapshot does not change with whoever exports it.
    """
    from api.main import app

    document = json.loads(json.dumps(app.openapi()))
    info = document["info"]
    info["description"] = info["description"].replace(
        frontend_base_url(), DEFAULT_FRONTEND_BASE_URL
    )
    return for_swift_generator(document)


NULL_SCHEMA = {"type": "null"}


def _admits_null(schema) -> bool:
    return isinstance(schema, dict) and NULL_SCHEMA in schema.get("anyOf", [])


def for_swift_generator(node):
    """`node` with every nullable `anyOf` rewritten as an optional field.

    Walks the whole document, since component schemas, parameters, bodies and
    nested items all use the same pattern. A single remaining `anyOf` member is
    inlined, keeping the node's own title, description and default beside it.
    """
    if isinstance(node, list):
        return [for_swift_generator(item) for item in node]
    if not isinstance(node, dict):
        return node

    properties = node.get("properties")
    nullable = (
        {name for name, schema in properties.items() if _admits_null(schema)}
        if isinstance(properties, dict)
        else set()
    )
    node = {key: for_swift_generator(value) for key, value in node.items()}

    if _admits_null(node):
        rest = [member for member in node.pop("anyOf") if member != NULL_SCHEMA]
        if len(rest) == 1:
            for key, value in rest[0].items():
                node.setdefault(key, value)
        else:
            node["anyOf"] = rest

    if nullable and "required" in node:
        node["required"] = [name for name in node["required"] if name not in nullable]
        if not node["required"]:
            del node["required"]
    return node


def render(document: dict) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def drifted(out: pathlib.Path) -> bool:
    """True when the committed snapshot differs from a fresh export."""
    return not out.exists() or out.read_text(encoding="utf-8") != render(spec())


def write(out: pathlib.Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(spec()), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 if the snapshot drifts")
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    if args.check:
        if drifted(args.out):
            print(
                f"{args.out} drifted from api.main:app.openapi(). "
                "Run `python scripts/export_openapi.py` and commit the result."
            )
            return 1
        print("OpenAPI snapshot is current.")
        return 0

    write(args.out)
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
