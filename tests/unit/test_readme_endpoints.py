"""Keep the README's API Endpoints tables honest.

The README drifted badly once already: 13 documented endpoints against ~32
real ones, and a rate-limit scheme ("30 req/min global, keyed by IP") that
the code had stopped implementing. Prose can't be type-checked, but that
table can — every row names a real path, a real method, and a real
per-minute limit, so all three are checkable against the app itself.

This fails when someone adds, removes, or re-limits an endpoint without
touching the README. The fix is to edit the README, not to loosen the test.

Deliberately built on public API surface only: `app.openapi()` for the path
list and `APIRouter.routes` for the endpoint functions. FastAPI's internal
route tree changed shape in 0.139 (routers became opaque `_IncludedRouter`
objects), so walking `app.routes` is not portable across versions.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest

from api.limiter import limiter
from api.main import app
from api.routers import (
    agenda,
    departments,
    deputies,
    feedback,
    groups,
    keys,
    quiz,
    search,
    themes,
    verify,
    votes,
)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
README = os.path.join(ROOT, "README.md")

# Mirrors the app.include_router() calls in api/main.py. Duplicated on
# purpose: test_router_prefixes_are_current below asserts that the paths
# reconstructed from this map are exactly the app's real paths, so a prefix
# changed in main.py fails here rather than silently skipping endpoints.
ROUTER_PREFIXES = [
    ("/deputies", deputies.router),
    ("/departments", departments.router),
    ("/groups", groups.router),
    ("/themes", themes.router),
    ("/quiz", quiz.router),
    ("/votes", votes.router),
    ("/search", search.router),
    ("/verify", verify.router),
    ("/keys", keys.router),
    ("/feedback", feedback.router),
    ("/agenda", agenda.router),
]

# Routes kept out of the OpenAPI schema but still worth documenting for a
# human reader. `GET /` is include_in_schema=False (it only redirects to the
# frontend), so it can never show up in app.openapi().
SCHEMA_EXEMPT = {("GET", "/")}

# Endpoints defined on the app itself rather than on a router.
APP_LEVEL = {("GET", "/health"): None}

_ROW = re.compile(
    r"^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|",
    re.MULTILINE,
)


def _normalise(path: str) -> str:
    """`/deputies/{id}` and `/deputies/{deputy_id}/` compare equal.

    The README uses reader-friendly parameter names; FastAPI uses the
    handler's argument names. Only the shape is being compared.
    """
    path = re.sub(r"\{[^}]*\}", "{}", path)
    return path.rstrip("/") or "/"


def _api_endpoints_section() -> str:
    """Text between `## API Endpoints` and the next top-level heading.

    Scoped deliberately: other tables in the README ("What FastAPI reads",
    the frontend route map) reference paths in prose form and are not
    machine-checkable.
    """
    with open(README, encoding="utf-8") as fh:
        text = fh.read()

    start = text.index("## API Endpoints")
    return text[start : text.index("\n## ", start + 1)]


def _documented() -> dict[tuple[str, str], str]:
    """{(METHOD, path): rpm cell} for every row of the API Endpoints tables."""
    rows = _ROW.findall(_api_endpoints_section())
    assert rows, "no endpoint rows parsed from the README — has the table format changed?"

    documented: dict[tuple[str, str], str] = {}
    for method, path, rpm in rows:
        key = (method, _normalise(path))
        assert key not in documented, f"{method} {path} is listed twice in the README"
        documented[key] = rpm.strip()
    return documented


def _schema_endpoints() -> set[tuple[str, str]]:
    """{(METHOD, path)} straight out of the OpenAPI schema."""
    return {
        (method.upper(), _normalise(path))
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method.upper() not in {"HEAD", "OPTIONS"}
    }


def _endpoint_functions() -> dict[tuple[str, str], object]:
    """{(METHOD, path): handler} reconstructed from the routers."""
    functions: dict[tuple[str, str], object] = dict(APP_LEVEL)
    for prefix, router in ROUTER_PREFIXES:
        for route in router.routes:
            for method in route.methods - {"HEAD", "OPTIONS"}:
                functions[(method, _normalise(prefix + route.path))] = route.endpoint
    return functions


def _configured_rpm(handler) -> int | None:
    """The per-minute limit slowapi applies to `handler` for anonymous callers.

    slowapi keeps dynamic limits in a private dict keyed by module and
    function name, and hides the provider behind a name-mangled attribute.
    Both are internals, so a library upgrade that moves them raises here
    instead of quietly reporting "no limit" and letting the README drift.
    """
    if handler is None:
        return None

    limits = limiter._dynamic_route_limits.get(f"{handler.__module__}.{handler.__name__}")
    if not limits:
        return None

    provider = getattr(limits[0], "_LimitGroup__limit_provider", None)
    assert provider is not None, (
        "cannot read the limit provider off slowapi's LimitGroup — the library's "
        "internals changed; update _configured_rpm()"
    )

    # Any key that isn't an "apikey:" bucket exercises tiered_limit()'s
    # anonymous branch, which is the limit the README documents.
    limit = provider("203.0.113.1")
    match = re.fullmatch(r"(\d+)/minute", limit)
    assert match, f"unexpected limit string {limit!r}"
    return int(match.group(1))


def _schema_operations() -> dict[tuple[str, str], dict]:
    """{(METHOD, path): operation object} straight out of the OpenAPI schema."""
    return {
        (method.upper(), path): operation
        for path, operations in app.openapi()["paths"].items()
        for method, operation in operations.items()
        if method.upper() not in {"HEAD", "OPTIONS"}
    }


@pytest.mark.parametrize("key", sorted(_schema_operations()))
def test_every_endpoint_is_described_in_the_spec(key):
    """/openapi.json is the tool spec agents read — an undescribed route is unusable.

    15 of 32 routes once shipped with neither a summary nor a docstring (MON-260),
    which left an agent reading the spec with a function name and a response
    schema it could not interpret. FastAPI takes `summary` from the decorator and
    `description` from the handler's docstring, so both are cheap to keep and
    invisible when they rot — hence this test rather than a review habit.

    Fix a failure by writing the docstring, not by loosening the threshold: the
    docstring is the agent-facing manual for that endpoint, so it should say what
    the endpoint returns, in what units, and which domain caveat applies.
    """
    operation = _schema_operations()[key]
    method, path = key

    summary = (operation.get("summary") or "").strip()
    description = (operation.get("description") or "").strip()

    assert summary, f"{method} {path} has no summary — add summary=... to its @router decorator"
    assert description, f"{method} {path} has no description — add a docstring to its handler"
    # A bare restatement of the path helps nobody; require a real sentence.
    assert len(description) >= 60, (
        f"{method} {path} has a {len(description)}-character description, which is "
        "too short to carry the units and caveats an agent needs"
    )


def test_router_prefixes_are_current():
    """Guards ROUTER_PREFIXES against drift in api/main.py."""
    reconstructed = set(_endpoint_functions())
    schema = _schema_endpoints()

    assert reconstructed == schema, (
        "ROUTER_PREFIXES no longer matches the app's mounted routes — update it "
        f"to mirror api/main.py.\nOnly in ROUTER_PREFIXES: {sorted(reconstructed - schema)}\n"
        f"Only in the app: {sorted(schema - reconstructed)}"
    )


def test_readme_documents_every_endpoint():
    missing = sorted(_schema_endpoints() - set(_documented()))
    assert not missing, "endpoints missing from the README API Endpoints tables: " + ", ".join(
        f"{m} {p}" for m, p in missing
    )


def test_readme_documents_no_phantom_endpoints():
    stale = sorted(set(_documented()) - _schema_endpoints() - SCHEMA_EXEMPT)
    assert not stale, "README documents endpoints that no longer exist: " + ", ".join(
        f"{m} {p}" for m, p in stale
    )


@pytest.mark.parametrize("key", sorted(_schema_endpoints()))
def test_readme_rate_limits_match_the_code(key):
    documented = _documented().get(key)
    if documented is None:
        pytest.skip("covered by test_readme_documents_every_endpoint")

    method, path = key
    actual = _configured_rpm(_endpoint_functions().get(key))

    if actual is None:
        assert documented == "-", (
            f"{method} {path} has no rate limit, but the README claims {documented!r}"
        )
        return

    assert documented == str(actual), (
        f"{method} {path} is limited to {actual}/min, but the README says {documented!r}"
    )
