# MonÉlu
> Every vote. Every deputy. In plain French.

MonÉlu is a civic transparency platform that makes the voting record of every deputy in the French Assemblée Nationale fully accessible — in plain language, in real time. Built for journalists, researchers, and engaged citizens who shouldn't need to dig through government ZIP exports to understand how their representatives vote.

**Live:** https://monelu-production.up.railway.app · **API docs:** `/docs`

---

## Roadmap

| Phase | Status | What it covers |
|-------|--------|----------------|
| **Phase 1** — Data platform | **Live** | Full ingestion pipeline, REST API, deputy profiles, vote records, scorecards |
| **Phase 2** — Intelligence layer | **Live** | Semantic search over the legislative corpus (RAG, pgvector, Groq LLM) |
| **Phase 3** — Pipeline infrastructure | *In progress* | Production-grade data orchestration and automated refresh pipelines |
| **Phase 4** — dbt transformation layer | **Live** | Silver staging models, Gold mart tables, 25+ automated tests, FastAPI reads from marts |
| **Phase 5** — Vote alert system | *In progress* | Email alerts when tracked deputies vote, SendGrid dispatch, Airflow + GitHub Actions triggers |

---

## Phase 5 — Vote Alert System

Subscribe to receive email alerts when your deputies vote.

### Subscribe

```
POST /alerts/subscribe
{"email": "you@example.com", "deputy_ids": ["PA722190"]}
```

### How it works

1. Subscribe with email + deputy IDs
2. Confirm via email link
3. GitHub Actions checks for new votes every 6h
4. Airflow DAG checks every 5min on session days (local dev)
5. Alert email sent via SendGrid within minutes of a vote

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/alerts/subscribe` | Subscribe to alerts for specific deputies |
| `GET` | `/alerts/confirm?token=…` | Confirm email subscription |
| `DELETE` | `/alerts/unsubscribe?email=…` | Unsubscribe from all alerts |
| `GET` | `/alerts/stats` | Subscriber counts and total alerts sent |

### Required secrets

Add to GitHub Actions (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Verified sender email (e.g. `alertes@monelu.fr`) |

---

## Phase 4 — dbt Transformation Layer

A full dbt project (`transform/`) sits between raw ingestion and the FastAPI layer. Every 6 hours the pipeline runs: ingest → dbt → RAG rebuild → API serves fresh Gold data.

### Layers

| Layer | Schema | Materialisation | Models |
|---|---|---|---|
| **Silver** (staging) | `analytics_staging` | View | `stg_deputies`, `stg_votes`, `stg_vote_positions` |
| **Gold** (marts) | `analytics_marts` | Table | `mart_deputy_scorecard`, `mart_vote_summary`, `mart_party_alignment` |

### What FastAPI reads

| Endpoint | Source |
|---|---|
| `GET /deputies/{id}/scorecard` | `analytics_marts.mart_deputy_scorecard` |
| `GET /votes` · `GET /votes/latest` | `analytics_marts.mart_vote_summary` |
| `GET /votes/{id}` | `analytics_marts.mart_vote_summary` + raw `vote_positions` |
| Landing page latest votes | `analytics_marts.mart_vote_summary` |

### Local dbt workflow

```bash
make dbt-run       # run all models (staging + marts)
make dbt-test      # run all 57 tests
make dbt-docs      # generate docs + serve at http://localhost:8082
make dbt-lineage   # open lineage graph in browser
make dbt-clean     # remove compiled artifacts
```

### Tests — 57 total

| Category | Count |
|---|---|
| Source freshness + not_null + unique (raw) | 16 |
| Staging not_null + unique + accepted_values + relationships | 16 |
| Mart not_null + unique + `dbt_utils.accepted_range` | 21 |
| Mart recency (`updated_at` within 1 day) | 1 |
| Source tests re-run with staging | 3 |

### Production deployment

dbt runs automatically after every ingestion in `.github/workflows/ingest_prod.yml`.
Required GitHub secrets: `DBT_HOST` · `DBT_PORT` · `DBT_USER` · `DBT_PASSWORD` · `DBT_DBNAME`

dbt docs are published to GitHub Pages on every push to `main` that touches `transform/`.

---

## Phase 3 — Orchestration & Bronze Layer

### Local development

```bash
make airflow-up    # Start Airflow (webserver + scheduler)
make minio-up      # Start MinIO (local S3)
make setup-minio   # Create Bronze buckets
make airflow-ui    # Open Airflow at localhost:8080
make minio-ui      # Open MinIO at localhost:9001
```

### DAGs

| DAG | Schedule | Description |
|-----|----------|-------------|
| `deputies_incremental` | Weekly Mon 6am | Deputies → GE → Bronze → Postgres |
| `votes_batch` | Every 2h weekdays | Votes → GE → Bronze → Postgres → positions |

### Production

GitHub Actions runs ingestion every 6 hours on weekdays.
Trigger manually: **GitHub → Actions → MonÉlu Production Ingestion → Run workflow**

Required secrets (Settings → Secrets and variables → Actions):
`DATABASE_URL` · `AN_API_BASE_URL` · `OPENAI_API_KEY` · `GROQ_API_KEY`

### Bronze layer

Raw data lands in MinIO at `s3://monelu-bronze/{entity}/year=Y/month=M/day=D/`

Hash-based change detection — skips write if data unchanged since last run.

---

