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
| GET | `/deputies` | List all deputies (filter: `search`, `department`) |
| GET | `/deputies/{id}` | Deputy profile |
| GET | `/deputies/{id}/scorecard` | Presence rate, vote breakdown |
| GET | `/votes` | List votes (filter: `result`) |
| GET | `/votes/latest` | Last 10 votes |
| GET | `/votes/{id}` | Vote detail + all individual positions |
| GET | `/health` | API status + record counts |

Interactive docs: `/docs`

---

## Stack

FastAPI (Railway) · PostgreSQL + pgvector (Supabase) · Python 3.11

---

## Data Sources

Assemblée Nationale Open Data — `data.assemblee-nationale.fr`
Static ZIP exports only — no REST API is available.

| Dataset | File |
|---|---|
| Deputies (active, 17th legislature) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` |
| Votes (scrutins, since 2025-07-01) | `Scrutins.json.zip` |

---

## Local Setup

### Prerequisites

- Docker + Docker Compose (for local Postgres)
- Python 3.11+ (tested on 3.14)

### Steps

```bash
git clone <repo> && cd MonElu
cp .env.example .env        # set DATABASE_URL to local or Supabase

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

# start API
make api
# → http://localhost:8000/docs
```

### Makefile targets

```
make start       docker compose up -d
make stop        docker compose down
make migrate     apply 001_init.sql to DATABASE_URL
make ingest      deputies → votes → positions (local, full)
make ingest-prod run_ingestion_prod.py --since 2025-01-01
make api         uvicorn api.main:app --reload
make psql        psql into the running Postgres container
make check-db    print table sizes, row counts, pgvector status
```

---

## Database Schema

### `deputies`
| Column | Type | Notes |
|---|---|---|
| `deputy_id` | TEXT PK | AN uid e.g. `PA1592` |
| `full_name` | TEXT | |
| `first_name` / `last_name` | TEXT | |
| `party` | TEXT | null — requires organes lookup (Phase 2) |
| `party_short` | TEXT | organeRef e.g. `PO845401` |
| `circonscription` / `department` | TEXT | |
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
| `content` | TEXT | Raw chunk text |
| `metadata` | JSONB | Source doc, page, etc. |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |

---

## Ingestion Scripts

| Script | What it does |
|---|---|
| `scripts/explore_an_exports.py` | Lists all ZIP export URLs from any portal page |
| `scripts/ingest_deputies.py` | Downloads AMO10 ZIP, upserts deputies |
| `scripts/ingest_votes.py` | Downloads Scrutins ZIP, upserts votes (`--since` flag) |
| `scripts/ingest_positions.py` | Same ZIP, extracts individual deputy positions |
| `scripts/run_ingestion_prod.py` | Runs all three in order with timing summary |
| `scripts/migrate.py` | Applies 001_init.sql, checks pgvector |
| `scripts/check_db_size.py` | Prints table sizes and DB storage usage |

All scripts use exponential-backoff retry (5 attempts, base 2s) and upsert with `ON CONFLICT ... DO UPDATE`.

---

## Known Data Notes

- **`party` is null** for all deputies — the export only contains `organeRef` IDs. Human-readable group names require a separate organes lookup (Phase 2).
- **`nonVotant` ≠ `abstention`** — a `nonVotant` deputy was present but did not cast a vote. Excluded from `presence_rate` in the scorecard.
- **Yaël Braun-Pivet at 100% presence** — Présidente de l'AN, recorded on every scrutin by the AN data system.
- **`rejeté` outnumbers `adopté`** — the 17th legislature has no stable majority; most amendments are rejected.
- **Ingestion window** — production DB uses `--since 2025-07-01` (Supabase free tier). Run `--since 2024-07-07` for the full legislature.
