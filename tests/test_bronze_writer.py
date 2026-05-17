"""Unit tests for BronzeWriter and the DAG task functions."""

import hashlib
import json
from unittest.mock import MagicMock, patch

import pytest

from ingestion.utils.bronze_writer import BronzeWriter

# ---------------------------------------------------------------------------
# BronzeWriter.read_by_key
# ---------------------------------------------------------------------------


def _make_writer(s3_mock):
    writer = BronzeWriter.__new__(BronzeWriter)
    writer.s3 = s3_mock
    writer.bucket = "monelu-bronze"
    return writer


def test_read_by_key_strips_prefix_and_returns_data():
    payload = [{"uid": "PA1", "name": "Test"}]
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": MagicMock(read=lambda: json.dumps(payload).encode())}

    writer = _make_writer(s3)
    result = writer.read_by_key(
        "s3://monelu-bronze/votes/year=2026/month=05/day=17/votes_120000.json"
    )

    s3.get_object.assert_called_once_with(
        Bucket="monelu-bronze",
        Key="votes/year=2026/month=05/day=17/votes_120000.json",
    )
    assert result == payload


def test_read_by_key_without_prefix_passes_key_as_is():
    """Path without s3://bucket/ prefix should be used verbatim."""
    payload = [{"uid": "PA2"}]
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": MagicMock(read=lambda: json.dumps(payload).encode())}

    writer = _make_writer(s3)
    # removeprefix leaves the string unchanged when prefix doesn't match
    result = writer.read_by_key("votes/year=2026/month=05/day=17/votes_120000.json")

    s3.get_object.assert_called_once_with(
        Bucket="monelu-bronze",
        Key="votes/year=2026/month=05/day=17/votes_120000.json",
    )
    assert result == payload


# ---------------------------------------------------------------------------
# DAG task: fetch_votes — no-change path (hash match → bronze_path=None)
# ---------------------------------------------------------------------------


def _make_ti(**xcom_values):
    ti = MagicMock()
    pushed = {}

    def push(key, value):
        pushed[key] = value

    def pull(key, task_ids=None):
        return xcom_values.get(key)

    ti.xcom_push = MagicMock(side_effect=lambda key, value: pushed.__setitem__(key, value))
    ti.xcom_pull = MagicMock(side_effect=lambda key, task_ids=None: xcom_values.get(key))
    ti._pushed = pushed
    return ti


def test_fetch_votes_skips_bronze_when_hash_unchanged():
    votes = [{"uid": "V1", "dateScrutin": "2026-05-01"}]
    stable = sorted(votes, key=lambda v: v.get("uid", ""))
    expected_hash = hashlib.md5(json.dumps(stable, sort_keys=True).encode()).hexdigest()

    ti = _make_ti()
    context = {"ti": ti, "ds": "2026-05-17"}

    with (
        patch("scripts.ingest_votes.fetch_all_scrutins", return_value=votes),
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.get_last_hash", return_value=expected_hash
        ),
        patch("ingestion.utils.bronze_writer.BronzeWriter.write") as mock_write,
        patch("ingestion.utils.bronze_writer.BronzeWriter.save_hash") as mock_save,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_votes_batch import fetch_votes

        fetch_votes(**context)

    mock_write.assert_not_called()
    mock_save.assert_not_called()
    assert ti._pushed["bronze_path"] is None
    assert ti._pushed["count"] == 1


def test_fetch_votes_writes_bronze_when_hash_changed():
    votes = [{"uid": "V1", "dateScrutin": "2026-05-01"}]
    ti = _make_ti()
    context = {"ti": ti, "ds": "2026-05-17"}

    with (
        patch("scripts.ingest_votes.fetch_all_scrutins", return_value=votes),
        patch("ingestion.utils.bronze_writer.BronzeWriter.get_last_hash", return_value="old_hash"),
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.write",
            return_value="s3://monelu-bronze/votes/x.json",
        ) as mock_write,
        patch("ingestion.utils.bronze_writer.BronzeWriter.save_hash") as mock_save,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_votes_batch import fetch_votes

        fetch_votes(**context)

    mock_write.assert_called_once()
    mock_save.assert_called_once()
    assert ti._pushed["bronze_path"] == "s3://monelu-bronze/votes/x.json"


