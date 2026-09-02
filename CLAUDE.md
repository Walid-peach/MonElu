# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

> **Before writing any code, read [`docs/decisions.md`](docs/decisions.md).**
> It documents every real architectural decision made during the build.
> If anything here contradicts that file, the ADRs take precedence.

## Project Overview

**MonÉlu** is a civic transparency platform exposing the complete voting record of every deputy in the French Assemblée Nationale (17th legislature, since 2024-07-07). The tagline is "Every vote. Every deputy. In plain French."

This is a production application — not a data engineering exercise. The API, landing page, RAG search, dbt transform layer, and CI/CD pipelines are all live.

Production API: https://monelu-production.up.railway.app

### Phases

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 | Live | Ingestion pipeline, REST API, deputy profiles, vote records, scorecards |
| Phase 2 | Live | Semantic search — RAG over the legislative corpus (pgvector + Groq) |
| Phase 3 | Live | Automated refresh — GitHub Actions cron ingestion + RAG re-index (daily, weekdays) |
| Phase 4 | Live | dbt transform layer — staging → intermediate → marts; lineage docs on GitHub Pages |
| Phase 5 | Deferred | AWS infrastructure — Terraform IaC was written and validate-passing but modeled an Airflow+Spark architecture never built, with no compute for the actual FastAPI app; archived to `archive/infra-aws/` (MON-46). Managed services (Railway + Supabase) cover current load; a real AWS migration would start fresh with a state backend and an App Runner/ECS module. |
| Phase 6 | Live | CI/CD — PR gates (ruff, pytest, dbt test bot), deploy workflow |

---

## Production Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| API hosting | Railway | Auto-deploys on push to `master`; `migrate.py` runs as start hook |
| Database | Supabase (PostgreSQL 15 + pgvector) | Managed; free tier limits prod data to votes from 2025-07-01 onward |
| Local database | Docker — Postgres 15 + pgAdmin 8 | Full legislature from 2024-07-07 |
| API framework | FastAPI + uvicorn | Direct psycopg2, no ORM |
| Transform layer | dbt (staging → intermediate → marts) | Runs against prod Supabase on merge to `master` |
| RAG embeddings | OpenAI `text-embedding-3-small` | 1 536 dimensions, ~$0.006 per full re-index |
| RAG inference | Groq `llama-3.3-70b-versatile` | temperature=0.2; free tier, faster than OpenAI |
| Vector index | Exact cosine scan via pgvector (`<=>`) | ANN index dropped at ~3.7k chunks (migration 003) — exact scan is ms-fast with perfect recall |
| CI/CD | GitHub Actions (5 workflows) | See Workflows section |
| Error tracking | Sentry (API + frontend) | Opt-in via `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` — no-ops when unset. See `docs/monitoring.md` |
| Experiment tracking | MLflow (local) | router suite + retrieval suite eval (11 questions total) |
| IaC | Terraform ~> 5.0 (AWS, archived) | `archive/infra-aws/` — not applied, kept as reference |

---

## Common Commands

```bash
# Local infrastructure
make start          # Start Postgres + pgAdmin via Docker
make stop           # Stop Docker services
make psql           # Open psql shell inside container

# Database
make migrate        # Apply schema (001_init.sql) and verify pgvector
make check-db       # Print table sizes and row counts

# Data ingestion
make ingest         # Full local ingestion: deputies → votes → positions
make fix-deputies   # Resolve party names and department codes
make ingest-prod    # Production ingestion (last 3 months)

# API
make api            # Start dev server with hot-reload at http://localhost:8000

# RAG pipeline (Phase 2)
make rag-index      # Truncate + re-embed all chunks (costs ~$0.006)
make rag-stats      # Print chunk counts by type
make rag-clear      # Truncate document_chunks only
make rag-test       # Run 3 test questions through the full RAG chain
make rag-eval       # Run MLflow k=3 vs k=5 evaluation
make mlflow-ui      # Open MLflow UI at http://localhost:5001

# Linting
ruff check .        # Lint
ruff format .       # Format
pre-commit run --all-files  # Run all hooks
```

