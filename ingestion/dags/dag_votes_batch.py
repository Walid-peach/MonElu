import hashlib
import json
import sys
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator

sys.path.insert(0, "/opt/airflow")

default_args = {
    "owner": "monelu",
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
}


def check_session_active(**context):
    """
    Check if AN is likely in session.
    Skip if weekend — saves unnecessary API calls.
    Simple heuristic: skip Saturday and Sunday.
    """
    today = datetime.utcnow()
    if today.weekday() >= 5:  # Saturday=5, Sunday=6
        print("Weekend — skipping votes ingestion")
        return False
    print("Weekday — proceeding with votes ingestion")
    return True


def fetch_votes(**context):
    """
    Download votes ZIP for the last 7 days, write raw data to Bronze, and push
    only the S3 path via XCom. Avoids the 48 KB Airflow metadata-DB XCom limit
    that would be hit if the full dataset were serialised directly.
    """
    from ingestion.utils.bronze_writer import BronzeWriter
    from scripts.ingest_votes import fetch_all_scrutins

    since = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    votes = fetch_all_scrutins(since=since)

    writer = BronzeWriter()
    stable = sorted(votes, key=lambda v: v.get("uid", ""))
    current_hash = hashlib.md5(json.dumps(stable, sort_keys=True).encode()).hexdigest()
    last_hash = writer.get_last_hash("votes")

    if current_hash == last_hash:
        print("No changes detected — skipping Bronze write")
        context["ti"].xcom_push(key="bronze_path", value=None)
    else:
        path = writer.write("votes", votes, context["ds"])
        writer.save_hash("votes", current_hash)
        context["ti"].xcom_push(key="bronze_path", value=path)
        print(f"Bronze written: {path}")

    context["ti"].xcom_push(key="count", value=len(votes))
    print(f"Fetched {len(votes)} votes since {since}")
    return len(votes)


def validate_votes(**context):
    """Run Great Expectations suite — fail DAG if validation fails."""
    from ingestion.utils.bronze_writer import BronzeWriter
    from quality.expectations.votes_suite import validate_votes as gx_validate

    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_votes")
    if bronze_path is None:
        print("No new Bronze data — skipping validation")
        return

    writer = BronzeWriter()
    votes = writer.read_latest("votes")
    result = gx_validate(votes)
    if not result["success"]:
        raise ValueError(
            f"GE validation failed: {result['failed']}/{result['evaluated']} checks failed. "
            f"Details: {result['results']}"
        )
    print(f"GE validation passed: {result['evaluated']} checks")


def write_bronze(**context):
    """Bronze write already happened in fetch_votes — just log the path."""
    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_votes")
    if bronze_path is None:
        print("No changes detected — Bronze write was skipped")
        return "skipped"
    print(f"Bronze path confirmed: {bronze_path}")
    return bronze_path


def upsert_postgres(**context):
    """Upsert votes into PostgreSQL, reading from Bronze S3 instead of XCom."""
    from ingestion.utils.bronze_writer import BronzeWriter
    from scripts.ingest_votes import upsert_votes

    bronze_path = context["ti"].xcom_pull(key="bronze_path", task_ids="fetch_votes")
    if bronze_path is None:
        print("No new Bronze data — skipping Postgres upsert")
        return

    writer = BronzeWriter()
    votes = writer.read_latest("votes")
    upsert_votes(votes)
    print(f"Upserted {len(votes)} votes to Postgres")


def trigger_positions(**context):
    """Run full positions ingestion after votes are upserted."""
    from scripts.ingest_positions import main as ingest_positions_main

    ingest_positions_main()
    print("Positions ingestion complete")


with DAG(
    dag_id="votes_batch",
    default_args=default_args,
    description="Bi-hourly votes ingestion: AN ZIP → GE validation → Bronze → Postgres → positions",
    schedule="0 */2 * * *",  # Every 2 hours
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=["monelu", "ingestion", "votes"],
) as dag:
    t0 = ShortCircuitOperator(
        task_id="check_session_active",
        python_callable=check_session_active,
    )

    t1 = PythonOperator(
        task_id="fetch_votes",
        python_callable=fetch_votes,
    )

    t2 = PythonOperator(
        task_id="validate_votes",
        python_callable=validate_votes,
    )

    t3 = PythonOperator(
        task_id="write_bronze",
        python_callable=write_bronze,
    )

    t4 = PythonOperator(
        task_id="upsert_postgres",
        python_callable=upsert_postgres,
    )

    t5 = PythonOperator(
        task_id="trigger_positions",
        python_callable=trigger_positions,
    )

    t0 >> t1 >> t2 >> t3 >> t4 >> t5
