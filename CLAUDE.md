# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MonÉlu** is an open-source civic data platform tracking every vote cast by every French deputy in the Assemblée Nationale (17th legislature, since 2024-07-07). The tagline is "Every vote. Every deputy. In plain French."

Production API: https://monelu-production.up.railway.app

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

## Architecture

### Data Flow
```
Assemblée Nationale Open Data (ZIPs)
  → scripts/ingest_*.py  (fetch, parse, upsert with ON CONFLICT)
  → PostgreSQL (deputies, votes, vote_positions tables)
  → api/routers/  (direct psycopg2 with RealDictCursor, parameterized SQL)
  → FastAPI JSON responses / HTML landing page
```

### Key Layers

**`api/`** — FastAPI application
- `main.py`: App factory, CORS (GET-only public read), slowapi rate limiting (60 req/min global, 10 req/min on scorecard), global exception handler, HTML landing page with live stats
- `routers/deputies.py`, `routers/votes.py`: All DB queries live here — direct SQL, no ORM
- `schemas.py`: Pydantic models for all responses; all fields `Optional` to match DB NULLs
- `limiter.py`: Shared slowapi `Limiter` instance imported by routers

**`scripts/`** — Data ingestion and maintenance
- Scripts fetch ZIPs from the AN API with exponential-backoff retry, parse JSON entries, and upsert via `ON CONFLICT ... DO UPDATE`
- `migrate.py` is also the Railway start hook (runs before uvicorn in `railway.json`)
- `run_ingestion_prod.py` orchestrates the full pipeline for production runs

**`rag/`** — Phase 2 semantic search (live)
- `pipeline/chunker.py`: Generates text chunks — one per vote (French prose) and one per deputy (voting record summary). Uses tiktoken (cl100k_base) for token counting.
- `pipeline/embedder.py`: Batched OpenAI embedding (100 chunks/batch), stores into `document_chunks` via pgvector. Assumes table is empty — callers must truncate first.
- `pipeline/index_manager.py`: `build` / `stats` / `clear` CLI. `build` always truncates before embedding to prevent duplicates.
- `chain/retriever.py`: Cosine similarity retrieval via pgvector `<=>`. Supports `chunk_type` and `deputy_id` filters. Note: `register_vector` must receive a plain psycopg2 cursor, not a `RealDictCursor`.
- `chain/prompts.py`: French civic assistant system prompt + RAG context template.
- `chain/rag_chain.py`: `ask()` — retrieve → format → Groq `llama-3.3-70b-versatile` (temperature=0.2).
- `experiments/mlflow_eval.py`: 10 golden Q&A pairs, keyword scoring, k=3 vs k=5 MLflow experiment. Baseline score: 0.58.
- 3,726 chunks in production: 3,149 vote + 577 deputy, avg 86 tokens, $0.0064 to embed.

**`data/migrations/001_init.sql`** — Full schema
- Four tables: `deputies`, `votes`, `vote_positions`, `document_chunks` (pgvector)
- All `CREATE TABLE IF NOT EXISTS` — safe to re-run

### Database

| Table | Purpose |
|-------|---------|
| `deputies` | 577 deputy profiles (party, department, photo_url, mandate dates) |
| `votes` | Legislative votes (title, result adopté/rejeté, aggregate counts) |
| `vote_positions` | Per-deputy position per vote (pour/contre/abstention/nonVotant) |
| `document_chunks` | Phase 2 embeddings: content + JSONB metadata + vector(1536) |

Important data quirks:
- `nonVotant` ≠ `abstention`: present in chamber but did not vote vs. formally abstained
- Yaël Braun-Pivet shows 100% presence — she is Présidente de l'AN and appears on every scrutin by design
- Production DB only stores votes from 2025-07-01 (Railway free tier); local dev can hold the full legislature from 2024-07-07

## Environment

Copy `.env.example` to `.env` for local development. Key variables:

```ini
DATABASE_URL=postgresql://monelu:monelu@localhost:5432/monelu
AN_API_BASE_URL=https://data.assemblee-nationale.fr
CORS_ORIGINS=*
# Phase 2 — required for POST /search/
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

Production uses Supabase (managed Postgres + pgvector pre-installed). Local uses Docker (`docker-compose.yml` starts Postgres 15 + pgAdmin 8).

## Deployment

Hosted on Railway. On every deploy, `railway.json` runs:
```
python scripts/migrate.py && uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Health check endpoint: `GET /health` (returns DB status + row counts).

## Code Style

Ruff is the single tool for both linting and formatting (see `ruff.toml`):
- Line length: 100
- `print()` is allowed in `scripts/` and `rag/` but blocked elsewhere (T201)
- B008 ignored to allow FastAPI `Depends()` defaults
- Pre-commit hooks run automatically on `git commit`