---

## Architecture

### Actual Production Data Flow

```
Assemblée Nationale Open Data (ZIPs)
  → scripts/ingest_*.py          fetch · parse · upsert (ON CONFLICT DO UPDATE)
  → Supabase PostgreSQL          deputies · votes · vote_positions · document_chunks
  → dbt (GitHub Actions)         staging → intermediate → analytics_marts
  → api/routers/                 direct psycopg2, RealDictCursor, parameterized SQL
  → Railway (FastAPI)            JSON responses · POST /search (RAG)
  → Next.js (frontend/)          Cinematic landing page · live stats · RAG search UI
```

### GitHub Actions Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Every PR to `master` | ruff lint + pytest (unit) + dbt compile + dbt test + frontend lint/typecheck/jest/build + Playwright smoke tier (MON-241: no-horizontal-overflow and nav-visibility checks on `/`, `/deputes`, `/deputes/[id]`, `/votes`, `/votes/[id]`, `/chat`, `/quiz` at 390px/1280px, light/dark, against a `next build`, plus canonical-link and 404-status checks on `desktop-light` only - MON-269, MON-275, and a single-`h1`/server-rendered-summary check on `/` at both viewports - MON-270); posts dbt results as PR comment |
| `deploy.yml` | Merge to `master` | dbt deps → run → test against prod Supabase |
| `ingest_prod.yml` | Daily 06:00 UTC, weekdays | Ingest new votes + deputies + rebuild RAG index, then `dbt run` → operational tail. Every step after `dbt run` is `continue-on-error` + `!cancelled()`, and a final **data-quality gate** re-fails the job on `dbt snapshot`/`dbt test`/`dbt source freshness`/quiz-validation outcomes (MON-250) — a failing assertion must never skip cache revalidation or the monitoring probes. The DB-size probe is deliberately outside the gate. |
| `summarize_backfill.yml` | Daily 07:00 UTC | Retries vote summaries (`summary_plain IS NULL`) independent of `ingest_prod.yml`'s `--since` window — the actual retry backstop (MON-221) |
| `dbt_docs.yml` | Push to `master` touching `transform/` | Generate + deploy lineage docs to GitHub Pages |

### Key Layers

