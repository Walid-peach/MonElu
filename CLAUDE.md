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
| CI/CD | GitHub Actions (4 workflows) | See Workflows section |
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
| `ci.yml` | Every PR to `master` | ruff lint + pytest (unit) + dbt compile + dbt test; posts dbt results as PR comment |
| `deploy.yml` | Merge to `master` | dbt deps → run → test against prod Supabase |
| `ingest_prod.yml` | Daily 06:00 UTC, weekdays | Ingest new votes + deputies + rebuild RAG index |
| `dbt_docs.yml` | Push to `master` touching `transform/` | Generate + deploy lineage docs to GitHub Pages |

### Key Layers

**`api/`** — FastAPI application
- `main.py`: App factory, CORS (GET + POST — POST is needed for `/search`; an empty `CORS_ORIGINS` blocks all cross-origin requests and logs a startup warning), slowapi rate limiting (30 req/min global, 10 req/min on scorecard and search), global exception handler. `/health` returns DB status, record counts, last ingestion timestamp, and dbt mart row counts. The landing page is now the Next.js frontend (`frontend/`), not a FastAPI-served HTML page.
- `routers/deputies.py`, `routers/votes.py`, `routers/search.py`, `routers/verify.py`, `routers/departments.py`, `routers/groups.py`, `routers/quiz.py`: All DB queries — direct SQL, no ORM. `quiz.py` is the vote-matching quiz surface (MON-109, ADR-025): `GET /quiz/questions` serves the curated repo-file question set (`api/quiz_data.py`) enriched at request time with each question's live vote tallies from the `votes` table (`votes_for`, `votes_against`, `abstentions`, `result`, `vote_date` — MON-180; the question *content* still never comes from the DB), `POST /quiz/match` is a stateless agreement computation (nothing persisted or logged) that accepts an optional `focus_deputy_id` (MON-183 — the `/quiz?deputy=<id>` personalized entry from a deputy's profile page): when set, the response carries a `focus` field with that deputy's match, returned even below the ranking threshold (422 if the deputy is unknown; not persisted in shares), and `POST /quiz/share` / `GET /quiz/share/{id}` store and serve immutable result snapshots (recomputed server-side from the submitted answers — client percentages are never trusted) behind `/quiz/s/<id>` share URLs. `verify.py` is the fact-check surface (MON-126, ADR-022): `POST /verify/` runs the verification chain and stores an immutable verdict snapshot; `GET /verify/{id}` serves stored verdicts with no LLM call. `search.py` also carries the chat share surface (MON-66, ADR-024): `POST /search/share` persists a chat answer already returned by `POST /search/` (question, answer, sources, confidence) as an immutable snapshot; `GET /search/share/{id}` serves it with no LLM call, at share URL `/chat/s/<id>`. `departments.py` (MON-107) serves `GET /departments/{code}` — current deputies of a department with scorecard highlights, aggregates, and recent split votes; the code↔name map lives in `api/departments_data.py` (mirrors `scripts/update_party.py` DEPT_NAMES plus overseas collectivities; frontend copy in `frontend/src/lib/departments.ts`). `groups.py` (MON-150, ADR-026) serves `GET /groups/{slug}` — a parliamentary group's current members with presence/dissident highlights, average participation and dissidence, most-dissident members, and votes ranked by how divided the group was, plus its most recent scrutins; no new dbt mart — aggregates live over `mart_deputy_scorecard`/`mart_party_alignment` and raw `vote_positions`. The slug↔party label map lives in `api/groups_data.py` (12 canonical labels enforced by `scripts/backfill_party_labels.py`).
- `schemas.py`: Pydantic response models; all fields `Optional` to match DB NULLs
- `limiter.py`: Shared slowapi `Limiter` instance imported by routers

**`scripts/`** — Data ingestion and maintenance
- Scripts fetch ZIPs from the AN open data portal with exponential-backoff retry (5 attempts, 2 s base) and upsert via `ON CONFLICT ... DO UPDATE`
- `migrate.py` doubles as the Railway start hook (runs before uvicorn in `railway.json`)
- `run_ingestion_prod.py` orchestrates the full pipeline for production runs
- `create_dbt_profile.py` generates `transform/profiles.yml` from `DBT_*` env vars (used by CI and deploy workflows)

