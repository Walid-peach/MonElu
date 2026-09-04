# MonÉlu

[![CI](https://github.com/Walid-peach/MonElu/actions/workflows/ci.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/ci.yml)
[![Deploy](https://github.com/Walid-peach/MonElu/actions/workflows/deploy.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/deploy.yml)
[![dbt docs](https://github.com/Walid-peach/MonElu/actions/workflows/dbt_docs.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/dbt_docs.yml)

> Every vote. Every deputy. In plain French.

MonÉlu is a civic transparency platform that makes the voting record of every deputy in the French Assemblée Nationale fully accessible — in plain language, in real time. Built for journalists, researchers, and engaged citizens who shouldn't need to dig through government ZIP exports to understand how their representatives vote.

**Site:** https://mon-elu.vercel.app · **API:** https://monelu-production.up.railway.app · **API docs:** `/docs` · **Machine-readable spec:** `/openapi.json`

---

## Roadmap

| Phase | Status | What it covers |
|-------|--------|----------------|
| **Phase 1** — Data platform | **Live** | Full ingestion pipeline, REST API, deputy profiles, vote records, scorecards |
| **Phase 2** — Intelligence layer | **Live** | Semantic search over the legislative corpus (RAG, pgvector, Groq LLM) |
| **Phase 3** — Automated refresh | **Live** | GitHub Actions daily cron — ingest + dbt run + RAG re-index |
| **Phase 4** — dbt transformation layer | **Live** | Staging → intermediate → marts; lineage docs on GitHub Pages |
| **Phase 5** — AWS infrastructure | **Deferred** | Terraform IaC archived to `archive/infra-aws/` — modeled an architecture never built; Railway + Supabase cover current load |
| **Phase 6** — CI/CD | **Live** | PR gates (ruff, pytest, dbt test bot), deploy workflow |

---

## Architecture

```
Assemblée Nationale Open Data (ZIP exports)
  → scripts/ingest_*.py          fetch · parse · upsert with exponential-backoff retry
  → Supabase PostgreSQL          deputies · votes · vote_positions · document_chunks
  → dbt (GitHub Actions)         staging → intermediate → analytics_marts
  → api/routers/                 direct psycopg2, RealDictCursor, parameterized SQL
  → Railway (FastAPI)            JSON API · POST /search (RAG) · POST /verify (fact-check)
  → Next.js (frontend/, Vercel)  Landing page · deputy / vote / group / department / theme
                                 pages · chat · fact-check · vote-matching quiz
```

The API tier is fully stateless. All state lives in Supabase (managed Postgres with pgvector). Railway restarts on failure; `/health` returns live DB counts on every check. Errors are reported to Sentry when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set - the integration no-ops when they are not (see [`docs/monitoring.md`](docs/monitoring.md)).

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/decisions.md`](docs/decisions.md) | The full decisions log (ADR-001 to ADR-029, ADR-015 unused) - read before changing anything structural |
| [`CLAUDE.md`](CLAUDE.md) | Working guide for AI assistants on this repo |
| [`docs/monitoring.md`](docs/monitoring.md) | Sentry setup, health checks, weekly feedback triage query |
| [`docs/branch_protection.md`](docs/branch_protection.md) | Required checks and merge rules |
| [`docs/quiz-curation.md`](docs/quiz-curation.md) | How the quiz question set is curated and refreshed |
| [`docs/pr-attention-score.md`](docs/pr-attention-score.md) | PR review prioritisation heuristic |

---

## API Endpoints

Full interactive reference at `/docs`; the raw spec agents and generated clients should read is at `/openapi.json`.
Every route carries a summary and a description written for that reader - what it returns, in what units, and the domain caveat that applies (MON-260).
Rate limits are per endpoint (column *rpm*) - see [Rate Limiting](#rate-limiting).

### Core data

| Method | Endpoint | rpm | Description |
|--------|----------|-----|-------------|
| GET | `/` | - | Redirects to the Next.js frontend |
| GET | `/health` | - | API status, live record counts, last ingestion, dbt mart row counts |
| GET | `/deputies` | 30 | List deputies (`search`, `department` filters) |
| GET | `/deputies/stats` | 30 | Aggregate counts by party, department, mandate status |
| GET | `/deputies/{id}` | 30 | Deputy profile |
| GET | `/deputies/{id}/votes` | 30 | A deputy's voting record |
| GET | `/deputies/{id}/scorecard` | 10 | Presence rate, vote breakdown by position |
| GET | `/deputies/{id}/alignment` | 10 | Alignment with the deputy's own parliamentary group |
| GET | `/deputies/{id}/dissident-votes` | 10 | Votes where the deputy broke with their group |
| GET | `/deputies/{id}/diverging-votes` | 10 | Votes where the deputy diverged from the chamber majority |
| GET | `/votes` | 30 | List votes (`result` filter) |
| GET | `/votes/latest` | 30 | Last 10 votes |
| GET | `/votes/{id}` | 30 | Vote detail + all individual positions |
| GET | `/departments/{code}` | 30 | Department page data - deputies, aggregates, split votes (MON-107) |
| GET | `/groups/{slug}` | 30 | Parliamentary group page data - members, dissidence, divided votes (ADR-026) |
| GET | `/themes/{slug}` | 30 | Theme hub - per-theme stats, party positioning, vote list (MON-106) |
| GET | `/agenda` | 30 | Upcoming séance publique items grouped by day, `from`/`to` window (MON-212, ADR-030) |

### CSV exports (MON-97)

| Method | Endpoint | rpm | Description |
|--------|----------|-----|-------------|
| GET | `/deputies/scorecards` | 10 | Every deputy's scorecard in one response (dense table view) |
| GET | `/deputies/scorecard.csv` | 10 | Every deputy's scorecard as CSV |
| GET | `/deputies/{id}/votes.csv` | 10 | One deputy's full voting record as CSV |
| GET | `/votes/{id}/positions.csv` | 10 | Every deputy's position on one vote as CSV |

### Intelligence layer

| Method | Endpoint | rpm | Description |
|--------|----------|-----|-------------|
| POST | `/search/` | 10 | Natural-language query over the legislative corpus *(Phase 2)* |
| POST | `/search/share` | 30 | Store a chat answer as an immutable snapshot (no LLM call, ADR-024) |
| GET | `/search/share/{id}` | 300 | Stored chat answer - backs the `/chat/s/<id>` share URL |
| POST | `/verify/` | 10 | Fact-check a claim about a deputy's votes - structured verdict + citations |
| GET | `/verify/{id}` | 300 | Stored verdict snapshot (no LLM call) - backs `/verifier/v/<id>` |

### Quiz (ADR-025)

| Method | Endpoint | rpm | Description |
|--------|----------|-----|-------------|
| GET | `/quiz/questions` | 30 | Curated question set (versioned repo file) + live vote tallies |
| GET | `/quiz/weekly` | 30 | The scrutin of the week, picked automatically |
| POST | `/quiz/match` | 10 | Stateless agreement computation - nothing persisted or logged |
| POST | `/quiz/share` | 10 | Store an immutable result snapshot (recomputed server-side) |
| GET | `/quiz/share/{id}` | 300 | Stored result snapshot - backs the `/quiz/s/<id>` share URL |

### Feedback and API keys

| Method | Endpoint | rpm | Description |
|--------|----------|-----|-------------|
| POST | `/feedback/chat` | 10 | Thumbs up/down on a chat answer (MON-70) |
| POST | `/feedback/report` | 10 | Report an error on a data page (MON-101) |
| GET | `/keys/usage` | 10 | Per-endpoint, per-day usage for the calling API key |

---

## Rate Limiting

Implemented with [slowapi](https://github.com/laurentS/slowapi). Anonymous requests are keyed by remote IP; requests carrying a valid API key are keyed by key id and get the endpoint's base limit multiplied by that key's `rate_limit_multiplier` (`api/limiter.py`). There is no global default limit - every endpoint declares its own, listed in the *rpm* column above.

| Tier | Typical limit |
|---|---|
| Read endpoints | 30 req / min |
| Expensive reads (scorecards, CSV exports) | 10 req / min |
| LLM-backed (`POST /search/`, `POST /verify/`) | 10 req / min |
| Stored-snapshot reads (share URLs) | 300 req / min |

API keys are issued manually (`api_keys` table, sha256-hashed) and sent in the `X-API-Key` header; usage is counted per key, per endpoint, per day in `api_key_usage`.

On limit exceeded: HTTP 429 · `{"error": "Too Many Requests", "detail": "..."}` · `Retry-After` + `X-RateLimit-*` headers.

---

## Stack

**Core:** FastAPI · PostgreSQL 15 + pgvector (Supabase) · Python 3.11 · Railway · slowapi

**Frontend:** Next.js 15 · React 18 · Tailwind CSS · Framer Motion · SWR · Vercel

**Monitoring:** Sentry (API + frontend), opt-in via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`

**Phase 2 — RAG:** OpenAI `text-embedding-3-small` · Groq `openai/gpt-oss-120b` · tiktoken · MLflow

**Phase 4 — Transform:** dbt 1.12 · dbt_utils · `analytics_staging` + `analytics_marts` schemas

**Code quality:** ruff (lint + format) · pre-commit

---

## Data Sources

Assemblée Nationale Open Data — `data.assemblee-nationale.fr`
Static ZIP exports only — no REST API exists at the source (see ADR-010).

| Dataset | File |
|---|---|
| Deputies + organes (active, 17th legislature) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` |
| Votes (scrutins, since 2025-07-01 in prod) | `Scrutins.json.zip` |

---

## Local Setup

### Prerequisites

- Docker + Docker Compose
- Python 3.11+
- Node.js 20+ (frontend only)

### Steps

```bash
git clone <repo> && cd MonElu
cp .env.example .env        # set DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY

python3 -m venv venv
venv/bin/pip install -r requirements.txt

make start      # start local Postgres + pgAdmin
make migrate    # apply schema (001_init.sql)
make ingest     # deputies → votes → positions
make fix-deputies
make api        # → http://localhost:8000/docs
```

For the frontend:

```bash
cd frontend && npm install
cp .env.example .env.local   # point NEXT_PUBLIC_API_URL at http://localhost:8000
npm run dev                  # → http://localhost:3000
```

### Makefile reference

```
make start          docker compose up -d (Postgres + pgAdmin)
make stop           docker compose down
make migrate        apply 001_init.sql to DATABASE_URL
make ingest         full local ingestion (deputies → votes → positions)
make ingest-prod    production ingestion (last 3 months)
make fix-deputies   resolve party names + expand department codes
make api            uvicorn api.main:app --reload
make psql           psql into the running Postgres container
make check-db       table sizes, row counts, pgvector status

make rag-index      truncate + re-embed all chunks (~$0.006)
make rag-notable    build the notable-deputy chunks (ADR-017)
make rag-laws       build the law-summary chunks
make rag-stats      chunk counts by type
make rag-clear      truncate document_chunks
make rag-test       run 3 sample queries end-to-end
make rag-test-sql   check which sample questions the SQL router claims
make rag-eval       MLflow evaluation (router + retrieval suites)
make mlflow-ui      MLflow dashboard at http://localhost:5001

make dbt-run        run all dbt models (staging → intermediate → marts)
make dbt-test       run all dbt tests
make dbt-docs       generate + serve docs at http://localhost:8082
make dbt-lineage    open lineage graph in browser
make dbt-clean      remove compiled dbt artifacts

make frontend-dev   next dev   → http://localhost:3000
make frontend-build next build
make frontend-start next start (serves the production build)
```


---

## Phase 4 — dbt Transformation Layer

A full dbt project (`transform/`) sits between raw ingestion and the FastAPI layer.

### Layers

| Layer | Schema | Materialisation | Models |
|---|---|---|---|
| **Staging** | `analytics_staging` | View | `stg_deputies`, `stg_votes`, `stg_vote_positions` |
| **Intermediate** | `analytics_intermediate` | Table (overrides the layer default) | `int_party_vote_majority` |
| **Marts** | `analytics_marts` | Table | `mart_deputy_scorecard`, `mart_vote_summary`, `mart_party_alignment` |

### What FastAPI reads

| Endpoint | Source |
|---|---|
| `GET /deputies/{id}/scorecard` | `analytics_marts.mart_deputy_scorecard` |
| `GET /deputies/{id}/alignment` · `/dissident-votes` | `analytics_marts.mart_party_alignment` |
| `GET /votes` · `GET /votes/latest` | `analytics_marts.mart_vote_summary` |
| `GET /votes/{id}` | `analytics_marts.mart_vote_summary` + raw `vote_positions` |
| `GET /groups/{slug}` | `mart_deputy_scorecard` + `mart_party_alignment` + raw `vote_positions` |
| `GET /departments/{code}` | Raw tables, plus the marts for the highlight rates on a dedicated connection - falls back to raw-only when the marts are absent |
| `GET /themes/{slug}` | Raw tables only - no mart dependency |
| Landing page latest votes | `analytics_marts.mart_vote_summary` |

### Production deployment

dbt runs automatically on every merge to `master` via `deploy.yml`, and after every ingestion in `ingest_prod.yml`.
Lineage docs are published to GitHub Pages on push to `master` touching `transform/`.

Required GitHub secrets: `DBT_HOST` · `DBT_PORT` · `DBT_USER` · `DBT_PASSWORD` · `DBT_DBNAME`

---

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Every PR to `master` | ruff lint + pytest (unit and integration) + frontend lint / test / build + dbt compile + dbt test (posts results as PR comment) |
| `deploy.yml` | Merge to `master` | dbt run + test against prod Supabase |
| `ingest_prod.yml` | Daily 06:00 UTC, weekdays | Ingest votes + deputies + rebuild RAG index |
| `summarize_backfill.yml` | Daily 07:00 UTC | Backfill plain-French vote summaries (runs after the Groq TPD reset) |
| `dbt_docs.yml` | Push to `master` touching `transform/` | Deploy lineage docs to GitHub Pages |

All PRs must pass CI before merge — see [`docs/branch_protection.md`](docs/branch_protection.md).

---

## RAG Pipeline (Phase 2)

```
rag/
├── pipeline/
│   ├── chunker.py                 Five strategies: vote · deputy · party · global_stats ·
│   │                              notable_deputy; chunk_all() emits the whole corpus
│   ├── chunk_notable_deputies.py  Index builder for the notable-deputy chunks (ADR-017,
│   │                              `make rag-notable`) - has its own already_indexed guard
│   ├── chunk_law_summaries.py     plain-French summaries of the main texts
│   ├── embedder.py                Batched OpenAI embedding (100 chunks/batch) → document_chunks
│   └── index_manager.py           CLI: build / stats / clear
├── chain/
│   ├── retriever.py       pgvector exact cosine similarity + chunk_type / deputy / result filters
│   ├── hybrid_retriever.py  BM25 + vector blend - not on the live path, kept for eval (ADR-013)
│   ├── sql_router.py      ranking-intent questions answered by SQL, not retrieval
│   ├── llm_router.py      routes a question to SQL vs RAG; detect_claim() for the verify nudge
│   ├── prompts.py         TTL-cached French civic assistant system prompt + RAG template
│   ├── rag_chain.py       ask() - retrieve → format → Groq LLM
│   └── verify.py          verify_claim() - structured fact-check verdict (ADR-022)
└── experiments/
    └── mlflow_eval.py     11 golden Q&A pairs: router suite (SQL ground truth) + retrieval suite
```

**Index stats (2026-07, refresh with `make rag-stats`):** ~5,900 chunks - 5,105 vote · 645 deputy · 102 notable_deputy · 20 law_summary · 12 party · 1 global_stats. ~$0.006 to embed the full corpus · $0 per query beyond the question embedding.

The IVFFlat index was dropped (migration 003) - at this corpus size an exact cosine scan is faster and gives perfect recall. The notable-deputy retrieval pin was removed with it (MON-76): an MLflow pin-on/pin-off run showed the exact scan already ranks the deputy's own chunk first. See ADR-008 in [`docs/decisions.md`](docs/decisions.md).

---

## Infrastructure (archived)

The AWS Terraform stack moved to `archive/infra-aws/` — it modeled an
Airflow+Spark architecture that was never built, with no compute for the
actual FastAPI app. See ADR-021. `networking`, `s3`, and `rds` modules are
kept as reference for a future AWS migration; `ec2` does not survive that
design.

---

## Database Schema

### `deputies`
| Column | Type | Notes |
|---|---|---|
| `deputy_id` | TEXT PK | AN uid, e.g. `PA1592` |
| `full_name` | TEXT | |
| `first_name` / `last_name` | TEXT | |
| `party` | TEXT | Full GP name, e.g. `Rassemblement National` |
| `party_short` | TEXT | organeRef, e.g. `PO845401` |
| `circonscription` / `department` | TEXT | Full name, e.g. `Yvelines` |
| `mandate_start` / `mandate_end` | DATE | `mandate_end` is null if active |
| `photo_url` | TEXT | Official portrait from `assemblee-nationale.fr` |

### `votes`
| Column | Type | Notes |
|---|---|---|
| `vote_id` | TEXT PK | e.g. `VTANR5L17V1234` |
| `voted_at` | TIMESTAMPTZ | |
| `vote_title` | TEXT | Full legislative title |
| `vote_type` | TEXT | e.g. `SPO` |
| `result` | TEXT | `adopté` or `rejeté` |
| `votes_for` / `votes_against` / `abstentions` / `total_voters` | INTEGER | |
| `dossier_id` | TEXT | Linked dossier, if any |

### `vote_positions`
| Column | Type | Notes |
|---|---|---|
| `vote_id` | TEXT FK → votes | Composite PK with `deputy_id` |
| `deputy_id` | TEXT FK → deputies | Composite PK with `vote_id` |
| `position` | VARCHAR(15) | `pour` / `contre` / `abstention` / `nonVotant` |

### `document_chunks` *(Phase 2)*
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `content` | TEXT | French prose chunk |
| `metadata` | JSONB | `chunk_type`, `vote_id` or `deputy_id`, etc. |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |

### Supporting tables

| Table | Purpose |
|---|---|
| `api_keys` | Manually issued public API keys - sha256 hash, label, `rate_limit_multiplier` |
| `api_key_usage` | Per-key, per-endpoint, per-day request counters |
| `verifications` | Immutable fact-check verdict snapshots behind `/verifier/v/<id>` (ADR-022) |
| `chat_shares` | Immutable chat answer snapshots behind `/chat/s/<id>` (ADR-024) |
| `quiz_shares` | Server-recomputed quiz result snapshots behind `/quiz/s/<id>` (ADR-025); `result` JSONB optionally carries the sharer's answers, and the themes derived from them, when they opt in (ADR-028) |
| `feedback` | `type`-discriminated feedback sink (chat thumbs / data-page reports) with a JSONB payload |

### Migrations

`data/migrations/` is applied by `scripts/migrate.py`, which keeps a `schema_migrations` ledger so each file runs exactly once. All statements are `IF NOT EXISTS`-guarded and safe to re-run.

| File | What it adds |
|---|---|
| `001_init.sql` | Core schema: `deputies`, `votes`, `vote_positions`, `document_chunks` |
| `002_vote_summaries.sql` | `votes.summary_plain` + `votes.theme` |
| `003_schema_cleanup.sql` | Drops dead indexes, including IVFFlat (see the RAG section) |
| `004_api_keys.sql` | `api_keys` + `api_key_usage` |
| `005_feedback.sql` · `005_verifications.sql` | `feedback`, `verifications` |
| `006_drop_position_id.sql` | Removes the redundant surrogate key on `vote_positions` |
| `007_chat_shares.sql` · `008_quiz_shares.sql` | Share snapshot tables |

---

## Code Structure

### API (`api/`)

| Module | Purpose |
|---|---|
| `main.py` | App entry point - CORS, rate limiting, Sentry, exception handlers, API-key usage middleware, health check |
| `auth.py` | API key resolution from the `X-API-Key` header |
| `db.py` | psycopg2 connection helper |
| `limiter.py` | Shared slowapi `Limiter` + `tiered_limit()` (per-key multipliers) |
| `csv_export.py` | Streaming CSV response helper (MON-97) |
| `routers/deputies.py` | Deputy list, profile, scorecard, alignment, dissident/diverging votes, CSV exports |
| `routers/votes.py` | Vote list, latest, detail, positions CSV |
| `routers/departments.py` | `GET /departments/{code}` - department page data (MON-107) |
| `routers/groups.py` | `GET /groups/{slug}` - parliamentary group page data (ADR-026) |
| `routers/themes.py` | `GET /themes/{slug}` - theme hub pages (MON-106) |
| `routers/search.py` | `POST /search/` - RAG query, plus chat share snapshots (ADR-024) |
| `routers/verify.py` | `POST /verify/` + `GET /verify/{id}` - fact-check verdicts (ADR-022) |
| `routers/quiz.py` | `/quiz/*` - questions, weekly scrutin, stateless matching, share snapshots (ADR-025) |
| `routers/feedback.py` | Chat thumbs and data-page error reports (MON-70, MON-101) |
| `routers/keys.py` | `GET /keys/usage` - usage accounting for the calling key |
| `quiz_data.py` | Curated, versioned quiz question set - updated quarterly by PR (ADR-025) |
| `departments_data.py` · `groups_data.py` · `themes_data.py` | Canonical code/slug ↔ label maps, mirrored in `frontend/src/lib/` |
| `schemas.py` | Pydantic response models (all fields `Optional` to match DB NULLs) |

### Frontend (`frontend/`)

Next.js 15 (App Router) + Tailwind + Framer Motion, deployed on Vercel separately from the FastAPI backend. Dark mode is supported (ADR-027).

| Route | Purpose |
|---|---|
| `/` | Landing page - cinematic scroll experience, live stats, hero search |
| `/deputes` · `/deputes/[id]` · `/deputes/tableau` · `/deputes/comparer` | Deputy directory, profile, dense sortable table, side-by-side comparison |
| `/votes` · `/votes/[id]` | Vote list and vote detail with per-deputy positions |
| `/groupes/[slug]` · `/departements/[code]` · `/themes/[slug]` | Group, department, and theme hub pages |
| `/chat` · `/chat/s/[id]` | RAG chat (the fact-check UI lives here, ADR-023) and shared answer snapshots |
| `/verifier` · `/verifier/v/[id]` | Redirect to the chat · shared fact-check verdicts |
| `/quiz` · `/quiz/s/[id]` | Vote-matching quiz and shared results |
| `/mon-depute` | Personal deputy view |
| `/embed/votes/[id]` | Embeddable vote widget |
| `/partager` | Web Share Target endpoint (MON-115) - normalises an OS share payload into a claim and redirects to `/chat?mode=verify` |
| `/donnees` · `/developpeurs` · `/methodologie` | Open data, API usage guide, methodology |
| `/api/revalidate` | Internal ISR revalidation webhook, guarded by a shared secret - not a public route |
| `/a-propos` · `/accessibilite` · `/mentions-legales` · `/confidentialite` · `/licence-donnees` | Institutional pages |

| Module | Purpose |
|---|---|
| `src/lib/api.ts` | Typed API client for all backend endpoints |
| `src/lib/seo.ts` · `src/app/sitemap.ts` | Canonical site URL, metadata helpers, generated sitemap |
| `src/lib/an.ts` | Official assemblee-nationale.fr URLs built from stored ids - the deputy profile link behind `Person.sameAs` and the dossier link shared by vote cards and `Event.about` (MON-267) |
| `src/lib/faq.ts` | Q&A copy for `/methodologie` and `/a-propos`, rendered as the visible text *and* published as `FAQPage` JSON-LD (MON-268) - edit the answers here, not in the pages; `__tests__/app/faq-jsonld.test.tsx` fails if the two diverge |
| `src/lib/exports.ts` | The three published CSV exports, described once - `/donnees` renders the cards from this array and `buildDataCatalogJsonLd()` marks the same entries up as `DataCatalog`/`Dataset` JSON-LD (MON-262); `__tests__/app/dataset-jsonld.test.tsx` fails if the page and the markup diverge |
| `src/components/home/` | Landing-page scenes, live pulse panel, trust strip |
| `src/components/HeroSearch.tsx` · `GlobalSearch.tsx` | Search entry points wired to the API |

### Ingestion (`scripts/`)

| Script | Purpose |
|---|---|
| `ingest_deputies.py` | Downloads AMO10 ZIP, upserts deputy profiles |
| `ingest_votes.py` | Downloads Scrutins ZIP, upserts votes (`--since` flag) |
| `ingest_positions.py` | Extracts individual deputy positions from Scrutins ZIP |
| `ingest_organes.py` | Parses `Organes.json` for parliamentary group membership |
| `ingest_agenda.py` | Downloads the Agenda ZIP, upserts séance publique ODJ points (`--since` flag, MON-210) |
| `run_ingestion_prod.py` | Orchestrates the full pipeline with timing summary |
| `update_party.py` | Resolves GP party names and expands department codes |
| `backfill_party_labels.py` | Enforces the 12 canonical group labels behind `/groups/{slug}` |
| `generate_vote_summaries.py` | LLM-generated plain-French vote summaries (`summarize_backfill.yml`) |
| `create_dbt_profile.py` | Writes `transform/profiles.yml` from `DBT_*` env vars (CI + deploy) |
| `migrate.py` | Applies pending migrations against the ledger - also the Railway start hook |
| `check_db_size.py` | Prints table sizes and DB storage usage |
| `purge_test_fixtures.py` | Removes test fixture rows from a database |

All scripts use exponential-backoff retry (5 attempts, 2 s base) and upsert via `ON CONFLICT ... DO UPDATE`.

---

## Security

- **CORS:** `allow_credentials=False`, `allow_methods=["GET", "POST"]` - POST required for `/search`. An empty `CORS_ORIGINS` blocks all cross-origin requests and logs a startup warning
- **Input validation:** `limit` capped at 200, `offset` at 100,000 on all list endpoints
- **Error handling:** Global 500 handler returns a generic message - no tracebacks or DSNs in responses
- **Rate limiting:** Per-endpoint limits (30 / 10 / 300 rpm), keyed by API key id or remote IP
- **API keys:** Stored as sha256 hashes only; issued manually, never self-service
- **No secrets in git:** All credentials via environment variables; `.env` is gitignored

---

## Code Quality

```bash
pip install pre-commit ruff
pre-commit install       # runs automatically on every git commit
```

| Hook | What it enforces |
|---|---|
| `trailing-whitespace` | No stray spaces at line ends |
| `end-of-file-fixer` | Files end with a newline |
| `check-yaml` / `check-json` | Syntax errors in config files |
| `check-merge-conflict` | No committed `<<<<<<` markers |
| `check-added-large-files` | Blocks files over 500 KB |
| `debug-statements` | Blocks `breakpoint()` / `pdb.set_trace()` |
| `ruff` | Lint + auto-fix (imports, bugbear patterns, isort) |
| `ruff-format` | Black-compatible formatting |

Lint config: `ruff.toml` — line length 100, `T201` (print) allowed in `scripts/` and `rag/`.

### Tests

```bash
pytest tests/ -m "not integration"    # unit tests - no database required
pytest tests/integration -m integration
cd frontend && npm test               # Jest + Testing Library
```

Both suites run on every PR via `ci.yml` and block merge on failure.

`tests/unit/test_readme_endpoints.py` checks the **API Endpoints** tables above against `app.openapi()` and the live slowapi limits: adding, removing, or re-limiting an endpoint without updating this file fails CI. Edit the table, don't loosen the test.
The same file asserts every route in the spec has a non-empty `summary` and a description of real length, so a new endpoint cannot ship undocumented (MON-260). FastAPI reads `summary` off the `@router` decorator and `description` off the handler's docstring.

---

## Data Notes

- **`nonVotant` ≠ `abstention`** — present in chamber but did not vote; counts *toward* `presence_rate` (a nonVotant deputy was present) but is excluded from the pour/contre/abstention percentages (see ADR-019 in `docs/decisions.md`)
- **Yaël Braun-Pivet at 100% presence** — Présidente de l'AN, recorded on every scrutin by the AN data system
- **`rejeté` outnumbers `adopté`** — the 17th legislature has no stable majority
- **Party names** — resolved from `Organes.json` GP mandats; 575/577 deputies covered (2 have no active parliamentary group — expected edge case)
- **Department names** — full text (`"78"` → `"Yvelines"`) for all 96 metropolitan + DOM departments
- **Ingestion window** — production DB holds votes from `2025-07-01` (Supabase free tier); run `--since 2024-07-07` locally for the full legislature

---

## Error Handling

All unhandled exceptions return a consistent envelope — never a traceback:

```json
{"error": "Internal server error", "status": 500}
```

Full stack traces are written to the server log (`logging.error`) and never exposed to clients.