**`api/`** — FastAPI application
- `main.py`: App factory, CORS (GET + POST — POST is needed for `/search`; an empty `CORS_ORIGINS` blocks all cross-origin requests and logs a startup warning), slowapi rate limiting (30 req/min global, 10 req/min on scorecard and search), global exception handler. `/health` returns DB status, record counts, last ingestion timestamp, and dbt mart row counts. The landing page is now the Next.js frontend (`frontend/`), not a FastAPI-served HTML page.
- `routers/deputies.py`, `routers/votes.py`, `routers/search.py`, `routers/verify.py`, `routers/departments.py`, `routers/groups.py`, `routers/quiz.py`, `routers/agenda.py`: All DB queries — direct SQL, no ORM. `quiz.py` is the vote-matching quiz surface (MON-109, ADR-025): `GET /quiz/questions` serves the curated repo-file question set (`api/quiz_data.py`) enriched at request time with each question's live vote tallies from the `votes` table (`votes_for`, `votes_against`, `abstentions`, `result`, `vote_date` — MON-180; the question *content* still never comes from the DB), `POST /quiz/match` is a stateless agreement computation (nothing persisted or logged) that accepts an optional `focus_deputy_id` (MON-183 — the `/quiz?deputy=<id>` personalized entry from a deputy's profile page): when set, the response carries a `focus` field with that deputy's match, returned even below the ranking threshold (422 if the deputy is unknown; not persisted in shares), and `POST /quiz/share` / `GET /quiz/share/{id}` store and serve immutable result snapshots (recomputed server-side from the submitted answers — client percentages are never trusted) behind `/quiz/s/<id>` share URLs. `POST /quiz/share` also takes an opt-in `include_answers` flag, default off (MON-184, ADR-028): when set, the submitted answers are added into the stored snapshot so a later visitor can run a friend comparison — computed entirely client-side in `QuizClient.tsx` against `/quiz?compare=<share_id>`, no `/quiz/compare` endpoint. The same flag gates the `themes` field (MON-203) — the themes answered pour/contre, feeding the poster share card (`frontend/src/app/quiz/QuizResultCard.tsx`, rendered as the hero of both `/quiz/s/[id]` and the live results screen). With one curated question per theme, that summary re-encodes the answers, so it is stripped from the stored snapshot without the opt-in; `POST /quiz/match` always returns it. `verify.py` is the fact-check surface (MON-126, ADR-022): `POST /verify/` runs the verification chain and stores an immutable verdict snapshot; `GET /verify/{id}` serves stored verdicts with no LLM call. `search.py` also carries the chat share surface (MON-66, ADR-024): `POST /search/share` persists a chat answer already returned by `POST /search/` (question, answer, sources, confidence) as an immutable snapshot; `GET /search/share/{id}` serves it with no LLM call, at share URL `/chat/s/<id>`. `departments.py` (MON-107) serves `GET /departments/{code}` — current deputies of a department with scorecard highlights, aggregates, and recent split votes; the code↔name map lives in `api/departments_data.py` (imported by `scripts/ingest_deputies.py` to expand the code at insert time, and by `scripts/update_party.py` for its defensive backfill of any row still holding a raw code — MON-219; frontend copy in `frontend/src/lib/departments.ts`). `groups.py` (MON-150, ADR-026) serves `GET /groups/{slug}` — a parliamentary group's current members with presence/dissident highlights, average participation and dissidence, most-dissident members, and votes ranked by how divided the group was, plus its most recent scrutins; no new dbt mart — aggregates live over `mart_deputy_scorecard`/`mart_party_alignment` and raw `vote_positions`. The slug↔party label map lives in `api/groups_data.py` (12 canonical labels enforced by `scripts/backfill_party_labels.py`). Rendered by the frontend at `/groupes/[slug]` (`frontend/src/app/groupes/[slug]/page.tsx`, MON-151), with the mirrored slug map in `frontend/src/lib/groups.ts`; the route is included in `frontend/src/app/sitemap.ts` (MON-153). `agenda.py` (MON-212, ADR-030) serves `GET /agenda` — upcoming séance publique items over the raw `agenda_items` table (no dbt mart), grouped by sitting day within a `from`/`to` window (default: current ISO week, max span 90 days); an item is visible only when its `last_seen_at` matches the table's most recent ingestion run and neither its réunion nor its own state is `Annulé`/`Supprimé`, and it carries a `vote_id`/`result` once a scrutin exists for its dossier, falling back to the official AN dossier URL (the same construction MON-89 uses on vote cards) otherwise.
- **Every route must carry a `summary=` on its decorator and a docstring on its handler** (MON-260). `/openapi.json` is the spec ChatGPT Actions, MCP bridges and generated clients read, so the docstring is the agent-facing manual for that endpoint: what it returns, in what units, and the domain caveat that applies (the `nonVotant`/`abstention` distinction, what `presence_rate` really counts, the 2025-07-01 data horizon, the 2000 `offset` ceiling). `tests/unit/test_readme_endpoints.py` fails the build on a route with an empty or trivially short description. The app-level preamble and the per-tag descriptions live in `API_DESCRIPTION` / `OPENAPI_TAGS` in `main.py`; response-model examples live in `schemas.py` (read that module's docstring first - a `None` in an example is silently dropped, and examples are not safely inherited).
- `config.py`: shared runtime configuration read from the environment. `frontend_base_url()` is the single definition of the public frontend origin (MON-274) — used by `main.py`'s `GET /` redirect and by the share URLs `quiz.py`, `search.py` and `verify.py` return. Never re-declare it per router.
- `schemas.py`: Pydantic response models; all fields `Optional` to match DB NULLs
- `limiter.py`: Shared slowapi `Limiter` instance imported by routers

**`scripts/`** — Data ingestion and maintenance
- Scripts fetch ZIPs from the AN open data portal with exponential-backoff retry (5 attempts, 2 s base) and upsert via `ON CONFLICT ... DO UPDATE`
- **Every parser must fail loudly on an upstream shape change** (MON-220, MON-249).
`SKIP_RATE_THRESHOLD = 0.05` lives in `scripts/_http.py` and is shared by all four parsers - never re-declare it per script.
`ingest_deputies.py` and `ingest_votes.py` exit 1 before upserting when more than 5% of records fail to parse.
`ingest_positions.py` streams its batches, so `check_position_yield()` runs after the loop instead: it exits 1 when nothing was written while the votes table had rows to attach positions to, or when more than 5% of extracted positions name an unknown `deputy_id`.
`ingest_agenda.py`'s `check_agenda_yield()` exits 1 when in-window séance publique ODJ points exist but none (or more than 5%) survive `parse_point`.
A new parser without such a guard ships a skeleton dataset on a green run - the exact failure mode these guards exist to remove.
- `migrate.py` doubles as the Railway start hook (runs before uvicorn in `railway.json`)
- `run_ingestion_prod.py` orchestrates the full pipeline for production runs, including `ingest_agenda.py` (MON-210) as a non-critical step - an agenda-feed failure must not block core deputies/votes/positions ingestion
- `create_dbt_profile.py` generates `transform/profiles.yml` from `DBT_*` env vars (used by CI and deploy workflows)

**`transform/`** — dbt project
- Three layers: `staging/` (typed views over raw tables) → `intermediate/` (business logic) → `marts/` (analytics-ready: `mart_deputy_scorecard`, `mart_vote_summary`)
- Tests run in CI on every PR and block merge on failure; results posted as PR comment
- Lineage docs auto-deployed to GitHub Pages on push to `master`

**`rag/`** — Phase 2 semantic search
- `pipeline/chunker.py`: Five chunk strategies: `vote` (one per scrutin), `deputy` (one per député), `party` (one per parliamentary group), `global_stats` (aggregate overview), `notable_deputy` (vote-by-vote for high-profile deputies). Uses tiktoken (cl100k_base) for token counting.
- `pipeline/embedder.py`: Batched OpenAI embedding (100 chunks/batch), stores into `document_chunks`.
- `pipeline/index_manager.py`: `build` / `stats` / `clear` CLI. `build` (no `--since`) is a full rebuild (~$0.006/run) that re-embeds into a `document_chunks_staging` table and swaps it in atomically (`ALTER TABLE ... RENAME`) once every step succeeds (MON-233) — `document_chunks` is never truncated up front, so a mid-run failure leaves the previous index live. `build --since` is a separate incremental mode that only embeds new votes/affected deputies and refreshes aggregate chunks in place.
- `chain/retriever.py`: Exact cosine similarity via pgvector `<=>`. Supports `chunk_type`, `deputy_id`, and auto-detected `result` filters (`adopté`/`rejeté`). Notable deputy names detected and their chunk pinned as first result. TTL-cached notable-deputy map (1h). Note: `register_vector` requires a plain psycopg2 cursor, not a `RealDictCursor`.
- `chain/prompts.py`: TTL-cached system prompt (data horizon refreshed hourly) via `build_system_prompt()`. Call per request — do not cache the return value.
- `chain/rag_chain.py`: `ask()` — retrieve → format → Groq `llama-3.3-70b-versatile` (temperature=0.2). RAG-path answers to claim-shaped input carry `suggested_action: "verify"` (ADR-023): `detect_claim()` in `llm_router.py` (regex pre-filter + small classifier) only annotates the response for the UI nudge - it never calls the verify chain.
- `chain/verify.py`: `verify_claim()` — claim verification (MON-126, ADR-022): deputy detection over all deputies, vote-chunk retrieval, positions join, structured JSON verdict (`vrai`/`faux`/`trompeur`/`inverifiable`). Cited vote_ids are validated against the votes table in code; low similarity, parse failure, or a factual verdict with no valid citation all force `inverifiable`.
- `experiments/mlflow_eval.py`: 11 golden Q&A pairs split into router suite (live SQL ground truth) and retrieval suite (keyword scoring).
- ~5,900 chunks in production (2026-07): 5,105 vote + 645 deputy + 12 party + 1 global_stats + 102 notable_deputy + 20 law_summary · party and global chunks count active mandates only

**`frontend/`** - Next.js App Router
- **Never put a `loading.tsx` at or above a route that calls `notFound()`** (MON-275). A `loading.tsx` wraps its whole segment subtree in a Suspense boundary, and streaming flushes HTTP 200 before the page body runs, so `notFound()` under one renders the 404 body with a 200 status - an indexable soft-404 that ISR then caches for `revalidate` seconds. `/deputes` and `/votes` keep their skeletons inside `(liste)` route groups, which scope the boundary to the list page and leave `/deputes/[id]` and `/votes/[id]` free to 404. `frontend/__tests__/app/not-found-status.test.ts` enforces both halves of this.
- A detail page's *identity* fetch uses `.catch(nullIfMissing)` (`src/lib/api.ts`), never a bare `.catch(() => null)`: only a genuine 404/422 becomes `notFound()`, while a 429 or 5xx is rethrown and surfaces as a server error. The supporting fetches on the same page keep `.catch(() => null)` - each one degrades a section rather than deciding whether the page exists.
- `/votes/[id]` and `/themes/[slug]` deliberately have **no `generateStaticParams`** (MON-275). Prerendering the 100 most recent votes plus the 10 themes meant ~220 API calls from one IP inside a build, which exhausted the API's DB connections and came back as 500s on endpoints that answer in 200 ms on every manual request - three CI builds in a row died on a different page each. `dynamicParams` plus `revalidate` already cover both routes on demand, and static pages generated dropped from 135 to 25. Do not reintroduce either without a way to throttle the burst; `sitemap.ts` is the remaining build-time burst and is still build-fatal if the API fails.
- Every route declares `alternates.canonical` via `canonicalUrl()` (MON-269) - see the Deployment section.
- The homepage carries **exactly one `<h1>`**, and it lives in `AssemblyScrollExperience`'s server-rendered half (MON-270).
`CinematicExperience` only mounts after `useSyncExternalStore` confirms a desktop viewport, so on desktop the DOM is the union of both trees - its two scroll-panel titles are `<h2>`, never `<h1>`.
`HomeSummary` (`src/components/home/HomeSummary.tsx`) is the static prose block below the cinematic: it is what a crawler or an LLM actually reads about this site, since the scroll experience itself is ~1 KB of display strings inside animated panels.
It is also the only place linking every `/groupes/[slug]` and `/themes/[slug]` from the homepage - keep it a server component with no interactivity.
`e2e/smoke.spec.ts` asserts both halves at 390px and 1280px.

**`archive/infra-aws/`** — Archived AWS Terraform IaC (not live)
- Modeled an Airflow+Spark architecture never built, with no compute for the actual FastAPI app — archived rather than fixed (MON-46). See Phase 5 and decision 1 in the decisions log.
- `networking`, `s3`, `rds` modules are the only parts worth salvaging if an AWS migration ever happens; `ec2` does not survive that design.

**`data/migrations/`** — 11 sequential migration files applied by `migrate.py`'s ledger; `001_init.sql` is the core four-table baseline
- `001_init.sql`: `deputies`, `votes`, `vote_positions`, `document_chunks`
- All `CREATE TABLE IF NOT EXISTS` — safe to re-run
- `migrate.py` keeps a `schema_migrations` ledger: each file is applied once and skipped on later deploys
- **Every new table in `public` must get `ENABLE ROW LEVEL SECURITY`** (MON-248). On Supabase, `public` is exposed through PostgREST and the anon role holds default privileges there, so RLS is the only gate — the app, ingestion and dbt all connect as the table owner and bypass it. `migrate.py`'s `assert_rls_on_created_tables` enforces this and exits 1 on a violation; `010_rls_backfill.sql` backfilled the seven tables that 004-009 missed. Tables created from Python rather than from a `.sql` file are outside that check and must enable RLS at their own creation site — `schema_migrations` (`scripts/migrate.py`) and `document_chunks_staging` (`rag/pipeline/index_manager.py`) both do. Add a `public_read` `FOR SELECT USING (true)` policy only for data meant to be readable by an anon key directly; the default is no policy at all.
- Numeric prefixes must be unique (`assert_unique_numeric_prefixes`, MON-226) — the duplicate `005` pair is grandfathered and that set must never grow

### Database

| Table | Purpose |
|-------|---------|
| `deputies` | 577 deputy profiles (party, department, photo_url, mandate dates) |
| `votes` | Legislative votes (title, result adopté/rejeté, aggregate counts) |
| `vote_positions` | Per-deputy position per vote (pour/contre/abstention/nonVotant) |
| `document_chunks` | Phase 2: content + JSONB metadata + vector(1536) |
| `api_keys` | Manually-issued public API keys (sha256 hash, label, rate_limit_multiplier) |
| `api_key_usage` | Per-key, per-endpoint, per-day request counters for usage accounting |
| `verifications` | Stored fact-check verdicts (ADR-022): immutable snapshots behind `/verifier/v/<id>` share URLs |
| `chat_shares` | Stored chat/RAG answer snapshots (MON-66, ADR-024): immutable snapshots behind `/chat/s/<id>` share URLs |
| `quiz_shares` | Stored quiz result snapshots (MON-139, ADR-025): server-recomputed, immutable snapshots behind `/quiz/s/<id>` share URLs; `result` JSONB optionally carries the sharer's answers when they opt in (MON-184, ADR-028) |
| `feedback` | Generic user-feedback sink (MON-70, MON-101): `type`-discriminated rows (`chat` thumbs / `report` data-page error reports) with a JSONB `payload`; weekly manual triage query in `docs/monitoring.md` |
| `agenda_items` | Séance publique ODJ points (MON-210, ADR-030): one denormalized row per point, upserted only - never deleted. `dossier_id` joins `votes.dossier_id`. `last_seen_at` plus `reunion_etat`/`point_etat` (not `DELETE`) are how cancelled or dropped items are reflected |

Important data quirks:
- `nonVotant` ≠ `abstention`: present in chamber but did not vote vs. formally abstained
- Yaël Braun-Pivet shows 100% presence — Présidente de l'AN, appears on every scrutin by design
- Production DB holds votes from `2025-07-01` (Supabase free tier); local dev can hold the full legislature from `2024-07-07`
- `votes.dossier_id` is sparse, and the sparsity is upstream and permanent (ADR-035, MON-242). The AN only began populating `objet.dossierLegislatif` on scrutins in **March 2026** - it is absent on every scrutin before that, so only ~74 dossiers in the legislature have a linkable scrutin at all. Never group votes by `dossier_id` to reconstruct a bill's history - see ADR-035. The separate *corruption* (1 570 rows holding the Python `repr()` of the dict rather than its `dossierRef`, written before commit `7e29131` and left unhealed by the cron's 30-day `--since` window) is fixed: `scripts/backfill_dossier_ids.py` repaired them in prod on 2026-09-02, and `check_dossier_refs()` in `ingest_votes.py` now exits 1 if a future run writes non-conforming refs (MON-258).

