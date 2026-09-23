"""
Tests for run_step's critical/non-critical failure handling in
scripts/run_ingestion_prod.py (2026-07 incident: a non-critical step's crash
was aborting the whole pipeline, which silently skipped the downstream RAG
rebuild and dbt run/test workflow steps even though core data had ingested).
"""

import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from scripts.run_ingestion_prod import main, run_step


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


class TestDossiersStepIsNonCritical:
    """MON-243 / ADR-035: the dossiers export is a third, independent feed, so a
    failure there must leave deputies/votes/positions - and everything the
    workflow runs after this script - untouched, exactly as the agenda step does.
    """

    def _run_main(self, tmp_path, failing_script: str | None):
        """Drive main() end to end with the DB and the subprocesses stubbed out."""
        github_output = tmp_path / "github_output"
        github_output.write_text("")

        def fake_run(cmd, **kwargs):
            script = os.path.basename(cmd[1])
            return _fake_result(1 if script == failing_script else 0)

        with (
            patch("scripts.run_ingestion_prod.subprocess.run", side_effect=fake_run),
            patch("scripts.run_ingestion_prod.psycopg2.connect", return_value=MagicMock()),
            patch("scripts.run_ingestion_prod._try_acquire_lock", return_value=True),
            patch("scripts.run_ingestion_prod._now", return_value=datetime.now(timezone.utc)),
            patch("scripts.run_ingestion_prod.row_count", return_value=0),
            patch("scripts.run_ingestion_prod.visible_agenda_count", return_value=0),
            patch("scripts.run_ingestion_prod.changed_ids", return_value=[]),
            patch("scripts.run_ingestion_prod._download_zips", return_value=("a.zip", "b.zip")),
            patch("scripts.run_ingestion_prod.publish_scope"),
            patch.dict(
                os.environ,
                {"DATABASE_URL": "postgresql://x/y", "GITHUB_OUTPUT": str(github_output)},
            ),
            patch("sys.argv", ["run_ingestion_prod.py", "--since", "2026-01-01"]),
        ):
            main()
        return github_output.read_text()

    def test_a_failing_dossiers_step_does_not_abort_the_pipeline(self, tmp_path):
        output = self._run_main(tmp_path, failing_script="ingest_dossiers.py")
        assert "soft_failures=Dossiers" in output

    def test_a_failing_votes_step_still_aborts(self, tmp_path):
        """The contrast that makes the assertion above mean something."""
        with pytest.raises(RuntimeError, match="Votes failed"):
            self._run_main(tmp_path, failing_script="ingest_votes.py")

    def test_a_clean_run_reports_no_soft_failures(self, tmp_path):
        output = self._run_main(tmp_path, failing_script=None)
        assert "soft_failures=\n" in output
