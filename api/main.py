"""
api/main.py
FastAPI application entry point for MonÉlu.
"""

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
    allow_credentials=False,  # public read-only API — no cookies or auth headers needed
    allow_methods=["GET"],
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


def _build_vote_row(row) -> str:
    raw = row.get("vote_title") or ""
    title = (raw[:80] + "…") if len(raw) > 80 else raw
    title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    result = (row.get("result") or "").strip().lower()
    if result == "adopté":
        badge_cls, badge_lbl = "badge-adopte", "Adopté"
    else:
        badge_cls, badge_lbl = "badge-rejete", "Rejeté"

    date_str = _format_date_fr(row.get("voted_at"))
    vf = row.get("votes_for") or 0
    vc = row.get("votes_against") or 0
    total_cast = vf + vc
    bar_pct = round(vf / total_cast * 100) if total_cast > 0 else 50

    return (
        '<div class="vote-item">'
        '<div class="vote-row-top">'
        f'<div class="vote-title-text">{title}</div>'
        f'<span class="vote-date">{date_str}</span>'
        "</div>"
        '<div class="vote-row-bottom">'
        f'<span class="badge {badge_cls}">{badge_lbl}</span>'
        f'<div class="vote-bar"><div class="bar-pour" style="width:{bar_pct}%"></div></div>'
        '<div class="vote-tally">'
        f'<span class="tally-pour">{vf:,} pour</span>'
        f' · <span class="tally-contre">{vc:,} contre</span>'
        "</div>"
        "</div>"
        "</div>"
    )


