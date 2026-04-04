# MonÉlu
> Every vote. Every deputy. In plain French.

Live API: https://monelu.up.railway.app

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

FastAPI · PostgreSQL · Python 3.11 · Railway

---

## Data Sources

Assemblée Nationale Open Data — `data.assemblee-nationale.fr`
Static ZIP exports only — no REST API is available.

| Dataset | File |
|---|---|
| Deputies (active, 17th legislature) | `AMO10_deputes_actifs_mandats_actifs_organes.json.zip` |
| Votes (scrutins, all of legislature 17) | `Scrutins.json.zip` |

---

## Local Setup

### Prerequisites

- Docker + Docker Compose
- Python 3.11+ (tested on 3.14)

### Steps

```bash
git clone <repo> && cd MonElu
cp .env.example .env

# create virtualenv
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# start Postgres (schema applied automatically)
make start

# ingest all data (~2 min)
make ingest

# start API
make api
# → http://localhost:8000/docs
```

### Makefile targets

```
make start    docker compose up -d
make stop     docker compose down
make ingest   deputies → votes → positions
make api      uvicorn api.main:app --reload
make psql     psql into the running Postgres container
```

---

## Database Schema

### `deputies` (577 rows)
| Column | Type | Notes |
|---|---|---|
| `deputy_id` | TEXT PK | AN uid e.g. `PA1592` |
| `full_name` | TEXT | |
| `first_name` / `last_name` | TEXT | |
| `party` | TEXT | null — requires organes lookup (Phase 2) |
| `party_short` | TEXT | organeRef e.g. `PO845401` |
| `circonscription` | TEXT | |
| `department` | TEXT | |
| `mandate_start` / `mandate_end` | DATE | end is null if active |
| `photo_url` | TEXT | `assemblee-nationale.fr/dyn/static/tribun/photos/{uid}.jpg` |

### `votes` (5,922 rows)
| Column | Type | Notes |
|---|---|---|
| `vote_id` | TEXT PK | e.g. `VTANR5L17V1234` |
| `voted_at` | TIMESTAMPTZ | |
| `vote_title` | TEXT | Full legislative title |
| `vote_type` | TEXT | e.g. `SPO` (scrutin public ordinaire) |
| `result` | TEXT | `adopté` or `rejeté` |
| `votes_for` / `votes_against` / `abstentions` / `total_voters` | INTEGER | |
| `dossier_id` | TEXT | Linked dossier, if any |

### `vote_positions` (948,217 rows)
| Column | Type | Notes |
|---|---|---|
| `position_id` | BIGSERIAL PK | |
| `vote_id` | TEXT FK | |
| `deputy_id` | TEXT FK | |
| `position` | TEXT | `pour` / `contre` / `abstention` / `nonVotant` |
| `voted_at` | TIMESTAMPTZ | Denormalised from votes |

---

## Ingestion Scripts

| Script | What it does |
|---|---|
| `scripts/explore_an_exports.py` | Lists all ZIP export URLs from any portal page |
| `scripts/ingest_deputies.py` | Downloads AMO10 ZIP, upserts 577 deputies |
| `scripts/ingest_votes.py` | Downloads Scrutins ZIP, upserts 5,922 votes |
| `scripts/ingest_positions.py` | Same ZIP, extracts 948,217 individual positions |
| `scripts/run_ingestion_prod.py` | Runs all three in order, prints timing summary |

All scripts use exponential-backoff retry (5 attempts, base 2s) and upsert with `ON CONFLICT ... DO UPDATE`.

---

## Known Data Notes

- **`party` is null** for all deputies — the active deputies export only contains `organeRef` IDs. Human-readable group names require a separate organes lookup (planned Phase 2).
- **31,528 positions skipped** — deputies from legislatures prior to the 17th appear in some scrutin files but are not in our active deputies table.
- **`nonVotant` (9,611) ≠ `abstention`** — a `nonVotant` deputy was present but did not cast a vote (e.g. under group delegation rules). They are excluded from `presence_rate` calculations in the scorecard.
- **Yaël Braun-Pivet at 100% presence** — she is the Présidente de l'Assemblée nationale and is recorded on every single scrutin by the AN data system.
- **`rejeté` outnumbers `adopté`** (3,805 vs 2,117) — the 17th legislature has no stable majority; most amendments are rejected.
