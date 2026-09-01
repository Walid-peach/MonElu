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
from api.config import frontend_base_url  # noqa: E402
from api.db import close_pool, get_conn, init_pool  # noqa: E402
from api.limiter import limiter  # noqa: E402
from rag.chain.sql_router import warm_pool as _warm_sql_pool  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    _warm_sql_pool()  # establish the SQL router connection pool at startup
    yield
    close_pool()


# The spec at /openapi.json is what ChatGPT Actions, MCP-over-OpenAPI bridges
# and generic tool-calling frameworks read to decide whether and how to call
# this API (MON-260). Everything below is written for that reader: the four
# things a model gets wrong unaided are the data horizon, the nonVotant vs
# abstention distinction, what presence_rate actually counts, and the offset
# ceiling. State them here rather than assuming an endpoint description will.
API_DESCRIPTION = """\
The complete voting record of every deputy in the French Assemblée nationale,
17th legislature (elected 2024-07-07). Data comes from the Assemblée's own open
data exports, is refreshed every weekday morning, and is served here as JSON.

**Data horizon.** Production holds scrutins from **2025-07-01** onward, not from
the start of the legislature. A question about an earlier vote has no answer in
this dataset - say so rather than inferring one. Deputy profiles cover all 577
seats regardless of that horizon.

**`position` has four values, and two of them are not the same thing.**
`pour`, `contre`, `abstention`, and `nonVotant`. An `abstention` is a formal,
deliberate abstention cast in the chamber. A `nonVotant` did not cast anything
on that scrutin. Never report a `nonVotant` as an abstention, and never add the
two together.

**`presence_rate` counts `nonVotant` as present.** It is
`(total_votes - nonVotant) / total_votes` over the scrutins held during the
deputy's mandate - a measure of votes cast, not of attendance in the hemicycle.
Two deputies with the same presence_rate can have very different attendance.
For participation in the votes that matter most politically, prefer
`solennel_participation_rate`; for spread across sitting days, `voting_days_rate`.
The Présidente de l'Assemblée shows 100% presence by design - she appears on
every scrutin.

**Pagination.** `offset` is capped at 2000 on `/deputies` and `/votes` (not on
`/themes/{slug}`). To walk past that ceiling on `/votes`, page with the opaque
`next_cursor` returned by each response (`?before=<cursor>`), which has no depth
limit; `/deputies` has no cursor, but 577 seats fit inside the ceiling anyway.

**Rates are 0-1 floats, not percentages.** `0.87` means 87%.

Methodology, definitions and known caveats: {frontend}/methodologie
Data licence: Licence Ouverte / Open Licence 2.0 (Etalab 2.0), attribution required.
"""

# One entry per include_router() tag below. Order here is the order the spec
# renders in, so the endpoints an agent reaches for first come first.
OPENAPI_TAGS = [
    {
        "name": "Deputies",
        "description": (
            "Deputy profiles, voting records and computed scorecards. Start here to "
            "answer anything about one named person."
        ),
    },
    {
        "name": "Votes",
        "description": (
            "Scrutins (recorded votes): outcome, tallies, plain-French summary, and "
            "the per-deputy breakdown. Start here to answer anything about one bill "
            "or one vote."
        ),
    },
    {
        "name": "Groups",
        "description": (
            "Parliamentary groups: roster, cohesion, and the votes that split the "
            "group hardest. Group membership is the deputy's current group only."
        ),
    },
    {
        "name": "Departments",
        "description": "Deputies by département, with local aggregates and split votes.",
    },
    {
        "name": "Themes",
        "description": (
            "Votes grouped by policy theme, with per-group positioning. Themes are "
            "assigned by MonÉlu, not by the Assemblée."
        ),
    },
    {
        "name": "Agenda",
        "description": (
            "Upcoming séance publique sittings. Forward-looking and volatile - items "
            "are cancelled and rescheduled routinely."
        ),
    },
    {
        "name": "Search",
        "description": (
            "Natural-language question answering over the corpus (RAG). Costs an LLM "
            "call; prefer the structured endpoints when the question maps onto one."
        ),
    },
    {
        "name": "Verify",
        "description": "Fact-check a claim about how a deputy voted, with citations.",
    },
    {
        "name": "Quiz",
        "description": (
            'The "which deputy votes like you" questionnaire and its stateless '
            "matching. Question content is curated, not derived from the database."
        ),
    },
    {
        "name": "API Keys",
        "description": "Usage accounting for an issued API key.",
    },
    {
        "name": "Feedback",
        "description": "User-submitted feedback sinks. Write-only.",
    },
    {
        "name": "Health",
        "description": (
            "Service status and data freshness. Check this before trusting a stale answer."
        ),
    },
]