---

## Environment

Copy `.env.example` to `.env` for local development:

```ini
DATABASE_URL=postgresql://monelu:monelu@localhost:5432/monelu
AN_API_BASE_URL=https://data.assemblee-nationale.fr
CORS_ORIGINS=*
# Phase 2 — required for POST /search
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

Production uses Supabase (managed Postgres + pgvector). Local uses Docker (`docker-compose.yml` starts Postgres 15 + pgAdmin 8).

---

## Deployment

Hosted on Railway. Every push to `master` triggers an auto-deploy. The start command runs:
```
python scripts/migrate.py && uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Health check: `GET /health` — returns DB status, record counts, `last_ingestion` timestamp, and dbt mart row counts (degrades gracefully if marts are absent).

**Moving to a new domain** takes two environment variables, not one (MON-254, MON-274): `FRONTEND_BASE_URL` on Railway (backend — the `GET /` redirect and every share URL) and `NEXT_PUBLIC_SITE_URL` on Vercel (frontend — `metadataBase`, canonicals, sitemap, robots, OG cards). Same origin under two names; the Vercel one is inlined at build time, so it only takes effect on the next build. Every frontend route builds its `alternates.canonical` from `canonicalUrl()` in `frontend/src/lib/site.ts` (MON-269), so the move carries the canonicals with it; `frontend/__tests__/app/canonical.test.ts` fails if a new `page.tsx` ships without one or hardcodes the origin instead. The only allowlisted exceptions are `~offline` (service-worker fallback) and `embed/votes/[id]` (already `robots: noindex`).

