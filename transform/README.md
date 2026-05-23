# MonÉlu — dbt transformation layer

Silver + Gold medallion transforms sitting between raw ingestion and the FastAPI serving tier.

## Layer overview

| Layer | Schema | Materialisation | Purpose |
|-------|--------|-----------------|---------|
| Silver | `analytics_staging` | view | Clean, type-cast, rename raw tables |
| Gold | `analytics_marts` | table | Pre-aggregated, API-ready |

## Models

**Staging (Silver)**
- `stg_deputies` — renamed columns, `is_active` flag, timestamp casts
- `stg_votes` — lowercased result/vote_type, `is_adopted`, month/year partitions
- `stg_vote_positions` — normalised position to lowercase, `position_code`

**Marts (Gold)**
- `mart_deputy_scorecard` — one row per deputy: presence rate, vote breakdown
- `mart_vote_summary` — one row per vote: result, pct_pour/contre, participation
- `mart_party_alignment` — one row per deputy: alignment rate vs party majority

## Local development

```bash
# from repo root
make dbt-run      # run all models
make dbt-test     # run all tests
make dbt-docs     # generate + serve docs at http://localhost:8082
make dbt-clean    # wipe target/ and dbt_packages/
```

Requires `transform/profiles.yml` (gitignored). Create it from the template in `.github/workflows/ingest_prod.yml`, pointing at your local Postgres instance (`host: localhost`, `user: monelu`, `password: monelu`, `dbname: monelu`).

## Tests

57 tests across source, staging, and mart layers — including `dbt_utils.accepted_range` (0–1) on all rate columns and `dbt_utils.recency` on `updated_at`.
