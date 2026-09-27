"""
api/cache_headers.py
`Cache-Control` for public reads (ADR-041 §5, #438).

The website never sends one request per visitor to this API: Vercel serves
ISR-cached pages. A native app would, so without a shared cache every launch,
scroll and pull-to-refresh reaches Railway and a free-tier Postgres. Public data
changes at most once a day, which makes it safe to let a CDN in front of the API
and the app's own URLCache keep a response for a few minutes.

The header is added only where it cannot leak or stale something that matters:

* successful (2xx) `GET` responses - never an error, a 429 or a redirect;
* never on a route that depends on who is calling (`/account/*`, `/keys/*`)
  or that reports live state (`/health`);
* never over a `Cache-Control` a handler set itself.

The short `max-age` is deliberate. No CDN purges it yet: until the API is served
from a CDN wired to the ingestion scope (#433), a few minutes of staleness after
the morning ingestion is the whole cost, and it applies equally to browsers
calling the API directly.
"""

from starlette.requests import Request

PUBLIC_CACHE_CONTROL = "public, max-age=300"

# Path prefixes whose responses depend on the caller or on live state.
UNCACHEABLE_PREFIXES = ("/account", "/keys", "/health")


def is_cacheable(method: str, path: str, status_code: int) -> bool:
    """Whether a response may carry PUBLIC_CACHE_CONTROL."""
    if method != "GET" or not 200 <= status_code < 300:
        return False
    return not any(
        path == prefix or path.startswith(prefix + "/") for prefix in UNCACHEABLE_PREFIXES
    )


async def add_public_cache_control(request: Request, call_next):
    """HTTP middleware: mark cacheable public reads, leave everything else alone."""
    response = await call_next(request)
    if "cache-control" not in response.headers and is_cacheable(
        request.method, request.url.path, response.status_code
    ):
        response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return response
