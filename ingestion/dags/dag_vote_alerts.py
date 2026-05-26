from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator

default_args = {
    "owner": "monelu",
    "retries": 2,
    "retry_delay": timedelta(minutes=2),
}


def is_session_day(**context) -> bool:
    """Skip weekends — AN doesn't vote on weekends."""
    return datetime.utcnow().weekday() < 5


def check_new_votes(**context) -> bool:
    """Check if any votes were ingested in the last 10 minutes."""
    import sys

    sys.path.insert(0, "/opt/airflow")
    from ingestion.utils.alert_engine import get_new_votes

    votes = get_new_votes()
    count = len(votes)
    print(f"New votes found: {count}")
    context["ti"].xcom_push(key="new_vote_count", value=count)
    return count > 0


def dispatch_alerts(**context):
    import sys

    sys.path.insert(0, "/opt/airflow")
    from scripts.run_alerts import run_alerts

    stats = run_alerts(since_minutes=10)
    print(f"Alert dispatch complete: {stats}")


with DAG(
    dag_id="vote_alerts",
    default_args=default_args,
    description="Detect new votes and send email alerts to subscribers",
    schedule="*/5 * * * 1-5",
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=["monelu", "alerts"],
) as dag:
    t1 = ShortCircuitOperator(
        task_id="check_session_day",
        python_callable=is_session_day,
    )

    t2 = ShortCircuitOperator(
        task_id="check_new_votes",
        python_callable=check_new_votes,
    )

    t3 = PythonOperator(
        task_id="dispatch_alerts",
        python_callable=dispatch_alerts,
    )

    t1 >> t2 >> t3
