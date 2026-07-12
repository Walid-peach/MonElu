"""
Tests for run_step's critical/non-critical failure handling in
scripts/run_ingestion_prod.py (2026-07 incident: a non-critical step's crash
was aborting the whole pipeline, which silently skipped the downstream RAG
rebuild and dbt run/test workflow steps even though core data had ingested).
"""

from unittest.mock import patch

import pytest

from scripts.run_ingestion_prod import run_step


def _fake_result(returncode: int):
    class _Result:
        pass

    r = _Result()
    r.returncode = returncode
    return r


def test_critical_success_returns_elapsed():
    with patch("scripts.run_ingestion_prod.subprocess.run", return_value=_fake_result(0)):
        elapsed = run_step("Votes", "ingest_votes.py")
    assert isinstance(elapsed, float)


def test_critical_failure_raises():
    with patch("scripts.run_ingestion_prod.subprocess.run", return_value=_fake_result(1)):
        with pytest.raises(RuntimeError, match="Votes failed with exit code 1"):
            run_step("Votes", "ingest_votes.py")


def test_non_critical_failure_does_not_raise():
    with patch("scripts.run_ingestion_prod.subprocess.run", return_value=_fake_result(1)):
        result = run_step("Fix party + department names", "update_party.py", critical=False)
    assert result is None


def test_non_critical_success_returns_elapsed():
    with patch("scripts.run_ingestion_prod.subprocess.run", return_value=_fake_result(0)):
        elapsed = run_step("Fix party + department names", "update_party.py", critical=False)
    assert isinstance(elapsed, float)
