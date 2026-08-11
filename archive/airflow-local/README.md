# Archived — local Airflow/MinIO stack

This is the local Docker Airflow + MinIO sandbox from the pre-ADR-001
Airflow+Spark architecture — the other half of the design [`archive/infra-aws/`](../infra-aws/)
archives (see [`docs/decisions.md`](../../docs/decisions.md), ADR-021 for the AWS half,
ADR-032 for this one).

It ran, unlike the AWS half, but nothing in production ever called it: the DAGs
here are thin wrappers around the exact same `scripts/ingest_deputies.py` /
`scripts/ingest_votes.py` / `scripts/ingest_positions.py` functions the
GitHub Actions cron (`ingest_prod.yml`) already calls directly. Archived
rather than fixed, same as the Terraform — kept as reference, not as a live
deployment target.

## What's here

- `ingestion_dags/` — the two DAGs (`dag_deputies_incremental.py`,
  `dag_votes_batch.py`), moved as-is from `ingestion/dags/`
- `ingestion_utils/bronze_writer.py` — the MinIO/S3 Bronze-layer writer the
  DAGs used for hash-based change detection, moved as-is from
  `ingestion/utils/`
- `quality/expectations/` — the Great Expectations validation suites the DAGs
  ran before upserting, moved as-is from the repo-root `quality/`
- `Dockerfile.airflow`, `docker-compose.airflow.yml`, `requirements-airflow.txt` —
  the container/orchestration definitions
- `setup_minio.py` — one-time MinIO bucket bootstrap, moved from `scripts/`
- `test_bronze_writer.py` — unit tests for `BronzeWriter` and the DAG task
  functions, moved from `tests/`

None of these files have been edited beyond the move (import paths are not
rewritten, so nothing here runs without restoring it to its original
location first).

## What's salvageable

All of it, if Airflow is ever actually promoted to production per ADR-006's
migration path (Local Docker → Astronomer free tier → AWS EC2). The
hash-based change-detection pattern in `bronze_writer.py` is exactly what
ADR-011 describes as "planned, not yet implemented" for that scenario.

## Trigger to restore

GitHub Actions cron scheduling becomes a real bottleneck — finer-than-cron
scheduling, DAG-level retries/backfill, or dependency graphs GitHub Actions
can't express. At that point, restore from here rather than rebuilding from
scratch, and follow ADR-006's migration path.