---

## Code Style

Ruff is the single tool for lint and formatting (`ruff.toml`):
- Line length: 100
- `print()` allowed in `scripts/` and `rag/` (T201 ignored there), blocked elsewhere
- B008 ignored to allow FastAPI `Depends()` defaults
- Pre-commit hooks run automatically on `git commit`

### Dependency pinning convention

Across `requirements*.txt`: exact-pin (`==`) packages with a history of breaking
changes or where a newer version forced a downstream ceiling (e.g. `openai`,
`tiktoken`, `pgvector`); range-pin (`>=`) everything else. The same package must
use the same floor in every file it appears in (e.g. `groq>=0.11.0` everywhere) —
a mismatched floor between `requirements.txt` and `requirements-ingest.txt` is a
drift bug, not an intentional difference. No lockfiles are generated; each
`requirements-*.txt` documents intent, not a fully resolved dependency graph.

---

## Decisions Log

Key architectural choices made during the build and why. Consult this before proposing changes that touch these areas.

### 1. Railway + Supabase over self-hosted AWS

**Decision:** Host on Railway (API) + Supabase (PostgreSQL) rather than provisioning EC2 + RDS.

**Why:** Zero ops overhead. Railway auto-deploys on push, handles TLS and routing. Supabase provides managed PostgreSQL 15 with pgvector pre-installed and a generous free tier. At current scale (577 deputies, ~1 200 votes, ~715 k positions) there is no load that justifies the complexity and cost of a self-managed AWS stack. The original Terraform IaC modeled an Airflow+Spark architecture that was never built and was archived to `archive/infra-aws/`; a real AWS migration would start fresh with a state backend and an App Runner/ECS module for the FastAPI app.

