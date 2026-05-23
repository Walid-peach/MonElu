import hashlib
import json
import sys
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

sys.path.insert(0, "/opt/airflow")

default_args = {
    "owner": "monelu",
    "retries": 1,
    "retry_delay": timedelta(seconds=30),
}


def fetch_deputies(**context):
    """
    Download deputies ZIP, write raw data to Bronze, and push only the S3 path
    via XCom. Avoids the Airflow metadata-DB XCom size limit (~48 KB) that
    would be hit by the full 577-deputy JSON payload (~150–300 KB).
    """
    from ingestion.utils.bronze_writer import BronzeWriter
    from scripts.ingest_deputies import fetch_all_deputies

    deputies = fetch_all_deputies()

    writer = BronzeWriter()

    def _uid_key(d):
        uid = d.get("uid", "")
        if isinstance(uid, dict):
            return uid.get("#text", "")
        return str(uid) if uid else ""

    stable = sorted(deputies, key=_uid_key)
    current_hash = hashlib.md5(json.dumps(stable, sort_keys=True).encode()).hexdigest()
    last_hash = writer.get_last_hash("deputies")

    if current_hash == last_hash:
        print("No changes detected — skipping Bronze write")
        context["ti"].xcom_push(key="bronze_path", value=None)
    else:
        path = writer.write("deputies", deputies, context["ds"])
        writer.save_hash("deputies", current_hash)
        context["ti"].xcom_push(key="bronze_path", value=path)
        print(f"Bronze written: {path}")

    context["ti"].xcom_push(key="count", value=len(deputies))
    print(f"Fetched {len(deputies)} deputies")
    return len(deputies)


def validate_deputies(**context):
    """Run Great Expectations suite — fail DAG if validation fails."""
    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_deputies")
    if bronze_path is None:
        print("No new Bronze data — skipping validation")
        return

    from ingestion.utils.bronze_writer import BronzeWriter
    from quality.expectations.deputies_suite import validate_deputies as gx_validate

    writer = BronzeWriter()
    deputies = writer.read_by_key(bronze_path)
    result = gx_validate(deputies)
    if not result["success"]:
        raise ValueError(
            f"GE validation failed: {result['failed']}/{result['evaluated']} checks failed. "
            f"Details: {result['results']}"
        )
    print(f"GE validation passed: {result['evaluated']} checks")


def confirm_bronze(**context):
    """Log the Bronze path written by fetch_deputies — the actual write happened there."""
    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_deputies")
    if bronze_path is None:
        print("No changes detected — Bronze write was skipped")
        return "skipped"
    print(f"Bronze path confirmed: {bronze_path}")
    return bronze_path


def upsert_postgres(**context):
    """Upsert deputies into PostgreSQL, reading from Bronze S3 instead of XCom."""
    from ingestion.utils.bronze_writer import BronzeWriter
    from scripts.ingest_deputies import upsert_deputies

    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_deputies")
    if bronze_path is None:
        print("No new Bronze data — skipping Postgres upsert")
        return

    writer = BronzeWriter()
    deputies = writer.read_by_key(bronze_path)
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
        task_id="confirm_bronze",
        python_callable=confirm_bronze,
    )

    t4 = PythonOperator(
        task_id="upsert_postgres",
        python_callable=upsert_postgres,
    )

    t1 >> t2 >> t3 >> t4
