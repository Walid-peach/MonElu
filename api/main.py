"""
api/main.py
FastAPI application entry point for MonÉlu.
"""

import base64
import logging
import os
import re
import traceback

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

from api.limiter import limiter  # noqa: E402

load_dotenv()

app = FastAPI(
    title="MonÉlu API",
    description="Civic data platform — French parliamentary votes and deputies.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clear 429 JSON response with Retry-After and rate-limit headers."""
    detail = str(exc.detail)
    retry_after = 60
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
# CORS
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

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
from api.routers import deputies, votes  # noqa: E402
from api.routers.search import router as search_router  # noqa: E402

app.include_router(deputies.router, prefix="/deputies", tags=["Deputies"])
app.include_router(votes.router, prefix="/votes", tags=["Votes"])
app.include_router(search_router, prefix="/search", tags=["Search"])


# ---------------------------------------------------------------------------
# Logo SVG — hemicycle icon
# arc center cx=24, cy=40; segments: translate(x y) rotate(α)
# x = 24 + r·sin(α),  y = 40 − r·cos(α)
# ---------------------------------------------------------------------------

# Variant A — light background (navy/red/gray on transparent)
_ICON_LIGHT = (
    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
    # outer row r=19, 8 segs, navy/red alternating, α ∈ {-70,-50,-30,-10,10,30,50,70}
    '<g transform="translate(6.15 33.50) rotate(-70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(9.45 27.79) rotate(-50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(14.50 23.55) rotate(-30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(20.70 21.29) rotate(-10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(27.30 21.29) rotate(10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(33.50 23.55) rotate(30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(38.55 27.79) rotate(50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(41.85 33.50) rotate(70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    # middle row r=13, 6 segs, gray/navy alternating, α ∈ {-55,-33,-11,11,33,55}
    '<g transform="translate(13.35 32.54) rotate(-55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(16.92 29.10) rotate(-33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(21.52 27.24) rotate(-11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(26.48 27.24) rotate(11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(31.08 29.10) rotate(33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(34.65 32.54) rotate(55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    # inner row r=8, 4 segs, red/gray, α ∈ {-45,-15,15,45}
    '<g transform="translate(18.34 34.34) rotate(-45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(21.93 32.27) rotate(-15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#9CA3AF"/></g>'
    '<g transform="translate(26.07 32.27) rotate(15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(29.66 34.34) rotate(45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#9CA3AF"/></g>'
    # person silhouette
    '<circle cx="24" cy="40.5" r="1.8" fill="#0D1F3C"/>'
    '<rect x="20" y="43" width="8" height="4" rx="1" fill="#0D1F3C"/>'
    "</svg>"
)

# Variant B — dark background (navy→white, gray→rgba(255,255,255,0.4), red stays)
_ICON_DARK = (
    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
    '<g transform="translate(6.15 33.50) rotate(-70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="white"/></g>'
    '<g transform="translate(9.45 27.79) rotate(-50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(14.50 23.55) rotate(-30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="white"/></g>'
    '<g transform="translate(20.70 21.29) rotate(-10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(27.30 21.29) rotate(10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="white"/></g>'
    '<g transform="translate(33.50 23.55) rotate(30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(38.55 27.79) rotate(50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="white"/></g>'
    '<g transform="translate(41.85 33.50) rotate(70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(13.35 32.54) rotate(-55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="rgba(255,255,255,0.4)"/></g>'
    '<g transform="translate(16.92 29.10) rotate(-33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="white"/></g>'
    '<g transform="translate(21.52 27.24) rotate(-11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="rgba(255,255,255,0.4)"/></g>'
    '<g transform="translate(26.48 27.24) rotate(11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="white"/></g>'
    '<g transform="translate(31.08 29.10) rotate(33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="rgba(255,255,255,0.4)"/></g>'
    '<g transform="translate(34.65 32.54) rotate(55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="white"/></g>'
    '<g transform="translate(18.34 34.34) rotate(-45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(21.93 32.27) rotate(-15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="rgba(255,255,255,0.4)"/></g>'
    '<g transform="translate(26.07 32.27) rotate(15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(29.66 34.34) rotate(45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="rgba(255,255,255,0.4)"/></g>'
    '<circle cx="24" cy="40.5" r="1.8" fill="white"/>'
    '<rect x="20" y="43" width="8" height="4" rx="1" fill="white"/>'
    "</svg>"
)

# Variant C — 32×32 icon-only, for favicon (same shapes, compact)
_ICON_FAVICON = (
    '<svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
    '<g transform="translate(6.15 33.50) rotate(-70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(9.45 27.79) rotate(-50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(14.50 23.55) rotate(-30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(20.70 21.29) rotate(-10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(27.30 21.29) rotate(10)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(33.50 23.55) rotate(30)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(38.55 27.79) rotate(50)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(41.85 33.50) rotate(70)"><rect x="-2" y="-1.5" width="4" height="3" rx="0.5" fill="#C9302C"/></g>'
    '<g transform="translate(13.35 32.54) rotate(-55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(16.92 29.10) rotate(-33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(21.52 27.24) rotate(-11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(26.48 27.24) rotate(11)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(31.08 29.10) rotate(33)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#9CA3AF"/></g>'
    '<g transform="translate(34.65 32.54) rotate(55)"><rect x="-1.75" y="-1.25" width="3.5" height="2.5" rx="0.5" fill="#0D1F3C"/></g>'
    '<g transform="translate(18.34 34.34) rotate(-45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(21.93 32.27) rotate(-15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#9CA3AF"/></g>'
    '<g transform="translate(26.07 32.27) rotate(15)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#C9302C"/></g>'
    '<g transform="translate(29.66 34.34) rotate(45)"><rect x="-1.25" y="-1" width="2.5" height="2" rx="0.4" fill="#9CA3AF"/></g>'
    '<circle cx="24" cy="40.5" r="1.8" fill="#0D1F3C"/>'
    '<rect x="20" y="43" width="8" height="4" rx="1" fill="#0D1F3C"/>'
    "</svg>"
)

# Favicon data URI — base64 encoded so it works without a file
_FAVICON_URI = "data:image/svg+xml;base64," + base64.b64encode(_ICON_FAVICON.encode()).decode()


# ---------------------------------------------------------------------------
# Landing page helpers
# ---------------------------------------------------------------------------
_FR_MONTHS = [
    "jan.",
    "fév.",
    "mar.",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sep.",
    "oct.",
    "nov.",
    "déc.",
]


def _format_date_fr(dt) -> str:
    if dt is None:
        return "—"
    return f"{dt.day} {_FR_MONTHS[dt.month - 1]} {dt.year}"


def _compact(n: str) -> str:
    """Abbreviate large numbers for display (1,819,873 → 1.8M)."""
    if n == "—":
        return "—"
    try:
        v = int(n.replace(",", "").replace(" ", ""))
        if v >= 1_000_000:
            return f"{v / 1_000_000:.1f}M"
        if v >= 10_000:
            return f"{v / 1_000:.0f}k"
        return n
    except (ValueError, AttributeError):
        return n


def _build_vote_row(row) -> str:
    raw = row.get("vote_title") or ""
    title = (raw[:90] + "…") if len(raw) > 90 else raw
    title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    result = (row.get("result") or "").strip().lower()
    badge_cls = "badge-adopte" if result == "adopté" else "badge-rejete"
    badge_lbl = "Adopté" if result == "adopté" else "Rejeté"

    date_str = _format_date_fr(row.get("voted_at"))
    vf = row.get("votes_for") or 0
    vc = row.get("votes_against") or 0
    ab = row.get("abstentions") or 0
    total = row.get("total_voters") or (vf + vc)
    pour_pct = round(vf / total * 100) if total > 0 else 0
    contre_pct = round(vc / total * 100) if total > 0 else 0

    return (
        '<div class="vote-row">'
        '<div class="vote-info">'
        f'<div class="vote-date">{date_str}</div>'
        f'<div class="vote-title-text">{title}</div>'
        '<div class="vote-bar-wrap">'
        f'<div class="vote-bar"><div class="bar-pour" style="width:{pour_pct}%"></div>'
        f'<div class="bar-contre" style="width:{contre_pct}%"></div></div>'
        f'<div class="vote-tally">{vf:,} pour · {vc:,} contre · {ab:,} abstentions</div>'
        "</div>"
        "</div>"
        f'<div class="vote-badge-wrap"><span class="badge {badge_cls}">{badge_lbl}</span></div>'
        "</div>"
    )


# All literal { } in CSS/JS below must be escaped as {{ }} because this string
# is rendered via .format(). Format placeholders use single braces: {nav_icon}, etc.
_LANDING_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MonÉlu — Chaque vote. Chaque député.</title>
  <link rel="icon" type="image/svg+xml" href="{favicon_uri}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --navy: #0D1F3C;
      --navy-light: #1A3258;
      --red: #C9302C;
      --red-light: #E8413D;
      --white: #FFFFFF;
      --off-white: #F8F7F4;
      --gray-light: #EDECEA;
      --gray-mid: #8A8885;
      --text-primary: #1A1A1A;
      --text-secondary: #4A4845;
      --border: #E0DED9;
    }}
    body {{ font-family: 'DM Sans', system-ui, sans-serif; color: var(--text-primary); background: var(--white); line-height: 1.6; }}
    a {{ color: inherit; text-decoration: none; }}

    /* LOGO */
    .monelu-logo {{ display: flex; align-items: center; gap: 10px; text-decoration: none; }}
    .logo-text {{
      font-family: 'DM Serif Display', serif; font-size: 22px;
      color: var(--navy); letter-spacing: -0.02em;
    }}
    .logo-accent {{ color: var(--red); font-style: italic; }}
    .monelu-logo-dark .logo-text {{ color: white; }}
    .monelu-logo-dark .logo-accent {{ color: #E8413D; }}

    /* NAV */
    .nav {{
      position: sticky; top: 0; z-index: 100;
      background: var(--white); border-bottom: 1px solid var(--border);
      height: 64px; display: flex; align-items: center;
      justify-content: space-between; padding: 0 48px;
    }}
    .nav-links {{ display: flex; gap: 32px; }}
    .nav-links a {{ font-size: 14px; color: var(--text-secondary); transition: color 0.15s; }}
    .nav-links a:hover {{ color: var(--red); }}
    .nav-cta {{
      display: inline-block; border: 1.5px solid var(--navy); color: var(--navy);
      font-size: 13px; padding: 8px 16px; border-radius: 4px; font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }}
    .nav-cta:hover {{ background: var(--navy); color: var(--white); }}

    /* HERO */
    .hero {{ display: flex; min-height: 90vh; background: var(--off-white); }}
    .hero-left {{
      width: 50%; padding: 80px 60px 80px 80px;
      display: flex; flex-direction: column; justify-content: center;
    }}
    .hero-eyebrow {{
      font-size: 11px; font-weight: 500; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--red); margin-bottom: 20px;
    }}
    .hero-headline {{
      font-family: 'DM Serif Display', serif; font-size: 52px;
      color: var(--navy); line-height: 1.15;
    }}
    .hero-sub {{
      font-size: 17px; color: var(--text-secondary); line-height: 1.7;
      max-width: 480px; margin-top: 20px;
    }}
    .hero-ctas {{ display: flex; gap: 12px; margin-top: 36px; flex-wrap: wrap; }}
    .btn-primary {{
      display: inline-block; background: var(--red); color: var(--white);
      padding: 14px 28px; border-radius: 4px; font-size: 15px; font-weight: 500;
      transition: background 0.15s;
    }}
    .btn-primary:hover {{ background: var(--red-light); }}
    .btn-secondary {{
      display: inline-block; background: var(--white); color: var(--navy);
      border: 1.5px solid var(--navy); padding: 14px 28px; border-radius: 4px;
      font-size: 15px; font-weight: 500; transition: background 0.15s, color 0.15s;
    }}
    .btn-secondary:hover {{ background: var(--navy); color: var(--white); }}
    .hero-trust {{ display: flex; margin-top: 48px; flex-wrap: nowrap; gap: 0; }}
    .trust-item {{
      font-size: 11px; color: var(--gray-mid); padding: 0 16px;
      border-right: 1px solid var(--border); white-space: nowrap;
    }}
    .trust-item:first-child {{ padding-left: 0; }}
    .trust-item:last-child {{ border-right: none; }}

    /* HERO RIGHT */
    .hero-right {{ width: 50%; position: relative; overflow: visible; }}
    .hero-img {{
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    }}
    .hero-img-overlay {{
      position: absolute; inset: 0;
      background: linear-gradient(to right, var(--off-white) 0%, transparent 20%);
      z-index: 1;
    }}
    .stats-card {{
      position: absolute; bottom: 60px; left: -40px; z-index: 2;
      background: var(--white); border-radius: 12px; padding: 24px 28px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12); min-width: 420px;
    }}
    .stats-card-header {{
      display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
    }}
    .pulse-dot {{
      width: 8px; height: 8px; border-radius: 50%; background: var(--red);
      animation: pulse-blink 1.5s ease-in-out infinite; flex-shrink: 0;
    }}
    @keyframes pulse-blink {{
      0%, 100% {{ opacity: 1; }}
      50% {{ opacity: 0.25; }}
    }}
    .stats-card-label {{ font-size: 13px; font-weight: 500; color: var(--navy); }}
    .stats-row {{ display: flex; }}
    .stat-item {{ flex: 1; padding: 0 16px; border-right: 1px solid var(--border); text-align: center; }}
    .stat-item:first-child {{ padding-left: 0; text-align: left; }}
    .stat-item:last-child {{ border-right: none; }}
    .stat-num {{ font-family: 'DM Serif Display', serif; font-size: 26px; color: var(--navy); display: block; }}
    .stat-lbl {{ font-size: 11px; color: var(--gray-mid); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; display: block; }}

    /* VOTES SECTION */
    .section-votes {{ background: var(--white); padding: 100px 0; }}
    .section-inner {{ max-width: 1200px; margin: 0 auto; padding: 0 80px; }}
    .section-eyebrow {{
      font-size: 11px; font-weight: 500; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--red); margin-bottom: 12px;
    }}
    .section-title {{ font-family: 'DM Serif Display', serif; font-size: 36px; color: var(--navy); margin-bottom: 8px; }}
    .section-subtitle {{ font-size: 15px; color: var(--gray-mid); margin-bottom: 48px; }}
    .vote-list {{ display: flex; flex-direction: column; }}
    .vote-row {{
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 24px; padding: 20px 0; border-bottom: 1px solid var(--border);
    }}
    .vote-row:first-child {{ border-top: 1px solid var(--border); }}
    .vote-info {{ flex: 1; min-width: 0; }}
    .vote-date {{ font-size: 13px; color: var(--gray-mid); margin-bottom: 4px; }}
    .vote-title-text {{ font-size: 16px; font-weight: 500; color: var(--navy); margin-bottom: 10px; line-height: 1.4; }}
    .vote-bar-wrap {{ display: flex; flex-direction: column; gap: 4px; }}
    .vote-bar {{ width: 200px; height: 6px; background: var(--gray-light); border-radius: 3px; overflow: hidden; display: flex; }}
    .bar-pour {{ height: 100%; background: #1B7A4A; }}
    .bar-contre {{ height: 100%; background: var(--red); }}
    .vote-tally {{ font-size: 12px; color: var(--gray-mid); }}
    .vote-badge-wrap {{ display: flex; align-items: flex-start; padding-top: 24px; flex-shrink: 0; }}
    .badge {{ font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 3px; white-space: nowrap; }}
    .badge-adopte {{ background: #EBF7F0; color: #1B7A4A; border: 1px solid #A8DFC0; }}
    .badge-rejete {{ background: #FEF0F0; color: #C9302C; border: 1px solid #F5BEBE; }}
    .votes-empty {{
      padding: 60px 24px; text-align: center; border: 2px dashed var(--border);
      border-radius: 8px; color: var(--gray-mid); font-size: 14px;
    }}
    .votes-more {{ margin-top: 32px; }}
    .link-red {{ font-size: 14px; font-weight: 500; color: var(--red); }}
    .link-red:hover {{ text-decoration: underline; }}

    /* FEATURES */
    .section-features {{ background: var(--off-white); padding: 100px 0; }}
    .section-features .section-inner {{ text-align: center; }}
    .section-features .section-title {{ max-width: 640px; margin: 0 auto 48px; }}
    .features-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; text-align: left; }}
    .feature-card {{ background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 32px; }}
    .feature-card.muted {{ opacity: 0.7; }}
    .feature-icon {{ font-size: 28px; margin-bottom: 16px; display: block; }}
    .feature-title {{ font-size: 18px; font-weight: 600; color: var(--navy); margin-bottom: 10px; }}
    .feature-desc {{ font-size: 14px; color: var(--text-secondary); line-height: 1.65; }}

    /* RAG DEMO */
    .section-rag {{ background: var(--navy); padding: 100px 0; }}
    .section-rag .section-inner {{ display: flex; gap: 60px; align-items: flex-start; }}
    .rag-left {{ flex: 1; }}
    .rag-eyebrow {{
      font-size: 11px; font-weight: 500; letter-spacing: 0.1em;
      text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 16px;
    }}
    .rag-title {{ font-family: 'DM Serif Display', serif; font-size: 40px; color: var(--white); line-height: 1.15; margin-bottom: 16px; }}
    .rag-sub {{ font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 32px; }}
    .rag-pills {{ display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }}
    .rag-pill {{
      border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; padding: 8px 16px;
      font-size: 13px; color: var(--white); cursor: pointer; background: transparent;
      font-family: 'DM Sans', sans-serif; transition: background 0.15s, color 0.15s;
    }}
    .rag-pill:hover, .rag-pill.active {{ background: var(--white); color: var(--navy); }}
    .rag-right {{ flex: 1; }}
    .terminal-card {{ background: #0A1628; border-radius: 12px; overflow: hidden; }}
    .terminal-header {{
      background: #151F35; padding: 12px 16px;
      display: flex; align-items: center; gap: 12px;
    }}
    .terminal-dots {{ display: flex; gap: 6px; }}
    .t-dot {{ width: 10px; height: 10px; border-radius: 50%; }}
    .t-dot-red {{ background: #FF5F57; }}
    .t-dot-yellow {{ background: #FEBC2E; }}
    .t-dot-green {{ background: #28C840; }}
    .terminal-route {{ font-family: ui-monospace, monospace; font-size: 13px; color: rgba(255,255,255,0.4); }}
    #rag-question {{
      width: 100%; background: transparent; border: none;
      border-bottom: 1px solid rgba(255,255,255,0.1); padding: 20px;
      color: var(--white); font-size: 14px; font-family: 'DM Sans', sans-serif;
      resize: none; outline: none; line-height: 1.6; display: block;
    }}
    #rag-question::placeholder {{ color: rgba(255,255,255,0.3); }}
    #rag-submit {{
      width: 100%; background: var(--red); color: var(--white); border: none;
      padding: 14px; font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif;
      cursor: pointer; transition: background 0.15s; display: block;
    }}
    #rag-submit:hover {{ background: var(--red-light); }}
    #rag-submit:disabled {{ opacity: 0.6; cursor: not-allowed; }}
    .rag-loading {{
      padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.1);
      display: none; align-items: center; gap: 8px;
    }}
    .rag-loading-text {{ font-size: 13px; color: rgba(255,255,255,0.5); }}
    .loading-dot {{
      display: inline-block; width: 5px; height: 5px; border-radius: 50%;
      background: rgba(255,255,255,0.5); animation: dot-bounce 1.2s ease-in-out infinite;
    }}
    .loading-dot:nth-child(2) {{ animation-delay: 0.15s; }}
    .loading-dot:nth-child(3) {{ animation-delay: 0.3s; }}
    @keyframes dot-bounce {{
      0%, 80%, 100% {{ transform: translateY(0); opacity: 0.3; }}
      40% {{ transform: translateY(-4px); opacity: 1; }}
    }}
    .rag-response {{
      padding: 20px; border-top: 1px solid rgba(255,255,255,0.1); display: none;
    }}
    .rag-response-label {{
      font-size: 11px; color: rgba(255,255,255,0.4); margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: 0.05em;
    }}
    .rag-answer-text {{ font-size: 14px; color: rgba(255,255,255,0.9); line-height: 1.7; }}
    .rag-sources-count {{ font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 10px; }}

    /* OPEN DATA */
    .section-opendata {{ background: var(--off-white); padding: 80px 0; }}
    .section-opendata .section-inner {{ text-align: center; }}
    .opendata-title {{ font-family: 'DM Serif Display', serif; font-size: 28px; color: var(--navy); margin-bottom: 16px; }}
    .opendata-desc {{ font-size: 15px; color: var(--gray-mid); max-width: 560px; margin: 0 auto 32px; line-height: 1.75; }}
    .opendata-btns {{ display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }}
    .btn-outline-navy {{
      display: inline-block; border: 1.5px solid var(--navy); color: var(--navy);
      padding: 10px 24px; border-radius: 4px; font-size: 14px; font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }}
    .btn-outline-navy:hover {{ background: var(--navy); color: var(--white); }}

    /* FOOTER */
    footer {{ background: var(--navy); padding: 60px 0 0; }}
    .footer-grid {{
      max-width: 1200px; margin: 0 auto; padding: 0 80px 48px;
      display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px;
    }}
    .footer-logo-wrap {{ display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }}
    .footer-tagline {{ font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.65; margin-bottom: 16px; max-width: 280px; }}
    .footer-db-status {{ display: flex; align-items: center; gap: 6px; }}
    .footer-db-dot {{ width: 6px; height: 6px; border-radius: 50%; background: {db_dot}; flex-shrink: 0; }}
    .footer-db-label {{ font-size: 12px; color: rgba(255,255,255,0.4); }}
    .footer-col-title {{
      font-size: 13px; font-weight: 600; color: var(--white); margin-bottom: 16px;
      text-transform: uppercase; letter-spacing: 0.05em;
    }}
    .footer-links {{ list-style: none; display: flex; flex-direction: column; gap: 10px; }}
    .footer-links a {{ font-size: 14px; color: rgba(255,255,255,0.55); transition: color 0.15s; }}
    .footer-links a:hover {{ color: var(--white); }}
    .footer-social {{ display: flex; gap: 12px; margin-top: 4px; }}
    .footer-social a {{ color: rgba(255,255,255,0.55); transition: color 0.15s; }}
    .footer-social a:hover {{ color: var(--white); }}
    .footer-bottom {{
      max-width: 1200px; margin: 0 auto; padding: 20px 80px;
      border-top: 1px solid rgba(255,255,255,0.1);
      display: flex; justify-content: flex-end;
    }}
    .footer-stack {{ font-size: 12px; color: rgba(255,255,255,0.3); }}

    /* RESPONSIVE */
    @media (max-width: 768px) {{
      .nav {{ padding: 0 20px; }}
      .nav-links {{ display: none; }}
      .hero {{ flex-direction: column; min-height: unset; }}
      .hero-right {{ order: -1; width: 100%; height: 300px; overflow: hidden; position: relative; }}
      .hero-img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
      .hero-img-overlay {{ display: none; }}
      .stats-card {{
        position: static; min-width: unset; border-radius: 0;
        box-shadow: none; border-top: 1px solid var(--border);
      }}
      .hero-left {{ width: 100%; padding: 40px 24px 48px; }}
      .hero-headline {{ font-size: 36px; }}
      .hero-ctas {{ flex-direction: column; }}
      .hero-trust {{ flex-direction: column; gap: 8px; }}
      .trust-item {{ border-right: none; padding: 0; }}
      .section-inner {{ padding: 0 24px; }}
      .section-votes {{ padding: 60px 0; }}
      .section-features {{ padding: 60px 0; }}
      .features-grid {{ grid-template-columns: 1fr; }}
      .section-rag {{ padding: 60px 0; }}
      .section-rag .section-inner {{ flex-direction: column; gap: 40px; }}
      .rag-title {{ font-size: 32px; }}
      .section-opendata {{ padding: 60px 0; }}
      .footer-grid {{ grid-template-columns: 1fr 1fr; gap: 32px; padding: 0 24px 40px; }}
      .footer-bottom {{ padding: 20px 24px; }}
    }}
  </style>
</head>
<body>

<!-- NAV — Variant A logo (light) -->
<nav class="nav">
  <a href="/" class="monelu-logo">
    {nav_icon}
    <span class="logo-text">Mon<span class="logo-accent">Élu</span></span>
  </a>
  <div class="nav-links">
    <a href="#deputes">Députés</a>
    <a href="#votes">Votes</a>
    <a href="#about">À propos</a>
  </div>
  <a href="/docs" class="nav-cta">Explorer l'API →</a>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-left">
    <div class="hero-eyebrow">Plateforme civique open source</div>
    <h1 class="hero-headline">Les données parlementaires claires, neutres et accessibles.</h1>
    <p class="hero-sub">MonÉlu transforme les données officielles de l'Assemblée Nationale en informations compréhensibles pour tous.</p>
    <div class="hero-ctas">
      <a href="#search" class="btn-primary">Poser une question →</a>
      <a href="/docs" class="btn-secondary">Documentation API</a>
    </div>
    <div class="hero-trust">
      <span class="trust-item">🛡 Données officielles · 100% transparentes</span>
      <span class="trust-item">⚖ Neutre &amp; indépendant · Sans parti pris</span>
    </div>
  </div>
  <div class="hero-right">
    <img src="/static/assemblee_nationale.jpg" alt="Assemblée Nationale" class="hero-img" />
    <div class="hero-img-overlay"></div>
    <div class="stats-card">
      <div class="stats-card-header">
        <div class="pulse-dot"></div>
        <span class="stats-card-label">En direct à l'Assemblée</span>
      </div>
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-num">{n_deputies}</span>
          <span class="stat-lbl">Députés</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{n_votes}</span>
          <span class="stat-lbl">Votes analysés</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{n_positions}</span>
          <span class="stat-lbl">Positions</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- VOTES -->
<section id="votes" class="section-votes">
  <div class="section-inner">
    <div class="section-eyebrow">Données en temps réel</div>
    <h2 class="section-title">Derniers votes à l'Assemblée</h2>
    <p class="section-subtitle">Résultats officiels mis à jour depuis data.assemblee-nationale.fr</p>
    <div class="vote-list">{latest_votes_html}</div>
    <div class="votes-more">
      <a href="/docs" class="link-red">Voir tous les votes via l'API →</a>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section id="deputes" class="section-features">
  <div class="section-inner">
    <div class="section-eyebrow">Une plateforme au service de la démocratie</div>
    <h2 class="section-title">Tout ce dont vous avez besoin pour suivre vos élus</h2>
    <div class="features-grid">
      <div class="feature-card">
        <span class="feature-icon">📊</span>
        <div class="feature-title">Données fiables</div>
        <p class="feature-desc">Accédez aux votes officiels et au profil complet de chacun des 577 députés en exercice.</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">🔍</span>
        <div class="feature-title">Recherche intelligente</div>
        <p class="feature-desc">Posez vos questions en français — notre moteur RAG répond avec des sources vérifiables.</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">📈</span>
        <div class="feature-title">Analyses claires</div>
        <p class="feature-desc">Taux de présence, alignement partisan, historique complet — les chiffres bruts sans interprétation.</p>
      </div>
      <div class="feature-card muted">
        <span class="feature-icon">🔔</span>
        <div class="feature-title">Alertes à venir</div>
        <p class="feature-desc">Bientôt : recevez une notification dès que votre député vote. Phase 3 du projet.</p>
      </div>
    </div>
  </div>
</section>

<!-- RAG DEMO -->
<section id="search" class="section-rag">
  <div class="section-inner">
    <div class="rag-left">
      <div class="rag-eyebrow">Intelligence artificielle</div>
      <h2 class="rag-title">Posez vos questions en français</h2>
      <p class="rag-sub">Notre chatbot analyse 3&nbsp;726 documents législatifs et répond avec des sources vérifiables.</p>
      <div class="rag-pills">
        <button class="rag-pill" onclick="fillQuestion(this)">Qui a voté contre la réforme des retraites&nbsp;?</button>
        <button class="rag-pill" onclick="fillQuestion(this)">Quel est le taux de présence de Yaël Braun-Pivet&nbsp;?</button>
        <button class="rag-pill" onclick="fillQuestion(this)">Combien de députés RN ont voté pour le budget&nbsp;?</button>
      </div>
    </div>
    <div class="rag-right">
      <div class="terminal-card">
        <div class="terminal-header">
          <div class="terminal-dots">
            <div class="t-dot t-dot-red"></div>
            <div class="t-dot t-dot-yellow"></div>
            <div class="t-dot t-dot-green"></div>
          </div>
          <span class="terminal-route">POST /search/</span>
        </div>
        <textarea id="rag-question" rows="3" placeholder="Posez votre question en français..."></textarea>
        <button id="rag-submit" onclick="askQuestion()">Demander →</button>
        <div class="rag-loading" id="rag-loading">
          <span class="rag-loading-text">Consultation des sources</span>
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
        </div>
        <div class="rag-response" id="rag-response">
          <div class="rag-response-label">Réponse :</div>
          <div class="rag-answer-text" id="rag-answer"></div>
          <div class="rag-sources-count" id="rag-sources"></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- OPEN DATA -->
<section id="about" class="section-opendata">
  <div class="section-inner">
    <h2 class="opendata-title">Données 100% officielles et ouvertes</h2>
    <p class="opendata-desc">Toutes les données proviennent de data.assemblee-nationale.fr, la plateforme open data officielle de l'Assemblée Nationale. Licence Ouverte 2.0.</p>
    <div class="opendata-btns">
      <a href="/docs" class="btn-outline-navy">Documentation API</a>
      <a href="https://github.com/Walid-peach/MonElu" target="_blank" rel="noopener" class="btn-outline-navy">Code source</a>
    </div>
  </div>
</section>

<!-- FOOTER — Variant B logo (dark) -->
<footer>
  <div class="footer-grid">
    <div>
      <a href="/" class="monelu-logo monelu-logo-dark footer-logo-wrap">
        {footer_icon}
        <span class="logo-text">Mon<span class="logo-accent">Élu</span></span>
      </a>
      <p class="footer-tagline">Une plateforme civique open source qui rend la démocratie plus transparente et accessible.</p>
      <div class="footer-db-status">
        <div class="footer-db-dot"></div>
        <span class="footer-db-label">{db_label}</span>
      </div>
    </div>
    <div>
      <div class="footer-col-title">Explorer</div>
      <ul class="footer-links">
        <li><a href="/deputies">Députés</a></li>
        <li><a href="/votes">Votes</a></li>
        <li><a href="/docs">API</a></li>
        <li><a href="#about">À propos</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">Ressources</div>
      <ul class="footer-links">
        <li><a href="/docs">Documentation</a></li>
        <li><a href="https://github.com/Walid-peach/MonElu" target="_blank" rel="noopener">Code source</a></li>
        <li><a href="https://data.assemblee-nationale.fr" target="_blank" rel="noopener">Données</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">Suivez-nous</div>
      <div class="footer-social">
        <a href="https://www.linkedin.com" target="_blank" rel="noopener" aria-label="LinkedIn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </a>
        <a href="https://github.com/Walid-peach/MonElu" target="_blank" rel="noopener" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <span class="footer-stack">Stack : FastAPI · PostgreSQL · Supabase · OpenAI · Groq</span>
  </div>
</footer>

<script>
  function fillQuestion(pill) {{
    document.querySelectorAll('.rag-pill').forEach(function(p) {{ p.classList.remove('active'); }});
    pill.classList.add('active');
    document.getElementById('rag-question').value = pill.textContent.trim();
  }}

  function askQuestion() {{
    var question = document.getElementById('rag-question').value.trim();
    if (!question) return;

    var loadingEl = document.getElementById('rag-loading');
    var responseEl = document.getElementById('rag-response');
    var answerEl = document.getElementById('rag-answer');
    var sourcesEl = document.getElementById('rag-sources');
    var submitBtn = document.getElementById('rag-submit');

    loadingEl.style.display = 'flex';
    responseEl.style.display = 'none';
    submitBtn.disabled = true;

    fetch('/search/', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{question: question}})
    }})
    .then(function(res) {{
      return res.json().then(function(data) {{ return {{ok: res.ok, data: data}}; }});
    }})
    .then(function(result) {{
      loadingEl.style.display = 'none';
      responseEl.style.display = 'block';
      submitBtn.disabled = false;
      if (result.ok) {{
        answerEl.textContent = result.data.answer || 'Pas de réponse.';
        var n = result.data.chunks_retrieved || 0;
        sourcesEl.textContent = n + ' source' + (n > 1 ? 's' : '') + ' consultée' + (n > 1 ? 's' : '');
      }} else {{
        answerEl.textContent = 'Service temporairement indisponible.';
        sourcesEl.textContent = '';
      }}
    }})
    .catch(function() {{
      loadingEl.style.display = 'none';
      responseEl.style.display = 'block';
      submitBtn.disabled = false;
      answerEl.textContent = 'Service temporairement indisponible.';
      sourcesEl.textContent = '';
    }});
  }}

  document.getElementById('rag-question').addEventListener('keydown', function(e) {{
    if (e.key === 'Enter' && !e.shiftKey) {{
      e.preventDefault();
      askQuestion();
    }}
  }});
</script>

</body>
</html>
"""


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def landing(request: Request) -> HTMLResponse:
    database_url = os.getenv("DATABASE_URL")
    n_deputies = n_votes = n_positions = "—"
    db_dot = "#ef4444"
    db_label = "Base de données indisponible"
    latest_votes_html = '<div class="votes-empty">Données temporairement indisponibles</div>'

    try:
        conn = psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM deputies")
            n_deputies = f"{cur.fetchone()['count']:,}"
            cur.execute("SELECT COUNT(*) FROM votes")
            n_votes = f"{cur.fetchone()['count']:,}"
            cur.execute("SELECT COUNT(*) FROM vote_positions")
            n_positions = f"{cur.fetchone()['count']:,}"
            cur.execute(
                """
                SELECT vote_title, result, voted_at,
                       votes_for, votes_against, abstentions, total_voters
                FROM votes
                ORDER BY voted_at DESC
                LIMIT 5
                """
            )
            rows = cur.fetchall()
            if rows:
                latest_votes_html = "".join(_build_vote_row(r) for r in rows)
        conn.close()
        db_dot = "#4ade80"
        db_label = "Base de données opérationnelle"
    except Exception:
        logger.warning("Landing page could not reach DB", exc_info=True)

    html = _LANDING_HTML.format(
        n_deputies=_compact(n_deputies),
        n_votes=_compact(n_votes),
        n_positions=_compact(n_positions),
        latest_votes_html=latest_votes_html,
        db_dot=db_dot,
        db_label=db_label,
        favicon_uri=_FAVICON_URI,
        nav_icon=_ICON_LIGHT,
        footer_icon=_ICON_DARK,
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
        logger.error("Health check DB error: %s", exc)
        return {"status": "degraded", "error": "Database unavailable"}