app = FastAPI(
    title="MonÉlu API",
    description=API_DESCRIPTION.format(frontend=frontend_base_url()),
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
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
from api.routers import (  # noqa: E402
    agenda,
    departments,
    deputies,
    feedback,
    groups,
    keys,
    quiz,
    themes,
    votes,
)
from api.routers.search import router as search_router  # noqa: E402
from api.routers.verify import router as verify_router  # noqa: E402

app.include_router(deputies.router, prefix="/deputies", tags=["Deputies"])
app.include_router(departments.router, prefix="/departments", tags=["Departments"])
app.include_router(groups.router, prefix="/groups", tags=["Groups"])
app.include_router(themes.router, prefix="/themes", tags=["Themes"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])
app.include_router(votes.router, prefix="/votes", tags=["Votes"])
app.include_router(search_router, prefix="/search", tags=["Search"])
app.include_router(verify_router, prefix="/verify", tags=["Verify"])
app.include_router(keys.router, prefix="/keys", tags=["API Keys"])
app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
app.include_router(agenda.router, prefix="/agenda", tags=["Agenda"])


# ---------------------------------------------------------------------------
# Cached DB stats — COUNT(*) is a full scan and the data changes once a day,
# so /health reads one snapshot refreshed at most every 60s.
# ---------------------------------------------------------------------------
_STATS_TTL_SECONDS = 60.0
# MON-225: Supabase free tier caps the DB at 500 MB; warn with headroom to act.
_DB_SIZE_WARN_MB = 400
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
                    (SELECT MAX(voted_at) FROM votes)      AS last_vote,
                    pg_database_size(current_database())   AS db_size_bytes
                """
            )
            row = cur.fetchone()
            stats.update(
                {
                    "deputies": row["deputies"],
                    "votes": row["votes"],
                    "positions": row["positions"],
                    "last_ingestion": row["last_vote"].isoformat() if row["last_vote"] else None,
                    # MON-225: Supabase free tier caps the DB at 500 MB.
                    "db_size_mb": round(row["db_size_bytes"] / (1024 * 1024), 1),
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
    return RedirectResponse(url=frontend_base_url(), status_code=307)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get(
    "/health",
    tags=["Health"],
    summary="Service health, record counts, and data freshness",
)
def health() -> JSONResponse:
    """Liveness plus the numbers that say whether the data behind it is current.

    `last_ingestion` is the timestamp of the most recent successful ingestion run
    - the honest answer to "how fresh is this data". The pipeline runs on weekday
    mornings, so a value from yesterday is normal and one from last week is not.

    `services.dbt_marts` reports `degraded` when the analytics layer is missing.
    The API stays up in that state, but the scorecard, alignment and vote-summary
    endpoints return 503 and the group and department pages serve null rates.

    Returns 200 when the database is reachable and 503 when it is not; the body
    has the same shape either way.
    """
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
                # MON-225: Supabase free tier caps the DB at 500 MB; the daily
                # ingestion workflow polls this to alert before writes start failing.
                "db_size_mb": stats["db_size_mb"],
                "db_size_warning": stats["db_size_mb"] >= _DB_SIZE_WARN_MB,
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
