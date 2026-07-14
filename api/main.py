"""
api/main.py
FastAPI application entry point for MonÉlu.
"""

import logging
import os
import threading
import time
import traceback
from contextlib import asynccontextmanager

import psycopg2.errors
import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

load_dotenv()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error tracking (MON-99) — no-ops safely when SENTRY_DSN is unset, so this
# is safe to leave in place before the Sentry project/DSN exists.
# ---------------------------------------------------------------------------
def _traces_sample_rate() -> float:
    raw = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")
    try:
        return float(raw)
    except ValueError:
        logger.warning(
            "⚠️  SENTRY_TRACES_SAMPLE_RATE=%r is not a valid float — defaulting to 0.1", raw
        )
        return 0.1


sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
    traces_sample_rate=_traces_sample_rate(),
)

# ---------------------------------------------------------------------------
# Startup secret validation — warn loudly if keys are missing or placeholder
# ---------------------------------------------------------------------------
_PLACEHOLDER_PREFIXES = ("sk-...", "gsk_...", "your-", "changeme")


def _is_placeholder(value: str | None) -> bool:
    return (
        not value
        or not value.strip()
        or any(value.strip().startswith(p) for p in _PLACEHOLDER_PREFIXES)
    )


def _warn_if_placeholder(var: str, value: str | None, *, context: str = "RAG features") -> None:
    if _is_placeholder(value):
        logger.warning("⚠️  %s is not set or looks like a placeholder — %s may fail", var, context)


_warn_if_placeholder("OPENAI_API_KEY", os.getenv("OPENAI_API_KEY"))
_warn_if_placeholder("GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
_warn_if_placeholder("DATABASE_URL", os.getenv("DATABASE_URL"), context="the API")

from starlette.concurrency import run_in_threadpool  # noqa: E402

from api.auth import API_KEY_HEADER, record_usage, resolve_api_key  # noqa: E402
from api.db import close_pool, get_conn, init_pool  # noqa: E402
from api.limiter import limiter  # noqa: E402
from rag.chain.sql_router import warm_pool as _warm_sql_pool  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    _warm_sql_pool()  # establish the SQL router connection pool at startup
    yield
    close_pool()


app = FastAPI(
    title="MonÉlu API",
    description="Civic data platform — French parliamentary votes and deputies.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clear 429 JSON response with Retry-After and rate-limit headers."""
    limit_item = exc.limit.limit
    retry_after = limit_item.GRANULARITY.seconds * (limit_item.multiples or 1)

    response = JSONResponse(
        status_code=429,
        content={
            "error": "Too Many Requests",
            "detail": f"Rate limit exceeded: {exc.detail}. Retry after {retry_after} seconds.",
        },
        headers={"Retry-After": str(retry_after)},
    )
    if hasattr(request.state, "view_rate_limit"):
        response = request.app.state.limiter._inject_headers(
            response, request.state.view_rate_limit
        )
    return response


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "status": 500},
    )


app.add_exception_handler(Exception, _unhandled_exception_handler)


# ---------------------------------------------------------------------------
# API key usage logging (MON-98) — only keyed requests touch the DB; anonymous
# traffic is unaffected. Both the key lookup (which can hit the DB on a cache
# miss) and the usage write run in the threadpool so neither ever blocks the
# event loop.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def _log_api_key_usage(request: Request, call_next):
    response = await call_next(request)
    record = await run_in_threadpool(resolve_api_key, request.headers.get(API_KEY_HEADER))
    if record:
        # Route template ("/deputies/{deputy_id}") once routing has resolved, so usage
        # aggregates per endpoint rather than fragmenting per resource id.
        route = request.scope.get("route")
        endpoint = route.path if route is not None else request.url.path
        await run_in_threadpool(record_usage, record.id, endpoint)
    return response


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
if not ALLOWED_ORIGINS:
    logger.warning(
        "⚠️  CORS_ORIGINS is not set — the allowlist is empty and ALL cross-origin "
        "requests will be blocked. Set CORS_ORIGINS (e.g. '*' or a comma-separated list)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
from api.routers import deputies, feedback, keys, votes  # noqa: E402
from api.routers.search import router as search_router  # noqa: E402
from api.routers.verify import router as verify_router  # noqa: E402

app.include_router(deputies.router, prefix="/deputies", tags=["Deputies"])
app.include_router(votes.router, prefix="/votes", tags=["Votes"])
app.include_router(search_router, prefix="/search", tags=["Search"])
app.include_router(verify_router, prefix="/verify", tags=["Verify"])
app.include_router(keys.router, prefix="/keys", tags=["API Keys"])
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])


