# MonÉlu

A civic data platform that ingests, transforms, and serves data about French elected representatives. At its core it is a **data engineering showcase** — a production-grade pipeline demonstrating real-world skills in batch ingestion, API design, and SQL analytics.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [Database Schema](#database-schema)
- [Setup](#setup)
- [Ingestion Scripts](#ingestion-scripts)
- [REST API](#rest-api)
- [Makefile Reference](#makefile-reference)
- [Known Caveats](#known-caveats)

---

## Project Overview

MonÉlu pulls data from the Assemblée Nationale open-data portal, stores it in PostgreSQL, and exposes it through a FastAPI REST API. Phase 1 covers:

- **Deputies** — all 577 current members of the 17th legislature
- **Votes (scrutins)** — all 5,922 public votes since the start of the legislature
- **Vote positions** — 948,217 individual deputy-level positions (pour / contre / abstention / nonVotant)

---

## Architecture

```
data.assemblee-nationale.fr
        │  static ZIP exports
        ▼
scripts/ingest_*.py       ← Python ingestion scripts
        │  psycopg2 upserts
        ▼
PostgreSQL (Docker)
  ├── deputies
  ├── votes
  └── vote_positions
        │
        ▼
api/ (FastAPI + uvicorn)
  ├── GET /deputies/
  ├── GET /deputies/{id}
  ├── GET /deputies/{id}/scorecard
  ├── GET /votes/
  └── GET /votes/{id}          ← includes full deputy positions
```

---

## Data Sources

The Assemblée Nationale does **not** expose a REST API. All data comes from static ZIP exports at `https://data.assemblee-nationale.fr`.

| Dataset | Export file | Portal page |
|---|---|---|
| Deputies (active) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` | `/acteurs/deputes-en-exercice` |
| Votes (scrutins) | `Scrutins.json.zip` | `/travaux-parlementaires/votes` |

Both ZIPs contain one JSON file per record (one file per deputy, one file per scrutin). The ingestion scripts download the ZIP in memory, iterate over each file, parse it, and upsert into Postgres.

Use `scripts/explore_an_exports.py` to list all currently available export URLs from any portal page.

---

## Database Schema

Defined in `data/migrations/001_init.sql` — applied automatically on first Docker container start.

### `deputies`
| Column | Type | Description |
|---|---|---|
| `deputy_id` | TEXT PK | AN uid, e.g. `PA1592` |
| `full_name` | TEXT | Full display name |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `party` | TEXT | Full group name (null for now — requires separate organes lookup) |
| `party_short` | TEXT | AN organeRef, e.g. `PO845401` |
| `circonscription` | TEXT | Circonscription number |
| `department` | TEXT | Department number |
| `mandate_start` | DATE | |
| `mandate_end` | DATE | NULL if currently active |
| `photo_url` | TEXT | `https://www.assemblee-nationale.fr/dyn/static/tribun/photos/{uid}.jpg` |
| `ingested_at` | TIMESTAMPTZ | |

### `votes`
| Column | Type | Description |
|---|---|---|
| `vote_id` | TEXT PK | AN scrutin uid, e.g. `VTANR5L17V1234` |
| `voted_at` | TIMESTAMPTZ | Date of the vote |
| `vote_title` | TEXT | Full legislative title |
| `vote_type` | TEXT | `SPO` (scrutin public ordinaire), etc. |
| `result` | TEXT | `adopté` or `rejeté` |
| `votes_for` | INTEGER | |
| `votes_against` | INTEGER | |
| `abstentions` | INTEGER | |
| `total_voters` | INTEGER | |
| `dossier_id` | TEXT | Linked legislative dossier, if any |
| `ingested_at` | TIMESTAMPTZ | |

### `vote_positions`
| Column | Type | Description |
|---|---|---|
| `position_id` | BIGSERIAL PK | |
| `vote_id` | TEXT FK → votes | |
| `deputy_id` | TEXT FK → deputies | |
| `position` | TEXT | `pour` / `contre` / `abstention` / `nonVotant` |
| `voted_at` | TIMESTAMPTZ | Denormalised from votes for query convenience |
| `ingested_at` | TIMESTAMPTZ | |

UNIQUE constraint on `(vote_id, deputy_id)`.

---

## Setup

### Prerequisites

- Docker + Docker Compose
- Python 3.11+ (tested on 3.14)
- A virtual environment with dependencies installed

### 1. Clone and configure

```bash
git clone <repo>
cd MonElu
cp .env.example .env
# Edit .env if needed (defaults work out of the box with Docker)
```

### 2. Create virtualenv and install dependencies

```bash
python3 -m venv venv
# psycopg2-binary 2.9.9 has no wheel for Python 3.14 — install 2.9.11+ instead
venv/bin/pip install "psycopg2-binary>=2.9.10"
venv/bin/pip install fastapi==0.111.0 "uvicorn[standard]==0.29.0" sqlalchemy==2.0.30 \
    requests==2.32.2 python-dotenv==1.0.1 httpx==0.27.0 pandas==2.2.2
```

### 3. Start Postgres

```bash
make start
# or: docker compose up -d
```

The schema in `data/migrations/001_init.sql` is applied automatically.

### 4. Ingest data

```bash
make ingest
# runs: ingest_deputies → ingest_votes → ingest_positions
# Total: ~577 deputies, ~5922 votes, ~948k positions
# Takes ~2 minutes (positions step dominates)
```

### 5. Start the API

```bash
make api
# or: venv/bin/uvicorn api.main:app --reload
# Swagger UI: http://localhost:8000/docs
```

---

## Ingestion Scripts

All scripts follow the same pattern:
1. Download a ZIP in memory with exponential-backoff retry (5 attempts, base 2s)
2. Iterate over JSON files inside the ZIP
3. Parse and normalise each record
4. Upsert into Postgres (`ON CONFLICT ... DO UPDATE`)

### `scripts/explore_an_exports.py`

Fetches any portal page and prints all ZIP export URLs found.

```bash
venv/bin/python3 scripts/explore_an_exports.py
```

### `scripts/ingest_deputies.py`

Downloads `AMO10_...json.zip`. Each file is `{"acteur": {...}}`. Extracts uid, name, mandate dates, circonscription, department, and a photo URL.

```bash
venv/bin/python3 scripts/ingest_deputies.py
# → 577 deputies upserted
```

### `scripts/ingest_votes.py`

Downloads `Scrutins.json.zip`. Each file is `{"scrutin": {...}}`. Extracts uid, date, title, vote type, result, and aggregate counts from `syntheseVote.decompte`.

```bash
venv/bin/python3 scripts/ingest_votes.py
# → 5922 votes upserted
```

### `scripts/ingest_positions.py`

Reads the same `Scrutins.json.zip`. Walks `ventilationVotes → organe → groupes → groupe[] → vote → decompteNominatif` and extracts `pours`, `contres`, `abstentions`, `nonVotants` blocks — each containing `votant[]` with `acteurRef`. Only writes positions where both `vote_id` and `deputy_id` exist in the DB (skips historical deputies not in the active roster).

```bash
venv/bin/python3 scripts/ingest_positions.py
# → 948,217 positions upserted, ~31,528 skipped (non-active deputies)
```

---

## REST API

Base URL: `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

### Deputies

#### `GET /deputies/`

List all deputies with pagination and optional filters.

| Query param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 50 | Max 200 |
| `offset` | int | 0 | |
| `search` | string | — | Case-insensitive name filter |
| `department` | string | — | Filter by department number |

```json
{
  "total": 577,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "deputy_id": "PA793214",
      "full_name": "Audrey Abadie-Amiel",
      "party": null,
      "party_short": "PO838901",
      "department": "09",
      "circonscription": "2",
      "photo_url": "https://www.assemblee-nationale.fr/dyn/static/tribun/photos/PA793214.jpg"
    }
  ]
}
```

#### `GET /deputies/{deputy_id}`

Full deputy profile including mandate dates.

#### `GET /deputies/{deputy_id}/scorecard`

Computed voting statistics from `vote_positions`.

```json
{
  "deputy_id": "PA793214",
  "full_name": "Audrey Abadie-Amiel",
  "total_votes": 421,
  "present_votes": 421,
  "presence_rate": 1.0,
  "votes_for": 135,
  "votes_against": 269,
  "abstentions": 17,
  "votes_for_pct": 0.3207,
  "abstention_pct": 0.0404
}
```

- `presence_rate` = present_votes / total_votes (nonVotant excluded from present)
- `votes_for_pct` = pour / present_votes
- `abstention_pct` = abstention / present_votes

### Votes

#### `GET /votes/`

List all votes, newest first.

| Query param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 50 | Max 200 |
| `offset` | int | 0 | |
| `result` | string | — | `adopté` or `rejeté` |

#### `GET /votes/{vote_id}`

Full vote detail including every deputy's position, joined with names and party.

```json
{
  "vote_id": "VTANR5L17V2657",
  "voted_at": "2025-06-24T00:00:00Z",
  "vote_title": "l'article 22 du projet de loi...",
  "result": "adopté",
  "votes_for": 121,
  "votes_against": 23,
  "abstentions": 0,
  "total_voters": 144,
  "vote_type": "SPO",
  "positions": [
    {
      "position_id": 71,
      "deputy_id": "PA793262",
      "full_name": "Laurent Alexandre",
      "party_short": "PO845401",
      "position": "contre"
    }
  ]
}
```

### Health

#### `GET /health`

```json
{"status": "ok"}
```

---

## Makefile Reference

```bash
make start    # docker compose up -d
make stop     # docker compose down
make ingest   # run all 3 ingestion scripts in order
make api      # uvicorn api.main:app --reload
make psql     # docker exec into Postgres container
```

---

## Known Caveats

- **`party` is null** for all deputies. The AN data does not include party names inline — `party_short` contains an organe reference ID (e.g. `PO845401`). Resolving to human-readable names requires a separate organes lookup, which is planned for Phase 2.
- **`psycopg2-binary==2.9.9`** in `requirements.txt` has no pre-built wheel for Python 3.14. Install `>=2.9.10` manually or update the pinned version.
- **Historical deputies** (those who sat in previous legislatures but are not in the current active roster) appear in scrutin files but are skipped during position ingestion since they have no corresponding row in `deputies`.
- **`nonVotant`** positions are stored but excluded from `presence_rate` calculations in the scorecard. Deputies who are `nonVotant` did not cast a vote but were present (e.g. abstained by delegation rules).