_LANDING_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MonÉlu — Chaque vote. Chaque député.</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --navy:      #0D1F3C;
      --navy-dark: #091629;
      --navy-mid:  #162a4e;
      --red:       #E63946;
      --white:     #FFFFFF;
      --bg:        #F7F8FA;
      --text:      #1C2B3A;
      --muted:     #64748B;
      --border:    #E2E8F0;
      --green:     #16A34A;
      --crimson:   #DC2626;
    }}
    body {{ background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; font-size: 15px; line-height: 1.6; }}
    a {{ color: inherit; text-decoration: none; }}

    /* NAV */
    nav {{
      background: var(--navy-dark);
      padding: 0 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 62px;
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }}
    .nav-brand {{ font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; color: var(--white); letter-spacing: -0.3px; }}
    .nav-brand span {{ color: var(--red); }}
    .nav-links {{ display: flex; gap: 28px; }}
    .nav-links a {{ color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 500; transition: color 0.15s; }}
    .nav-links a:hover {{ color: var(--white); }}

    /* HERO */
    .hero {{
      background: linear-gradient(155deg, var(--navy-dark) 0%, var(--navy) 55%, var(--navy-mid) 100%);
      padding: 0 48px;
      min-height: 100vh;
      display: flex;
      align-items: center;
    }}
    .hero-inner {{
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
      display: grid;
      grid-template-columns: 55fr 45fr;
      gap: 60px;
      align-items: center;
      padding: 80px 0;
    }}
    .hero-eyebrow {{
      display: inline-block;
      background: rgba(230,57,70,0.15);
      color: #ff8b93;
      border: 1px solid rgba(230,57,70,0.3);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 5px 14px;
      margin-bottom: 28px;
    }}
    .hero h1 {{
      font-family: 'Syne', sans-serif;
      font-size: 48px;
      font-weight: 800;
      color: var(--white);
      line-height: 1.15;
      margin-bottom: 18px;
      letter-spacing: -0.5px;
    }}
    .hero h1 em {{ color: var(--red); font-style: normal; }}
    .hero-sub {{
      font-size: 16px;
      color: rgba(255,255,255,0.6);
      max-width: 440px;
      margin-bottom: 36px;
      line-height: 1.75;
    }}
    .hero-cta {{
      display: inline-block;
      background: var(--red);
      color: var(--white);
      font-weight: 600;
      font-size: 15px;
      padding: 13px 30px;
      border-radius: 6px;
      transition: background 0.15s, transform 0.1s;
    }}
    .hero-cta:hover {{ background: #c9303c; transform: translateY(-1px); }}
    .hero-source {{ display: block; margin-top: 20px; font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 0.02em; }}

    /* API CARD */
    .api-card {{
      background: #0A0F1E;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      overflow: hidden;
      transform: rotate(1.5deg);
    }}
    .api-card-header {{
      background: #151C2E;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }}
    .api-dots {{ display: flex; gap: 6px; }}
    .api-dot {{ width: 10px; height: 10px; border-radius: 50%; }}
    .dot-red {{ background: #E63946; }}
    .dot-yellow {{ background: #F0A500; }}
    .dot-green {{ background: #1B7A4A; }}
    .api-url {{ font-family: ui-monospace, monospace; font-size: 13px; color: rgba(255,255,255,0.5); }}
    .api-body {{
      font-family: ui-monospace, 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.8;
      padding: 20px;
      color: rgba(255,255,255,0.85);
      margin: 0;
      white-space: pre;
      overflow-x: auto;
    }}
    .json-key {{ color: #7DD3FC; }}
    .json-str {{ color: #86EFAC; }}
    .json-num {{ color: #FCA5A5; }}
    .api-curl {{ color: rgba(255,255,255,0.35); }}

    /* STATS BAR — navy bridge between hero and body */
    .stats-bar {{ background: var(--navy-dark); }}
    .stats-inner {{
      max-width: 900px;
      margin: 0 auto;
      padding: 0 48px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      min-height: 120px;
      align-items: center;
    }}
    .stat-card {{ padding: 32px 0; text-align: center; border-right: 1px solid rgba(255,255,255,0.15); }}
    .stat-card:last-child {{ border-right: none; }}
    .stat-number {{ font-family: 'Syne', sans-serif; font-size: 56px; font-weight: 800; color: var(--white); line-height: 1; }}
    .stat-accent {{ width: 40px; height: 2px; background: var(--red); margin: 8px auto 10px; }}
    .stat-label {{ font-size: 13px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500; }}

    /* SECTIONS */
    .section {{ max-width: 900px; margin: 0 auto; padding: 80px 48px; }}
    .section-title {{
      font-family: 'Syne', sans-serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 32px;
      border-left: 3px solid var(--red);
      padding-left: 16px;
    }}

    /* VOTES */
    .votes-section {{ background: var(--white); }}
    .vote-list {{ display: flex; flex-direction: column; gap: 10px; }}
    .vote-item {{
      border: 1px solid #E8EDF2;
      border-radius: 8px;
      padding: 16px 20px;
    }}
    .vote-row-top {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 10px; }}
    .vote-title-text {{ font-weight: 500; font-size: 15px; color: var(--navy); flex: 1; line-height: 1.5; }}
    .vote-date {{ font-size: 13px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }}
    .vote-row-bottom {{ display: flex; align-items: center; gap: 12px; }}
    .badge {{ font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; flex-shrink: 0; }}
    .badge-adopte {{ background: #1B7A4A; color: var(--white); }}
    .badge-rejete {{ background: var(--red); color: var(--white); }}
    .vote-bar {{ flex: 1; height: 4px; border-radius: 2px; background: #fee2e2; overflow: hidden; }}
    .bar-pour {{ height: 100%; background: #1B7A4A; border-radius: 2px; }}
    .vote-tally {{ font-size: 12px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }}
    .tally-pour {{ color: #1B7A4A; font-weight: 500; }}
    .tally-contre {{ color: var(--red); font-weight: 500; }}
    .votes-empty {{
      text-align: center;
      padding: 40px 20px;
      border: 2px dashed #E8EDF2;
      border-radius: 8px;
    }}
    .votes-empty-icon {{ font-size: 32px; color: rgba(13,31,60,0.2); line-height: 1; margin-bottom: 12px; }}
    .votes-empty-text {{ font-size: 14px; color: var(--muted); }}
    .votes-more {{ margin-top: 24px; }}
    .link-arrow {{ font-size: 14px; color: var(--navy); font-weight: 600; }}

    /* HOW IT WORKS */
    .how-section {{ background: #F7F8FA; }}
    .steps {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }}
    .step-card {{
      background: var(--white);
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }}
    .step-num {{ font-family: 'Syne', sans-serif; font-size: 48px; font-weight: 900; color: var(--red); line-height: 1; margin-bottom: 12px; }}
    .step-title {{ font-size: 17px; font-weight: 700; color: var(--navy); margin-bottom: 8px; }}
    .step-desc {{ font-size: 14px; color: #4A5568; line-height: 1.7; }}

    /* OPEN DATA */
    .opendata-section {{ background: var(--navy); }}
    .opendata-inner {{ text-align: center; max-width: 680px; margin: 0 auto; }}
    .opendata-inner h2 {{ font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 700; color: var(--white); margin-bottom: 14px; }}
    .opendata-inner p {{ font-size: 15px; color: rgba(255,255,255,0.65); max-width: 480px; margin: 0 auto 32px; line-height: 1.75; }}
    .opendata-links {{ display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }}
    .btn-outline {{
      display: inline-block;
      padding: 10px 24px;
      border: 1.5px solid rgba(255,255,255,0.4);
      border-radius: 6px;
      color: var(--white);
      font-size: 13px;
      font-weight: 600;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }}
    .btn-outline:hover {{ background: var(--white); border-color: var(--white); color: var(--navy); }}

    /* FOOTER */
    footer {{
      background: var(--navy-dark);
      padding: 32px 48px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }}
    .footer-inner {{
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }}
    .footer-left {{ font-size: 13px; color: rgba(255,255,255,0.55); }}
    .footer-left strong {{ color: rgba(255,255,255,0.85); font-weight: 600; }}
    .footer-right {{ font-size: 13px; color: rgba(255,255,255,0.3); text-align: right; line-height: 1.7; }}
    .db-status {{ display: flex; align-items: center; gap: 6px; margin-top: 6px; opacity: 0.5; }}
    .db-dot {{ width: 6px; height: 6px; border-radius: 50%; background: {db_dot}; }}
    .db-label {{ font-size: 12px; color: rgba(255,255,255,0.7); }}

    /* RESPONSIVE */
    @media (max-width: 640px) {{
      nav {{ padding: 0 20px; }}
      .hero {{ padding: 0 24px; min-height: unset; }}
      .hero-inner {{ grid-template-columns: 1fr; gap: 0; padding: 64px 0 56px; }}
      .hero-right {{ display: none; }}
      .stats-inner {{ grid-template-columns: 1fr; padding: 0 24px; min-height: unset; }}
      .stat-card {{ border-right: none; border-bottom: 1px solid rgba(255,255,255,0.15); padding: 28px 0; }}
      .stat-card:last-child {{ border-bottom: none; }}
      .section {{ padding: 48px 24px; }}
      .steps {{ grid-template-columns: 1fr; }}
      footer {{ padding: 28px 24px; }}
      .footer-inner {{ flex-direction: column; align-items: flex-start; }}
      .footer-right {{ text-align: left; }}
      .vote-row-top {{ flex-direction: column; gap: 4px; }}
    }}
  </style>
</head>
<body>

  <!-- NAV -->
  <nav>
    <div class="nav-brand">Mon<span>Élu</span></div>
    <div class="nav-links">
      <a href="/docs">API Docs</a>
      <a href="{github}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-left">
        <div class="hero-eyebrow">Plateforme civique open source</div>
        <h1>Suivez chaque vote de chaque <em>député français</em>.</h1>
        <p class="hero-sub">Données officielles de l'Assemblée Nationale. Ouvertes, vérifiables, accessibles.</p>
        <a href="/docs" class="hero-cta">Explorer l'API →</a>
        <span class="hero-source">Données issues de data.assemblee-nationale.fr · Mises à jour régulièrement</span>
      </div>
      <div class="hero-right">
        <div class="api-card">
          <div class="api-card-header">
            <div class="api-dots">
              <div class="api-dot dot-red"></div>
              <div class="api-dot dot-yellow"></div>
              <div class="api-dot dot-green"></div>
            </div>
            <span class="api-url">GET /deputies/PA267918</span>
          </div>
<pre class="api-body"><span class="api-curl">$ curl monelu-production.up.railway.app</span>
<span class="api-curl">       /deputies/PA267918</span>

<span>{{</span>
  <span class="json-key">"deputy_id"</span>: <span class="json-str">"PA267918"</span>,
  <span class="json-key">"full_name"</span>: <span class="json-str">"Yaël Braun-Pivet"</span>,
  <span class="json-key">"party"</span>: <span class="json-str">"Renaissance"</span>,
  <span class="json-key">"department"</span>: <span class="json-str">"Yvelines"</span>,
  <span class="json-key">"scorecard"</span>: <span>{{</span>
    <span class="json-key">"presence_rate"</span>: <span class="json-num">1.0</span>,
    <span class="json-key">"total_votes"</span>: <span class="json-num">3149</span>,
    <span class="json-key">"votes_for_pct"</span>: <span class="json-num">0.61</span>
  <span>}}</span>
<span>}}</span></pre>
        </div>
      </div>
    </div>
  </section>

  <!-- STATS -->
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat-card">
        <div class="stat-number">{n_deputies}</div>
        <div class="stat-accent"></div>
        <div class="stat-label">Députés suivis</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{n_votes}</div>
        <div class="stat-accent"></div>
        <div class="stat-label">Votes analysés</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{n_positions}</div>
        <div class="stat-accent"></div>
        <div class="stat-label">Positions individuelles</div>
      </div>
    </div>
  </div>

  <!-- LATEST VOTES -->
  <div class="votes-section">
    <div class="section">
      <div class="section-title">Derniers votes à l'Assemblée</div>
      <div class="vote-list">
        {latest_votes_html}
      </div>
      <div class="votes-more">
        <a href="/docs#/Votes" class="link-arrow">Voir tous les votes →</a>
      </div>
    </div>
  </div>

  <!-- HOW IT WORKS -->
  <div class="how-section">
    <div class="section">
      <div class="section-title">Comment ça marche</div>
      <div class="steps">
        <div class="step-card">
          <div class="step-num">1</div>
          <div class="step-title">Cherchez un député</div>
          <div class="step-desc">Accédez au profil complet, au taux de présence et à l'historique de votes de chacun des 577 députés.</div>
        </div>
        <div class="step-card">
          <div class="step-num">2</div>
          <div class="step-title">Analysez les votes</div>
          <div class="step-desc">Chaque scrutin détaille les positions individuelles de chaque député — pour, contre, abstention.</div>
        </div>
        <div class="step-card">
          <div class="step-num">3</div>
          <div class="step-title">Interrogez les données</div>
          <div class="step-desc">Une API REST ouverte et documentée. Aucune clé requise. Intégrez les données dans vos projets.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- OPEN DATA -->
  <div class="opendata-section">
    <div class="section">
      <div class="opendata-inner">
        <h2>Données 100% officielles et ouvertes</h2>
        <p>Toutes les données proviennent de data.assemblee-nationale.fr, la plateforme open data de l'Assemblée Nationale.</p>
        <div class="opendata-links">
          <a href="/docs" class="btn-outline">Documentation API</a>
          <a href="{github}" target="_blank" rel="noopener" class="btn-outline">Code source</a>
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <footer>
    <div class="footer-inner">
      <div class="footer-left">
        <strong>MonÉlu</strong> — plateforme civique open source
        <div class="db-status">
          <div class="db-dot"></div>
          <span class="db-label">{db_label}</span>
        </div>
      </div>
      <div class="footer-right">
        Données : Assemblée Nationale Open Data<br />
        Stack : FastAPI · PostgreSQL · Supabase
      </div>
    </div>
  </footer>

</body>
</html>
"""


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def landing(request: Request) -> HTMLResponse:
    database_url = os.getenv("DATABASE_URL")
    n_deputies = n_votes = n_positions = "—"
    db_dot = "#ef4444"
    db_label = "Base de données indisponible"
    latest_votes_html = (
        '<div class="votes-empty">'
        '<div class="votes-empty-icon">&#9675;</div>'
        '<div class="votes-empty-text">Données temporairement indisponibles</div>'
        "</div>"
    )

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
                       votes_for, votes_against, abstentions
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
        db_label = "Base de données connectée"
    except Exception:
        logger.warning("Landing page could not reach DB", exc_info=True)

    html = _LANDING_HTML.format(
        n_deputies=n_deputies,
        n_votes=n_votes,
        n_positions=n_positions,
        latest_votes_html=latest_votes_html,
        github=_GITHUB_URL,
        db_dot=db_dot,
        db_label=db_label,
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
