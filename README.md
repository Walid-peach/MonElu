# MonÉlu

[![CI](https://github.com/Walid-peach/MonElu/actions/workflows/ci.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/ci.yml)
[![Deploy](https://github.com/Walid-peach/MonElu/actions/workflows/deploy.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/deploy.yml)
[![Terraform](https://github.com/Walid-peach/MonElu/actions/workflows/terraform.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/terraform.yml)
[![dbt docs](https://github.com/Walid-peach/MonElu/actions/workflows/dbt_docs.yml/badge.svg)](https://github.com/Walid-peach/MonElu/actions/workflows/dbt_docs.yml)

> Every vote. Every deputy. In plain French.

MonÉlu is a civic transparency platform that makes the voting record of every deputy in the French Assemblée Nationale fully accessible — in plain language, in real time. Built for journalists, researchers, and engaged citizens who shouldn't need to dig through government ZIP exports to understand how their representatives vote.

**Live:** https://monelu-production.up.railway.app · **API docs:** `/docs`

---

## Roadmap

| Phase | Status | What it covers |
|-------|--------|----------------|
| **Phase 1** — Data platform | **Live** | Full ingestion pipeline, REST API, deputy profiles, vote records, scorecards |
| **Phase 2** — Intelligence layer | **Live** | Semantic search over the legislative corpus (RAG, pgvector, Groq LLM) |
| **Phase 3** — Automated refresh | **Live** | GitHub Actions daily cron — ingest + dbt run + RAG re-index |
| **Phase 4** — dbt transformation layer | **Live** | Staging → intermediate → marts; lineage docs on GitHub Pages |
| **Phase 5** — AWS infrastructure | **Deferred** | Terraform IaC written and validate-passing in `infra/`; not applied — Railway + Supabase cover current load |
| **Phase 6** — CI/CD | **Live** | PR gates (ruff, pytest, dbt test bot), deploy workflow, Terraform validate |

---

## Architecture

```
Assemblée Nationale Open Data (ZIP exports)
  → scripts/ingest_*.py          fetch · parse · upsert with exponential-backoff retry
  → Supabase PostgreSQL          deputies · votes · vote_positions · document_chunks
  → dbt (GitHub Actions)         staging → intermediate → analytics_marts
  → api/routers/                 direct psycopg2, RealDictCursor, parameterized SQL
  → Railway (FastAPI)            JSON API · HTML landing page · POST /search (RAG)
```

The API tier is fully stateless. All state lives in Supabase (managed Postgres with pgvector). Railway restarts on failure; `/health` returns live DB counts on every check.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Landing page — live stats, latest votes, RAG demo |
| GET | `/deputies` | List all deputies (`search`, `department` filters) |
| GET | `/deputies/{id}` | Deputy profile |
| GET | `/deputies/{id}/scorecard` | Presence rate, vote breakdown by position |
| GET | `/votes` | List votes (`result` filter) |
| GET | `/votes/latest` | Last 10 votes |
| GET | `/votes/{id}` | Vote detail + all individual positions |
| GET | `/health` | API status + live record counts + dbt mart row counts |
| POST | `/search` | Natural language query over the legislative corpus *(Phase 2)* |

---

## Rate Limiting

Implemented with [slowapi](https://github.com/laurentS/slowapi), keyed by remote IP.

| Scope | Limit |
|---|---|
| Global default | 60 req / min |
| `GET /deputies/{id}/scorecard` | 10 req / min |

On limit exceeded: HTTP 429 · `{"error": "Too Many Requests", "detail": "..."}` · `Retry-After` + `X-RateLimit-*` headers.

---

## Stack

**Core:** FastAPI · PostgreSQL 15 + pgvector (Supabase) · Python 3.11 · Railway · slowapi

**Phase 2 — RAG:** OpenAI `text-embedding-3-small` · Groq `llama-3.3-70b-versatile` · tiktoken · MLflow

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
make rag-stats      chunk counts by type
make rag-clear      truncate document_chunks
make rag-test       run 3 sample queries end-to-end
make rag-eval       MLflow k=3 vs k=5 evaluation
make mlflow-ui      MLflow dashboard at http://localhost:5001

make dbt-run        run all dbt models (staging → marts)
make dbt-test       run all dbt tests
make dbt-docs       generate + serve docs at http://localhost:8082
make dbt-lineage    open lineage graph in browser
make dbt-clean      remove compiled dbt artifacts
```

> **Note:** Airflow and MinIO run locally only (Docker) and are not part of the production stack. See ADR-006.

---

## Phase 4 — dbt Transformation Layer

A full dbt project (`transform/`) sits between raw ingestion and the FastAPI layer.

### Layers

| Layer | Schema | Materialisation | Models |
|---|---|---|---|
| **Staging** | `analytics_staging` | View | `stg_deputies`, `stg_votes`, `stg_vote_positions` |
| **Marts** | `analytics_marts` | Table | `mart_deputy_scorecard`, `mart_vote_summary` |

### What FastAPI reads

| Endpoint | Source |
|---|---|
| `GET /deputies/{id}/scorecard` | `analytics_marts.mart_deputy_scorecard` |
| `GET /votes` · `GET /votes/latest` | `analytics_marts.mart_vote_summary` |
| `GET /votes/{id}` | `analytics_marts.mart_vote_summary` + raw `vote_positions` |
| Landing page latest votes | `analytics_marts.mart_vote_summary` |

### Production deployment

dbt runs automatically on every merge to `master` via `deploy.yml`, and after every ingestion in `ingest_prod.yml`.
Lineage docs are published to GitHub Pages on push to `master` touching `transform/`.

Required GitHub secrets: `DBT_HOST` · `DBT_PORT` · `DBT_USER` · `DBT_PASSWORD` · `DBT_DBNAME`

---

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Every PR to `master` | ruff lint + pytest + dbt compile + dbt test (posts results as PR comment) |
| `deploy.yml` | Merge to `master` | dbt run + test against prod Supabase |
| `ingest_prod.yml` | Daily 06:00 UTC, weekdays | Ingest votes + deputies + rebuild RAG index |
| `dbt_docs.yml` | Push to `master` touching `transform/` | Deploy lineage docs to GitHub Pages |
| `terraform.yml` | PRs touching `infra/` | terraform fmt + init + validate (no credentials needed) |

All PRs must pass CI before merge — see [`docs/branch_protection.md`](docs/branch_protection.md).

---

## RAG Pipeline (Phase 2)

```
rag/
├── pipeline/
│   ├── chunker.py        Five chunk strategies: vote, deputy, party, global_stats, notable_deputy
│   ├── embedder.py       Batched OpenAI embedding (100 chunks/batch) → document_chunks
│   └── index_manager.py  CLI: build / stats / clear
├── chain/
│   ├── retriever.py      pgvector cosine similarity (ivfflat.probes=10, notable deputy pinning)
│   ├── prompts.py        French civic assistant system prompt + RAG template
│   └── rag_chain.py      ask() — retrieve → format → Groq LLM
└── experiments/
    └── mlflow_eval.py    10 golden Q&A pairs, keyword scoring, k=3 vs k=5 experiment
```

**Index stats:** 3,741 chunks · avg 87 tokens · ~$0.0065 to embed · $0 per query (question embedding only)

Notable deputy pinning (Attal, Le Pen, etc.) bypasses IVFFlat for known deputy names to fix recall gaps — see ADR-008.

---

## Infrastructure (Terraform — validate-only)

Full AWS stack defined as code in `infra/`. Not applied — see ADR-003 and ADR-004.

| Module | Resources |
|--------|-----------|
| networking | VPC, 2 public + 2 private subnets, IGW, NAT gateway, 2 security groups |
| s3 | 4 buckets: bronze, silver, gold, artifacts (versioned, encrypted, public access blocked) |
| rds | PostgreSQL 15 + pgvector, 20 GB gp3, 7-day backups |
| ec2 | Airflow + Spark instances (Ubuntu 24.04, Docker on boot, S3 IAM profile) |

```bash
cd infra
terraform init -backend=false
terraform validate
# Success! The configuration is valid.
```

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
| `position_id` | BIGSERIAL PK | |
| `vote_id` | TEXT FK → votes | |
| `deputy_id` | TEXT FK → deputies | |
| `position` | VARCHAR(15) | `pour` / `contre` / `abstention` / `nonVotant` |

### `document_chunks` *(Phase 2)*
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `content` | TEXT | French prose chunk |
| `metadata` | JSONB | `chunk_type`, `vote_id` or `deputy_id`, etc. |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |

---

## Code Structure

### API (`api/`)

| Module | Purpose |
|---|---|
| `main.py` | App entry point — CORS, rate limiting, exception handlers, landing page, health check |
| `limiter.py` | Shared slowapi `Limiter` instance |
| `routers/deputies.py` | Deputy list, profile, and scorecard endpoints |
| `routers/votes.py` | Vote list, latest, and detail endpoints |
| `routers/search.py` | `POST /search` — RAG query endpoint |
| `schemas.py` | Pydantic response models (all fields `Optional` to match DB NULLs) |

### Ingestion (`scripts/`)

| Script | Purpose |
|---|---|
| `ingest_deputies.py` | Downloads AMO10 ZIP, upserts deputy profiles |
| `ingest_votes.py` | Downloads Scrutins ZIP, upserts votes (`--since` flag) |
| `ingest_positions.py` | Extracts individual deputy positions from Scrutins ZIP |
| `run_ingestion_prod.py` | Orchestrates the full pipeline with timing summary |
| `update_party.py` | Resolves GP party names and expands department codes |
| `migrate.py` | Applies `001_init.sql` — also the Railway start hook |
| `check_db_size.py` | Prints table sizes and DB storage usage |

All scripts use exponential-backoff retry (5 attempts, 2 s base) and upsert via `ON CONFLICT ... DO UPDATE`.

---

## Security

- **CORS:** `allow_credentials=False`, `allow_methods=["GET"]` — public read-only API
- **Input validation:** `limit` capped at 200, `offset` at 100,000 on all list endpoints
- **Error handling:** Global 500 handler returns a generic message — no tracebacks or DSNs in responses
- **Rate limiting:** 60 req/min global, 10 req/min on scorecard, keyed by IP
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

---

## Data Notes

- **`nonVotant` ≠ `abstention`** — present in chamber but did not vote; excluded from `presence_rate`
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
