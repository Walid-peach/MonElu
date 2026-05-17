import hashlib
import json
import sys
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

sys.path.insert(0, "/opt/airflow")

default_args = {
    "owner": "monelu",
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
}


def fetch_deputies(**context):
    """Download deputies ZIP and parse JSON files."""
    from scripts.ingest_deputies import fetch_all_deputies

    deputies = fetch_all_deputies()
    context["ti"].xcom_push(key="deputies", value=deputies)
    context["ti"].xcom_push(key="count", value=len(deputies))
    print(f"Fetched {len(deputies)} deputies")
    return len(deputies)


def validate_deputies(**context):
    """Run Great Expectations suite — fail DAG if validation fails."""
    from quality.expectations.deputies_suite import validate_deputies as gx_validate

    deputies = context["ti"].xcom_pull(key="deputies", task_ids="fetch_deputies")
    result = gx_validate(deputies)
    if not result["success"]:
        raise ValueError(
            f"GE validation failed: {result['failed']}/{result['evaluated']} checks failed. "
            f"Details: {result['results']}"
        )
    print(f"GE validation passed: {result['evaluated']} checks")


def check_and_write_bronze(**context):
    """
    Hash-based change detection.
    Only write to Bronze if data has changed since last run.
    """
    from ingestion.utils.bronze_writer import BronzeWriter

    deputies = context["ti"].xcom_pull(key="deputies", task_ids="fetch_deputies")
    writer = BronzeWriter()
    current_hash = hashlib.md5(json.dumps(deputies, sort_keys=True).encode()).hexdigest()
    last_hash = writer.get_last_hash("deputies")
    if current_hash == last_hash:
        print("No changes detected — skipping Bronze write")
        return "skipped"
    path = writer.write("deputies", deputies, context["ds"])
    writer.save_hash("deputies", current_hash)
    print(f"Bronze written: {path}")
    return path


def upsert_postgres(**context):
    """Upsert deputies into PostgreSQL from XCom."""
    from scripts.ingest_deputies import upsert_deputies

    deputies = context["ti"].xcom_pull(key="deputies", task_ids="fetch_deputies")
    upsert_deputies(deputies)
    print(f"Upserted {len(deputies)} deputies to Postgres")


with DAG(
    dag_id="deputies_incremental",
    default_args=default_args,
    description="Weekly deputies ingestion: AN ZIP → GE validation → Bronze → Postgres",
    schedule="0 6 * * 1",  # Every Monday at 6am
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=["monelu", "ingestion", "deputies"],
) as dag:
    t1 = PythonOperator(
        task_id="fetch_deputies",
        python_callable=fetch_deputies,
    )

    t2 = PythonOperator(
        task_id="validate_deputies",
        python_callable=validate_deputies,
    )

    t3 = PythonOperator(
        task_id="write_bronze",
        python_callable=check_and_write_bronze,
    )

    t4 = PythonOperator(
        task_id="upsert_postgres",
        python_callable=upsert_postgres,
    )

    t1 >> t2 >> t3 >> t4