### 2. No ORM — direct psycopg2

**Decision:** All DB queries use direct SQL via psycopg2 `RealDictCursor`, with no SQLAlchemy or other ORM.

**Why:** The queries are analytical (aggregate counts, filtered vote records, scorecard rankings) and benefit from explicit SQL. An ORM adds indirection without value here. Parameterized queries handle injection safety; `RealDictCursor` returns dicts directly, matching the JSON response shape without a mapping layer.

### 3. Kafka removed — batch over streaming

**Decision:** Kafka (MSK) was planned for a streaming ingestion phase but removed entirely. The MSK security group and module were deleted from `infra/`. There is no streaming pipeline.

**Why:** The Assemblée Nationale publishes vote data as daily ZIP exports, not a real-time stream. A daily GitHub Actions cron job (`ingest_prod.yml`, 06:00 UTC weekdays) is the correct unit of work. Adding Kafka would introduce broker management, consumer group state, and schema registry complexity for no latency benefit — the data source itself is not real-time. If the AN ever publishes a live API, this decision should be revisited.

### 4. Groq for RAG inference, OpenAI for embeddings

**Decision:** Embeddings use OpenAI `text-embedding-3-small`; inference uses Groq `llama-3.3-70b-versatile`.

**Why:** OpenAI embeddings are the quality baseline for French text and are cheap at this corpus size ($0.006 per full re-index). Groq inference is free-tier, significantly faster than OpenAI Chat, and produces adequate quality for civic Q&A at temperature=0.2. Separating the embedding and inference providers gives independent cost and quality control over each.

