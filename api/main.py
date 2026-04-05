"""
api/main.py
FastAPI application entry point for MonÉlu.
"""

import logging
import os
import re
import traceback

import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

from api.limiter import limiter

load_dotenv()

app = FastAPI(
    title="MonÉlu API",
    description="Civic data platform — French parliamentary votes and deputies.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# Rate limiting — global 60 req/min per IP; scorecard gets its own 10 req/min
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clear 429 JSON response with Retry-After and rate-limit headers."""
    detail = str(exc.detail)
    retry_after = 60  # safe upper bound; refined below
    match = re.search(r"per (\d+) (second|minute|hour)", detail)
    if match:
        num, unit = int(match.group(1)), match.group(2)
        retry_after = num * {"second": 1, "minute": 60, "hour": 3600}[unit]

    response = JSONResponse(
        status_code=429,
        content={
            "error": "Too Many Requests",
            "detail": f"Rate limit exceeded: {detail}. Retry after {retry_after} seconds.",
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
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "status": 500},
    )


app.add_exception_handler(Exception, _unhandled_exception_handler)

# ---------------------------------------------------------------------------
# CORS — allow all origins in dev; tighten in production via env var
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — imported here so they register their routes on the app
# ---------------------------------------------------------------------------
from api.routers import deputies, votes  # noqa: E402  (after app creation)

app.include_router(deputies.router, prefix="/deputies", tags=["Deputies"])
app.include_router(votes.router, prefix="/votes", tags=["Votes"])


# ---------------------------------------------------------------------------
# Landing page
# ---------------------------------------------------------------------------
_GITHUB_URL = "https://github.com/Walid-peach/MonElu"

_LANDING_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MonÉlu API</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    :root {{
      --bg:      #0d0d0d;
      --surface: #161616;
      --border:  #2a2a2a;
      --muted:   #555;
      --text:    #d4d4d4;
      --bright:  #f0f0f0;
      --accent:  #4ade80;
      --link:    #60a5fa;
    }}

    body {{
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
      font-size: 14px;
      line-height: 1.7;
      padding: 48px 24px 80px;
    }}

    .wrap {{ max-width: 780px; margin: 0 auto; }}

    /* header */
    .logo {{ font-size: 28px; font-weight: 700; color: var(--bright); letter-spacing: -0.5px; }}
    .logo span {{ color: var(--accent); }}
    .tagline {{ color: var(--muted); margin-top: 6px; font-size: 13px; }}

    hr {{ border: none; border-top: 1px solid var(--border); margin: 36px 0; }}

    /* stats */
    .stats {{ display: flex; gap: 24px; flex-wrap: wrap; }}
    .stat {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px 28px;
      flex: 1;
      min-width: 160px;
    }}
    .stat-value {{ font-size: 32px; font-weight: 700; color: var(--accent); }}
    .stat-label {{ color: var(--muted); font-size: 12px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.08em; }}

    /* section headings */
    h2 {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 16px; }}

    /* curl examples */
    .examples {{ display: flex; flex-direction: column; gap: 12px; }}
    .example {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 4px;
      padding: 14px 18px;
    }}
    .example-desc {{ color: var(--muted); font-size: 12px; margin-bottom: 6px; }}
    .example-cmd {{ color: var(--bright); white-space: pre-wrap; word-break: break-all; }}
    .example-cmd .kw  {{ color: var(--accent); }}
    .example-cmd .url {{ color: var(--link); }}

    /* links */
    .links {{ display: flex; gap: 16px; flex-wrap: wrap; }}
    .btn {{
      display: inline-block;
      padding: 9px 20px;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--link);
      text-decoration: none;
      font-size: 13px;
      transition: border-color 0.15s, color 0.15s;
    }}
    .btn:hover {{ border-color: var(--link); color: var(--bright); }}

    /* status dot */
    .status {{ display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }}
    .dot {{ width: 7px; height: 7px; border-radius: 50%; background: {dot_color}; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Mon<span>Élu</span></div>
    <div class="tagline">Open civic data API — French parliamentary votes &amp; deputies</div>

    <hr />

    <div class="stats">
      <div class="stat">
        <div class="stat-value">{deputies}</div>
        <div class="stat-label">Deputies</div>
      </div>
      <div class="stat">
        <div class="stat-value">{votes}</div>
        <div class="stat-label">Votes</div>
      </div>
      <div class="stat">
        <div class="stat-value">{positions}</div>
        <div class="stat-label">Vote positions</div>
      </div>
    </div>

    <hr />

    <h2>Try it</h2>
    <div class="examples">
      <div class="example">
        <div class="example-desc">List deputies (paginated, filterable by name or department)</div>
        <div class="example-cmd"><span class="kw">curl</span> <span class="url">{base}/deputies/?limit=5&amp;search=martin</span></div>
      </div>
      <div class="example">
        <div class="example-desc">Get a deputy&#39;s voting scorecard</div>
        <div class="example-cmd"><span class="kw">curl</span> <span class="url">{base}/deputies/PA1592/scorecard</span></div>
      </div>
      <div class="example">
        <div class="example-desc">Browse recent votes</div>
        <div class="example-cmd"><span class="kw">curl</span> <span class="url">{base}/votes/latest</span></div>
      </div>
    </div>

    <hr />

    <h2>Links</h2>
    <div class="links">
      <a class="btn" href="/docs">Interactive docs (Swagger)</a>
      <a class="btn" href="/redoc">ReDoc</a>
      <a class="btn" href="{github}" target="_blank" rel="noopener">GitHub</a>
      <a class="btn" href="/health">Health check</a>
    </div>

    <hr />

    <div class="status">
      <div class="dot"></div>
      <span>{status_text}</span>
    </div>
  </div>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def landing(request: Request) -> HTMLResponse:
    database_url = os.getenv("DATABASE_URL")
    deputies_count = votes_count = positions_count = "—"
    dot_color = "#ef4444"  # red — degraded
    status_text = "Database unreachable"

    try:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM deputies")
            deputies_count = f"{cur.fetchone()[0]:,}"
            cur.execute("SELECT COUNT(*) FROM votes")
            votes_count = f"{cur.fetchone()[0]:,}"
            cur.execute("SELECT COUNT(*) FROM vote_positions")
            positions_count = f"{cur.fetchone()[0]:,}"
        conn.close()
        dot_color = "#4ade80"  # green — healthy
        status_text = "Database connected"
    except Exception:
        logger.warning("Landing page could not reach DB", exc_info=True)

    base_url = str(request.base_url).rstrip("/")

    html = _LANDING_HTML.format(
        deputies=deputies_count,
        votes=votes_count,
        positions=positions_count,
        base=base_url,
        github=_GITHUB_URL,
        dot_color=dot_color,
        status_text=status_text,
    )
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
def health() -> dict:
    database_url = os.getenv("DATABASE_URL")
    try:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM deputies")
            deputies = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM votes")
            votes = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM vote_positions")
            positions = cur.fetchone()[0]
        conn.close()
        return {"status": "ok", "deputies": deputies, "votes": votes, "positions": positions}
    except Exception as exc:
        return {"status": "degraded", "error": str(exc)}