# ---------------------------------------------------------------------------
# Cached DB stats — COUNT(*) is a full scan and the data changes once a day,
# so /health reads one snapshot refreshed at most every 60s.
# ---------------------------------------------------------------------------
_STATS_TTL_SECONDS = 60.0
_stats_lock = threading.Lock()
_stats_cache: dict | None = None
_stats_cached_at = 0.0


def _get_db_stats() -> dict:
    """Return counts, last ingestion, and mart row counts; raises if the DB is down.

    Keys: deputies, votes, positions, last_ingestion, mart_scorecards,
    mart_vote_summaries (mart keys are None when the marts are absent).
    """
    global _stats_cache, _stats_cached_at
    with _stats_lock:
        if _stats_cache is not None and time.monotonic() - _stats_cached_at < _STATS_TTL_SECONDS:
            return _stats_cache

    stats: dict = {"mart_scorecards": None, "mart_vote_summaries": None}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM deputies)        AS deputies,
                    (SELECT COUNT(*) FROM votes)           AS votes,
                    (SELECT COUNT(*) FROM vote_positions)  AS positions,
                    (SELECT MAX(voted_at) FROM votes)      AS last_vote
                """
            )
            row = cur.fetchone()
            stats.update(
                {
                    "deputies": row["deputies"],
                    "votes": row["votes"],
                    "positions": row["positions"],
                    "last_ingestion": row["last_vote"].isoformat() if row["last_vote"] else None,
                }
            )
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM analytics_marts.mart_deputy_scorecard")
                stats["mart_scorecards"] = cur.fetchone()["count"]
                cur.execute("SELECT COUNT(*) FROM analytics_marts.mart_vote_summary")
                stats["mart_vote_summaries"] = cur.fetchone()["count"]
        except psycopg2.errors.UndefinedTable:
            conn.rollback()
        except Exception as exc:
            conn.rollback()
            logger.warning("Stats mart check error: %s", exc)

    with _stats_lock:
        _stats_cache = stats
        _stats_cached_at = time.monotonic()
    return stats


@app.get("/", include_in_schema=False)
def landing() -> RedirectResponse:
    return RedirectResponse(url="https://mon-elu.vercel.app", status_code=307)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
def health() -> JSONResponse:
    services: dict[str, str] = {}
    stats: dict = {}
    try:
        # Liveness stays uncached so a dead DB is reported immediately; the
        # COUNT(*) snapshot comes from the shared 60s cache.
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        services["db"] = "ok"
        stats = _get_db_stats()
        services["dbt_marts"] = "ok" if stats["mart_scorecards"] is not None else "degraded"
    except Exception as exc:
        logger.error("Health check DB error: %s", exc)
        services["db"] = "degraded"
        services["dbt_marts"] = "degraded"

    services["openai"] = "degraded" if _is_placeholder(os.getenv("OPENAI_API_KEY")) else "ok"
    services["groq"] = "degraded" if _is_placeholder(os.getenv("GROQ_API_KEY")) else "ok"

    # all_ok excludes dbt_marts — marts are absent on every fresh deploy and
    # degrade gracefully; their absence should not trip Railway's health check.
    all_ok = all(v == "ok" for k, v in services.items() if k != "dbt_marts")

    body: dict = {"status": "ok" if all_ok else "degraded", **services}
    if services["db"] == "ok":
        body.update(
            {
                "last_ingestion": stats["last_ingestion"],
                "deputies": stats["deputies"],
                "votes": stats["votes"],
                "positions": stats["positions"],
            }
        )
    if services["dbt_marts"] == "ok":
        body.update(
            {
                "mart_scorecards": stats["mart_scorecards"],
                "mart_vote_summaries": stats["mart_vote_summaries"],
            }
        )

    return JSONResponse(content=body, status_code=200 if all_ok else 207)