### 5. IVFFlat dropped; notable-deputy retrieval pin removed (MON-76)

**Decision (revised 2026-07-13):** the IVFFlat index was dropped (migration 003) — it had been built on an empty table (degenerate clustering) and at ~3.7k chunks an exact cosine scan is faster *and* exact. The notable-deputy retrieval pin was re-evaluated with a local MLflow run (pin-on vs pin-off, retrieval suite) and removed: pin-off matched pin-on on keyword_score (0.875 = 0.875) and scored *higher* on average top similarity (0.622 vs 0.571) — the exact cosine scan alone already ranks the deputy's own chunk first. See decision ADR-008 in `docs/decisions.md` for the full eval writeup.

**Original decision:** pgvector uses IVFFlat (not HNSW) with `ivfflat.probes=10`. A DB-backed map of indexed `notable_deputy` chunks pins the named deputy's chunk as the first result, bypassing the index.

**Why it existed:** At 3 741 chunks, IVFFlat had known recall gaps for high-profile deputies whose names appear across many chunks — the index could return a generic vote chunk instead of the deputy profile. The pin was a targeted workaround: it added one exact-match lookup before the vector search, cheaper than retuning the entire index.

**Why it's gone:** IVFFlat itself is gone (see above), so the recall gap the pin was compensating for no longer exists. `get_notable_deputy_ids()` / `detect_notable_deputy()` still live in `rag/chain/retriever.py` — they're used by `rag/chain/llm_router.py` to route deputy-specific questions to RAG instead of a ranking-intent SQL query, which is a routing concern, not a retrieval-ranking one.