## Architecture

```
Assemblée Nationale Open Data (ZIP exports)
  → Ingestion pipeline  (fetch · parse · upsert with retry)
  → PostgreSQL + pgvector on Supabase  (deputies · votes · positions · embeddings)
  → FastAPI on Railway  (stateless, auto-restart)
  → JSON API  /  HTML landing page  /  POST /search (RAG)
```

The API tier is fully stateless. All state lives in Supabase (managed Postgres with pgvector). Railway restarts the service on failure; the health endpoint returns live DB counts on every check.

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
| GET | `/health` | API status + live record counts |
| POST | `/search` | Natural language query over the legislative corpus *(Phase 2)* |

---

## Rate Limiting

Implemented with [slowapi](https://github.com/laurentS/slowapi), keyed by remote IP.

| Scope | Limit |
|---|---|
| Global default | 30 req / min |
| `GET /deputies/{id}/scorecard` | 10 req / min |

On limit exceeded: HTTP 429 · `{"error": "Too Many Requests", "detail": "..."}` · `Retry-After` + `X-RateLimit-*` headers.

---

## Stack

**Core:** FastAPI · PostgreSQL + pgvector (Supabase) · Python 3.11 · Railway · slowapi

**Phase 2:** OpenAI `text-embedding-3-small` · Groq `llama-3.3-70b-versatile` · tiktoken · MLflow

**Phase 3:** Apache Airflow 2.8 · MinIO (S3-compatible Bronze) · Great Expectations 0.18 · GitHub Actions

**Phase 4:** dbt 1.12 · dbt_utils · `analytics_staging` + `analytics_marts` schemas · 57 automated tests

**Code quality:** ruff (lint + format) · pre-commit

---

## Data Sources

Assemblée Nationale Open Data — `data.assemblee-nationale.fr`
Static ZIP exports only (no REST API available from the source).

| Dataset | File |
|---|---|
| Deputies + organes (active, 17th legislature) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` |
| Votes (scrutins, since 2025-07-01) | `Scrutins.json.zip` |

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

make start      # start local Postgres
make migrate    # apply schema
make ingest     # deputies → votes → positions
make fix-deputies
make api        # → http://localhost:8000/docs
```

### Makefile reference

```
make start          docker compose up -d
make stop           docker compose down
make migrate        apply 001_init.sql to DATABASE_URL
make ingest         full local ingestion (deputies → votes → positions)
make ingest-prod    production ingestion (--since 2025-01-01)
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

make airflow-up     start Airflow webserver + scheduler
make airflow-down   stop all Airflow services
make airflow-logs   tail scheduler logs
make airflow-ui     Airflow UI at http://localhost:8080
make minio-up       start MinIO
make minio-ui       MinIO console at http://localhost:9001
make setup-minio    create Bronze buckets (monelu-bronze, monelu-checkpoints)
make dag-deputies   manually trigger deputies_incremental DAG
make dag-votes      manually trigger votes_batch DAG

make dbt-run        run all dbt models (staging → marts)
make dbt-test       run all 57 dbt tests
make dbt-docs       generate + serve docs at http://localhost:8082
make dbt-lineage    open lineage graph in browser
make dbt-clean      remove compiled dbt artifacts
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

### Orchestration (`ingestion/`) — Phase 3

```
ingestion/
├── dags/
│   ├── dag_deputies_incremental.py   Weekly: fetch → GE validate → Bronze → Postgres
│   └── dag_votes_batch.py            Bi-hourly: check session → fetch → GE → Bronze → Postgres → positions
├── operators/                        (reserved for custom Airflow operators)
└── utils/
    └── bronze_writer.py              MinIO S3 writer — partitioned by date, hash-based deduplication
quality/
└── expectations/
    ├── deputies_suite.py             GE suite: row count 500–600, uid not null
    └── votes_suite.py                GE suite: row count, required columns, dateScrutin not null
```

### RAG Pipeline (`rag/`) — Phase 2

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

**Index stats:** 3,741 chunks · avg 87 tokens · $0.0065 to embed

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

## Security

- **CORS:** `allow_credentials=False`, `allow_methods=["GET"]` — public read-only API
- **Input validation:** `limit` capped at 200, `offset` at 100,000 on all list endpoints
- **Error handling:** Global 500 handler returns a generic message — no tracebacks or DSNs in responses
- **Rate limiting:** 60 req/min global, 10 req/min on scorecard, by IP
- **No secrets in git:** All credentials via environment variables; `.env` is gitignored

---

## Data Notes

- **`nonVotant` ≠ `abstention`** — present in chamber but did not vote; excluded from `presence_rate`
- **Yaël Braun-Pivet at 100% presence** — Présidente de l'AN, recorded on every scrutin by the AN data system
- **`rejeté` outnumbers `adopté`** — the 17th legislature has no stable majority
- **Party names** — resolved from `Organes.json` GP mandats; 575/577 deputies covered
- **Department names** — full text (`"78"` → `"Yvelines"`) for all 96 metropolitan + DOM departments
- **Ingestion window** — production DB holds votes from `2025-07-01` (Supabase free tier); run `--since 2024-07-07` locally for the full legislature

---

## Error Handling

All unhandled exceptions return a consistent envelope — never a traceback:

```json
{"error": "Internal server error", "status": 500}
```

Full stack traces are written to the server log (`logging.error`) and never exposed to clients.