# ---------------------------------------------------------------------------
# DAG task: validate_votes — skips when bronze_path is None
# ---------------------------------------------------------------------------


def test_validate_votes_skips_when_no_new_bronze():
    ti = _make_ti(bronze_path=None)
    context = {"ti": ti}

    with patch("ingestion.utils.bronze_writer.boto3"):
        from ingestion.dags.dag_votes_batch import validate_votes

        # Should return without raising
        validate_votes(**context)


def test_validate_votes_raises_on_ge_failure():
    ti = _make_ti(bronze_path="s3://monelu-bronze/votes/x.json")
    context = {"ti": ti}

    bad_result = {
        "success": False,
        "evaluated": 3,
        "failed": 1,
        "results": [{"expectation": "expect_column_to_exist", "success": False}],
    }

    with (
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.read_by_key", return_value=[{"uid": "V1"}]
        ),
        patch("quality.expectations.votes_suite.validate_votes", return_value=bad_result),
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_votes_batch import validate_votes

        with pytest.raises(ValueError, match="GE validation failed"):
            validate_votes(**context)


# ---------------------------------------------------------------------------
# DAG task: upsert_postgres — skips when bronze_path is None
# ---------------------------------------------------------------------------


def test_upsert_postgres_skips_when_no_new_bronze():
    ti = _make_ti(bronze_path=None)
    context = {"ti": ti}

    with (
        patch("scripts.ingest_votes.upsert_votes") as mock_upsert,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_votes_batch import upsert_postgres

        upsert_postgres(**context)

    mock_upsert.assert_not_called()


def test_upsert_postgres_reads_by_key_not_latest():
    votes = [{"uid": "V1"}]
    ti = _make_ti(bronze_path="s3://monelu-bronze/votes/x.json")
    context = {"ti": ti}

    with (
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.read_by_key", return_value=votes
        ) as mock_rbk,
        patch("ingestion.utils.bronze_writer.BronzeWriter.read_latest") as mock_rl,
        patch("scripts.ingest_votes.upsert_votes") as mock_upsert,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_votes_batch import upsert_postgres

        upsert_postgres(**context)

    mock_rbk.assert_called_once_with("s3://monelu-bronze/votes/x.json")
    mock_rl.assert_not_called()
    mock_upsert.assert_called_once_with(votes)


# ---------------------------------------------------------------------------
# Deputies DAG — same skip logic
# ---------------------------------------------------------------------------


def test_fetch_deputies_skips_bronze_when_hash_unchanged():
    deputies = [{"uid": "PA1", "nom": "Martin"}]
    stable = sorted(deputies, key=lambda d: d.get("uid", ""))
    expected_hash = hashlib.md5(json.dumps(stable, sort_keys=True).encode()).hexdigest()

    ti = _make_ti()
    context = {"ti": ti, "ds": "2026-05-17"}

    with (
        patch("scripts.ingest_deputies.fetch_all_deputies", return_value=deputies),
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.get_last_hash", return_value=expected_hash
        ),
        patch("ingestion.utils.bronze_writer.BronzeWriter.write") as mock_write,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_deputies_incremental import fetch_deputies

        fetch_deputies(**context)

    mock_write.assert_not_called()
    assert ti._pushed["bronze_path"] is None


def test_upsert_postgres_deputies_reads_by_key_not_latest():
    deputies = [{"uid": "PA1"}]
    ti = _make_ti(bronze_path="s3://monelu-bronze/deputies/x.json")
    context = {"ti": ti}

    with (
        patch(
            "ingestion.utils.bronze_writer.BronzeWriter.read_by_key", return_value=deputies
        ) as mock_rbk,
        patch("ingestion.utils.bronze_writer.BronzeWriter.read_latest") as mock_rl,
        patch("scripts.ingest_deputies.upsert_deputies") as mock_upsert,
        patch("ingestion.utils.bronze_writer.boto3"),
    ):
        from ingestion.dags.dag_deputies_incremental import upsert_postgres

        upsert_postgres(**context)

    mock_rbk.assert_called_once_with("s3://monelu-bronze/deputies/x.json")
    mock_rl.assert_not_called()
    mock_upsert.assert_called_once_with(deputies)