**`transform/`** — dbt project
- Three layers: `staging/` (typed views over raw tables) → `intermediate/` (business logic) → `marts/` (analytics-ready: `mart_deputy_scorecard`, `mart_vote_summary`)
- Tests run in CI on every PR and block merge on failure; results posted as PR comment
- Lineage docs auto-deployed to GitHub Pages on push to `master`

**`rag/`** — Phase 2 semantic search
- `pipeline/chunker.py`: Five chunk strategies: `vote` (one per scrutin), `deputy` (one per député), `party` (one per parliamentary group), `global_stats` (aggregate overview), `notable_deputy` (vote-by-vote for high-profile deputies). Uses tiktoken (cl100k_base) for token counting.
- `pipeline/embedder.py`: Batched OpenAI embedding (100 chunks/batch), stores into `document_chunks`.
- `pipeline/index_manager.py`: `build` / `stats` / `clear` CLI. `build` always truncates before embedding (full rebuild, ~$0.006/run).
- `chain/retriever.py`: Exact cosine similarity via pgvector `<=>`. Supports `chunk_type`, `deputy_id`, and auto-detected `result` filters (`adopté`/`rejeté`). Notable deputy names detected and their chunk pinned as first result. TTL-cached notable-deputy map (1h). Note: `register_vector` requires a plain psycopg2 cursor, not a `RealDictCursor`.
- `chain/prompts.py`: TTL-cached system prompt (data horizon refreshed hourly) via `build_system_prompt()`. Call per request — do not cache the return value.
- `chain/rag_chain.py`: `ask()` — retrieve → format → Groq `llama-3.3-70b-versatile` (temperature=0.2). RAG-path answers to claim-shaped input carry `suggested_action: "verify"` (ADR-023): `detect_claim()` in `llm_router.py` (regex pre-filter + small classifier) only annotates the response for the UI nudge - it never calls the verify chain.
- `chain/verify.py`: `verify_claim()` — claim verification (MON-126, ADR-022): deputy detection over all deputies, vote-chunk retrieval, positions join, structured JSON verdict (`vrai`/`faux`/`trompeur`/`inverifiable`). Cited vote_ids are validated against the votes table in code; low similarity, parse failure, or a factual verdict with no valid citation all force `inverifiable`.
- `experiments/mlflow_eval.py`: 11 golden Q&A pairs split into router suite (live SQL ground truth) and retrieval suite (keyword scoring).
- ~5,900 chunks in production (2026-07): 5,105 vote + 645 deputy + 12 party + 1 global_stats + 102 notable_deputy + 20 law_summary · party and global chunks count active mandates only

**`archive/infra-aws/`** — Archived AWS Terraform IaC (not live)
- Modeled an Airflow+Spark architecture never built, with no compute for the actual FastAPI app — archived rather than fixed (MON-46). See Phase 5 and decision 1 in the decisions log.
- `networking`, `s3`, `rds` modules are the only parts worth salvaging if an AWS migration ever happens; `ec2` does not survive that design.

**`data/migrations/001_init.sql`** — Full schema
- Four tables: `deputies`, `votes`, `vote_positions`, `document_chunks`
- All `CREATE TABLE IF NOT EXISTS` — safe to re-run
- `migrate.py` keeps a `schema_migrations` ledger: each file is applied once and skipped on later deploys

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
| `quiz_shares` | Stored quiz result snapshots (MON-139, ADR-025): server-recomputed, immutable snapshots behind `/quiz/s/<id>` share URLs |
| `feedback` | Generic user-feedback sink (MON-70, MON-101): `type`-discriminated rows (`chat` thumbs / `report` data-page error reports) with a JSONB `payload`; weekly manual triage query in `docs/monitoring.md` |

Important data quirks:
- `nonVotant` ≠ `abstention`: present in chamber but did not vote vs. formally abstained
- Yaël Braun-Pivet shows 100% presence — Présidente de l'AN, appears on every scrutin by design
- Production DB holds votes from `2025-07-01` (Supabase free tier); local dev can hold the full legislature from `2024-07-07`

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

---

## Code Style

Ruff is the single tool for lint and formatting (`ruff.toml`):
- Line length: 100
- `print()` allowed in `scripts/`, `rag/`, and `ingestion/` (T201 ignored there), blocked elsewhere
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