### 6. dbt for the transform layer

**Decision:** Raw ingestion tables feed a dbt project (`transform/`) with staging → intermediate → marts layers. Marts are tested in CI on every PR.

**Why:** Clean separation between ingestion (idempotent upserts) and analytics (typed, tested, documented models). dbt provides lineage docs (auto-deployed to GitHub Pages), schema tests that block bad data from reaching the API, and a reproducible `dbt run` that can rebuild marts from scratch. The alternative — embedding business logic in the API queries — makes the queries fragile and untestable.

### 7. Supabase free tier data horizon

**Decision:** Production ingestion starts from `2025-07-01`, not from the legislature start date (`2024-07-07`).

**Why:** Supabase free tier has a 500 MB database limit. The full legislature from 2024-07-07 exceeds this. Local dev uses Docker and can hold the full dataset. If the production tier is upgraded, `make ingest-prod` can be run with an earlier start date to backfill — the upsert logic is idempotent.

### 8. Upsert-only ingestion

**Decision:** All ingestion scripts use `INSERT ... ON CONFLICT ... DO UPDATE`. There are no `DELETE` statements in the pipeline.

**Why:** The AN open data portal is append-only in practice (votes are not retroactively removed). Upsert semantics make the pipeline safe to re-run at any time without data loss, simplifying the cron job — it does not need to track state between runs. If a vote record is corrected upstream, the next run overwrites it correctly.

**Correction horizon:** that guarantee only holds inside whatever `--since` window the run actually uses, and four different windows exist. The production cron (`ingest_prod.yml`) computes `--since` as today minus 30 days - the narrowest of the four. `make ingest-prod` passes a 90-day window (matching the "last 3 months" in the Common Commands table above). The scripts' own argparse defaults (`run_ingestion_prod.py`, `ingest_agenda.py`, `ingest_votes.py`, `generate_vote_summaries.py`) fall back to 365 days when `--since` is omitted entirely, which only happens for manual/local runs. In practice this means: an upstream correction to a vote or agenda record older than 30 days is never picked up by the daily cron. Catching it requires a manual `make ingest-prod` (90 days) or an explicit `--since` further back - the upsert logic is idempotent either way, so re-running with a wider window is always safe. Why the cron uses 30 days rather than the 90-day Makefile window is undocumented; it is not because corrections are assumed to stop after 30 days.
