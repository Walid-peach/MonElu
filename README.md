# MonÉlu
> Every vote. Every deputy. In plain French.

Live API: https://monelu-production.up.railway.app

---

## Architecture

```
[FastAPI on Railway] → [PostgreSQL + pgvector on Supabase]
```

The API tier (Railway) is stateless and auto-restarts on failure. All state lives in Supabase, which provides managed Postgres with pgvector pre-installed (used in Phase 2 for semantic search over legislative texts).

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | HTML landing page — live stats, latest votes, civic design |
| GET | `/deputies` | List all deputies (filter: `search`, `department`) |
| GET | `/deputies/{id}` | Deputy profile |
| GET | `/deputies/{id}/scorecard` | Presence rate, vote breakdown |
| GET | `/votes` | List votes (filter: `result`) |
| GET | `/votes/latest` | Last 10 votes |
| GET | `/votes/{id}` | Vote detail + all individual positions |
| GET | `/health` | API status + record counts |
| POST | `/search` | RAG chatbot — natural language query over the legislative corpus *(Phase 2)* |

Interactive docs: `/docs`

---

## Rate Limiting

Implemented with [slowapi](https://github.com/laurentS/slowapi) (limits by remote IP).

| Scope | Limit |
|---|---|
| All endpoints (global default) | 60 requests / minute |
| `GET /deputies/{id}/scorecard` | 10 requests / minute |

When a limit is exceeded the API returns HTTP 429 with:
- JSON body: `{"error": "Too Many Requests", "detail": "..."}`
- `Retry-After` header (seconds until window resets)
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers on every response

---

## Stack

FastAPI · slowapi · PostgreSQL + pgvector (Supabase) · Python 3.11 · Railway

**Phase 2 additions:** OpenAI `text-embedding-3-small` · Groq `llama-3.3-70b-versatile` · tiktoken · MLflow

---

## Data Sources

Assemblée Nationale Open Data — `data.assemblee-nationale.fr`
Static ZIP exports only — no REST API is available.

| Dataset | File |
|---|---|
| Deputies + organes (active, 17th legislature) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` |
| Votes (scrutins, since 2025-07-01) | `Scrutins.json.zip` |

---

## Local Setup

### Prerequisites

- Docker + Docker Compose (for local Postgres)
- Python 3.11+ (tested on 3.14)

### Steps

```bash
git clone <repo> && cd MonElu
cp .env.example .env        # set DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY

# create virtualenv
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# start local Postgres
make start

# apply schema
make migrate

# ingest data
make ingest                 # local, full dataset
make ingest-prod            # remote, since 2025-01-01

# fix party names and department codes
make fix-deputies

# start API
make api
# → http://localhost:8000/docs
```

### Makefile targets

```
make start          docker compose up -d
make stop           docker compose down
make migrate        apply 001_init.sql to DATABASE_URL
make ingest         deputies → votes → positions (local, full)
make ingest-prod    run_ingestion_prod.py --since 2025-01-01
make fix-deputies   resolve party names + expand department codes
make api            uvicorn api.main:app --reload
make psql           psql into the running Postgres container
make check-db       print table sizes, row counts, pgvector status
make rag-index      embed all chunks and store to document_chunks
make rag-stats      print document_chunks breakdown by chunk_type
make rag-clear      truncate document_chunks
make rag-test       run a sample RAG query end-to-end
make rag-eval       run MLflow evaluation over 10 golden Q&A pairs
make mlflow-ui      open MLflow experiment dashboard on port 5001
```

---

## Database Schema

### `deputies`
| Column | Type | Notes |
|---|---|---|
| `deputy_id` | TEXT PK | AN uid e.g. `PA1592` |
| `full_name` | TEXT | |
| `first_name` / `last_name` | TEXT | |
| `party` | TEXT | Full GP name e.g. `Rassemblement National` |
| `party_short` | TEXT | organeRef e.g. `PO845401` |
| `circonscription` / `department` | TEXT | Full name e.g. `Yvelines` |
| `mandate_start` / `mandate_end` | DATE | end is null if active |
| `photo_url` | TEXT | `assemblee-nationale.fr/dyn/static/tribun/photos/{uid}.jpg` |

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

### `document_chunks` *(Phase 2 — semantic search)*
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `content` | TEXT | French prose chunk ready for embedding |
| `metadata` | JSONB | `chunk_type`, `vote_id` or `deputy_id`, etc. |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |

---

## API Modules

| Module | What it does |
|---|---|
| `api/main.py` | App entry point — CORS, rate limiting, exception handlers, landing page, health check |
| `api/limiter.py` | Shared slowapi `Limiter` instance (60 req/min default, IP-keyed) |
| `api/routers/deputies.py` | Deputy list, profile, and scorecard endpoints |
| `api/routers/votes.py` | Vote list, latest, and detail endpoints |
| `api/routers/search.py` | `POST /search` — RAG query endpoint *(Phase 2)* |
| `api/schemas.py` | Pydantic response models |

## Ingestion Scripts

| Script | What it does |
|---|---|
| `scripts/explore_an_exports.py` | Lists all ZIP export URLs from any portal page |
| `scripts/ingest_deputies.py` | Downloads AMO10 ZIP, upserts deputies |
| `scripts/ingest_votes.py` | Downloads Scrutins ZIP, upserts votes (`--since` flag) |
| `scripts/ingest_positions.py` | Same ZIP, extracts individual deputy positions |
| `scripts/run_ingestion_prod.py` | Runs all three in order with timing summary |
| `scripts/explore_organes.py` | Explores organe ZIP structure (used for debugging) |
| `scripts/ingest_organes.py` | Builds `{organe_uid → party_name}` and `{deputy_id → party}` maps |
| `scripts/update_party.py` | Updates `deputies.party` (GP names) and `deputies.department` (full names) |
| `scripts/migrate.py` | Applies 001_init.sql, checks pgvector |
| `scripts/check_db_size.py` | Prints table sizes and DB storage usage |

All ingestion scripts use exponential-backoff retry (5 attempts, base 2s) and upsert with `ON CONFLICT ... DO UPDATE`.

## RAG Pipeline *(Phase 2)*

```
rag/
├── pipeline/
│   ├── chunker.py        Two strategies: vote chunks + deputy summary chunks
│   ├── embedder.py       Batch embed via OpenAI, store to document_chunks
│   └── index_manager.py  CLI: build / stats / clear
├── chain/
│   ├── retriever.py      pgvector cosine similarity search
│   ├── prompts.py        System prompt + RAG template (French, factual)
│   └── rag_chain.py      ask() — retrieves context, calls Groq LLM
└── experiments/
    └── mlflow_eval.py    10 golden Q&A pairs, keyword scoring, MLflow logging
```

**Chunking stats:** 3,149 vote chunks + 577 deputy chunks = 3,726 total · avg 85.7 tokens/chunk · estimated embedding cost ~$0.006

---

## Security

- **CORS:** `allow_credentials=False`, `allow_methods=["GET"]` — public read-only API
- **Input validation:** `limit` capped at 200, `offset` capped at 100,000 on all list endpoints
- **Error handling:** Global 500 handler returns generic message — no tracebacks or DSNs in responses
- **Rate limiting:** 60 req/min global, 10 req/min on scorecard (by IP)
- **No secrets in git:** All credentials via environment variables; `.env` is gitignored

---

## Known Data Notes

- **Party names now populated** — resolved from `Organes.json` GP mandats in the deputies ZIP. 575/577 deputies have a party name; 2 had no active GP or PARPOL mandat in the export.
- **Department names now full text** — `"78"` → `"Yvelines"`, etc. for all 96 metropolitan + DOM departments.
- **`nonVotant` ≠ `abstention`** — a `nonVotant` deputy was present but did not cast a vote. Excluded from `presence_rate` in the scorecard.
- **Yaël Braun-Pivet at 100% presence** — Présidente de l'AN, recorded on every scrutin by the AN data system.
- **`rejeté` outnumbers `adopté`** — the 17th legislature has no stable majority; most amendments are rejected.
- **Ingestion window** — production DB uses `--since 2025-07-01` (Supabase free tier). Run `--since 2024-07-07` for the full legislature.

---

## Error Handling

All unhandled exceptions are caught by a global handler in `api/main.py`. The client always receives:

```json
{"error": "Internal server error", "status": 500}
```

The full traceback is written to the server log (`logging.error`) and never exposed in the response body.
