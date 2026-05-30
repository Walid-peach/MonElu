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
| Phase 5 | Deferred | AWS infrastructure — Terraform IaC written and validate-passing (`infra/`) but not applied. Managed services (Railway + Supabase) cover current load; AWS migration deferred until scale justifies the ops overhead. Kafka removed entirely — streaming is not needed at current ingestion cadence. |
| Phase 6 | Live | CI/CD — PR gates (ruff, pytest, dbt test bot), deploy workflow, Terraform validate in CI |

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
| Vector index | IVFFlat via pgvector (`<=>` cosine) | `ivfflat.probes=10`; notable-deputy pin for recall gaps |
| CI/CD | GitHub Actions (5 workflows) | See Workflows section |
| Experiment tracking | MLflow (local) | k=3 vs k=5 retrieval eval; baseline score 0.58 |
| IaC | Terraform ~> 5.0 (AWS, validate-only) | `infra/` — not applied |

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

# Terraform (validate-only — no AWS account required)
cd infra && terraform init -backend=false && terraform validate
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
  → Railway (FastAPI)            JSON responses · HTML landing page · POST /search (RAG)
```

### GitHub Actions Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Every PR to `master` | ruff lint + pytest (unit) + dbt compile + dbt test; posts dbt results as PR comment |
| `deploy.yml` | Merge to `master` | dbt deps → run → test against prod Supabase |
| `ingest_prod.yml` | Daily 06:00 UTC, weekdays | Ingest new votes + deputies + rebuild RAG index |
| `dbt_docs.yml` | Push to `master` touching `transform/` | Generate + deploy lineage docs to GitHub Pages |
| `terraform.yml` | PRs touching `infra/` | terraform fmt + init + validate (no credentials) |

### Key Layers

**`api/`** — FastAPI application
- `main.py`: App factory, CORS (GET-only public read), slowapi rate limiting (60 req/min global, 10 req/min on scorecard), global exception handler, HTML landing page with live stats. `/health` returns DB status, record counts, last ingestion timestamp, and dbt mart row counts.
- `routers/deputies.py`, `routers/votes.py`, `routers/search.py`: All DB queries — direct SQL, no ORM
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
- `pipeline/embedder.py`: Batched OpenAI embedding (100 chunks/batch), stores into `document_chunks`. Assumes table is empty — callers must truncate first.
- `pipeline/index_manager.py`: `build` / `stats` / `clear` CLI. `build` always truncates before embedding.
- `chain/retriever.py`: Cosine similarity via pgvector `<=>`. Supports `chunk_type`, `deputy_id`, and auto-detected `result` filters (`adopté`/`rejeté`). Notable deputy names (Attal, Le Pen) are detected and their chunk pinned as the first result, bypassing IVFFlat recall gaps. `ivfflat.probes=10` is set per query. Note: `register_vector` requires a plain psycopg2 cursor, not a `RealDictCursor`.
- `chain/prompts.py`: French civic assistant system prompt + RAG context template
- `chain/rag_chain.py`: `ask()` — retrieve → format → Groq `llama-3.3-70b-versatile` (temperature=0.2)
- `experiments/mlflow_eval.py`: 10 golden Q&A pairs, keyword scoring, k=3 vs k=5 MLflow experiment. Baseline score: 0.58.
- 3,741 chunks in production: 3,149 vote + 577 deputy + 12 party + 1 global_stats + 2 notable_deputy · avg 87 tokens · $0.0065 to embed

**`infra/`** — Terraform IaC (validate-only)
- AWS stack defined in four modules: `networking` (VPC, subnets, IGW, NAT, security groups), `s3` (bronze/silver/gold/artifacts), `rds` (PostgreSQL 15 + pgvector), `ec2` (Airflow + Spark)
- Passes `terraform validate` and `terraform fmt -check` without AWS credentials
- Not applied — see Phase 5 in the decisions log

**`data/migrations/001_init.sql`** — Full schema
- Four tables: `deputies`, `votes`, `vote_positions`, `document_chunks`
- All `CREATE TABLE IF NOT EXISTS` — safe to re-run

### Database

| Table | Purpose |
|-------|---------|
| `deputies` | 577 deputy profiles (party, department, photo_url, mandate dates) |
| `votes` | Legislative votes (title, result adopté/rejeté, aggregate counts) |
| `vote_positions` | Per-deputy position per vote (pour/contre/abstention/nonVotant) |
| `document_chunks` | Phase 2: content + JSONB metadata + vector(1536) |

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
- `print()` allowed in `scripts/` and `rag/` (T201 ignored there), blocked elsewhere
- B008 ignored to allow FastAPI `Depends()` defaults
- Pre-commit hooks run automatically on `git commit`

---

## Decisions Log

Key architectural choices made during the build and why. Consult this before proposing changes that touch these areas.

### 1. Railway + Supabase over self-hosted AWS

**Decision:** Host on Railway (API) + Supabase (PostgreSQL) rather than provisioning EC2 + RDS.

**Why:** Zero ops overhead. Railway auto-deploys on push, handles TLS and routing. Supabase provides managed PostgreSQL 15 with pgvector pre-installed and a generous free tier. At current scale (577 deputies, ~1 200 votes, ~715 k positions) there is no load that justifies the complexity and cost of a self-managed AWS stack. Terraform IaC is written and validate-passing in `infra/` for the day scale demands it, but it is explicitly not applied.

### 2. No ORM — direct psycopg2

**Decision:** All DB queries use direct SQL via psycopg2 `RealDictCursor`, with no SQLAlchemy or other ORM.

**Why:** The queries are analytical (aggregate counts, filtered vote records, scorecard rankings) and benefit from explicit SQL. An ORM adds indirection without value here. Parameterized queries handle injection safety; `RealDictCursor` returns dicts directly, matching the JSON response shape without a mapping layer.

### 3. Kafka removed — batch over streaming

**Decision:** Kafka (MSK) was planned for a streaming ingestion phase but removed entirely. The MSK security group and module were deleted from `infra/`. There is no streaming pipeline.

**Why:** The Assemblée Nationale publishes vote data as daily ZIP exports, not a real-time stream. A daily GitHub Actions cron job (`ingest_prod.yml`, 06:00 UTC weekdays) is the correct unit of work. Adding Kafka would introduce broker management, consumer group state, and schema registry complexity for no latency benefit — the data source itself is not real-time. If the AN ever publishes a live API, this decision should be revisited.

### 4. Groq for RAG inference, OpenAI for embeddings

**Decision:** Embeddings use OpenAI `text-embedding-3-small`; inference uses Groq `llama-3.3-70b-versatile`.

**Why:** OpenAI embeddings are the quality baseline for French text and are cheap at this corpus size ($0.006 per full re-index). Groq inference is free-tier, significantly faster than OpenAI Chat, and produces adequate quality for civic Q&A at temperature=0.2. Separating the embedding and inference providers gives independent cost and quality control over each.

### 5. IVFFlat + notable-deputy pin for RAG retrieval

**Decision:** pgvector uses IVFFlat (not HNSW) with `ivfflat.probes=10`. A hard-coded name list (Attal, Le Pen, etc.) pins the named deputy's chunk as the first result, bypassing the index.

**Why:** At 3 741 chunks, IVFFlat is fast enough and simpler to tune than HNSW. However, IVFFlat has known recall gaps for high-profile deputies whose names appear across many chunks — the index can return a generic vote chunk instead of the deputy profile. The pin is a targeted workaround: it adds one exact-match lookup before the vector search and is cheaper than retuning the entire index. This should be revisited if the corpus grows substantially or if HNSW becomes the default.

### 6. dbt for the transform layer

**Decision:** Raw ingestion tables feed a dbt project (`transform/`) with staging → intermediate → marts layers. Marts are tested in CI on every PR.

**Why:** Clean separation between ingestion (idempotent upserts) and analytics (typed, tested, documented models). dbt provides lineage docs (auto-deployed to GitHub Pages), schema tests that block bad data from reaching the API, and a reproducible `dbt run` that can rebuild marts from scratch. The alternative — embedding business logic in the API queries — makes the queries fragile and untestable.

### 7. Supabase free tier data horizon

**Decision:** Production ingestion starts from `2025-07-01`, not from the legislature start date (`2024-07-07`).

**Why:** Supabase free tier has a 500 MB database limit. The full legislature from 2024-07-07 exceeds this. Local dev uses Docker and can hold the full dataset. If the production tier is upgraded, `make ingest-prod` can be run with an earlier start date to backfill — the upsert logic is idempotent.

### 8. Upsert-only ingestion

**Decision:** All ingestion scripts use `INSERT ... ON CONFLICT ... DO UPDATE`. There are no `DELETE` statements in the pipeline.

**Why:** The AN open data portal is append-only in practice (votes are not retroactively removed). Upsert semantics make the pipeline safe to re-run at any time without data loss, simplifying the cron job — it does not need to track state between runs. If a vote record is corrected upstream, the next run overwrites it correctly.
