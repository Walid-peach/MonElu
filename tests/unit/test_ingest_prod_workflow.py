"""
Guards the ingest_prod.yml operational-tail contract (MON-250).

GitHub Actions skips every subsequent step once one fails, so a blocking
data-quality assertion in the middle of the daily job silently removes the
operational steps after it - cache revalidation, the MON-171 quiz gate and the
MON-225 database-size probe - for the whole day. During a recess it did so
every day, because `dbt source freshness` trips on the same stale data on each
run.

The fix is structural rather than behavioral, so these tests assert the
structure: every step between `dbt run` and the gate must be non-blocking, and
the gate must turn their recorded outcomes back into a red job.
"""

import pathlib

import pytest

yaml = pytest.importorskip("yaml")

WORKFLOW = pathlib.Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ingest_prod.yml"

# Steps whose failure must fail the job, but only via the gate — never by
# aborting the steps that follow them.
GATED_STEP_IDS = ("dbt_snapshot", "dbt_test", "dbt_freshness", "quiz_votes")


@pytest.fixture(scope="module")
def steps() -> list[dict]:
    return yaml.safe_load(WORKFLOW.read_text())["jobs"]["ingest"]["steps"]


def _index_of(steps: list[dict], name_prefix: str) -> int:
    for i, step in enumerate(steps):
        if step.get("name", "").startswith(name_prefix):
            return i
    raise AssertionError(f"no step named {name_prefix!r} in {WORKFLOW.name}")


def test_every_step_in_the_operational_tail_is_non_blocking(steps):
    """The core invariant: nothing between `dbt run` and the gate may abort the
    steps after it. A new blocking step added there re-introduces MON-250."""
    start = _index_of(steps, "Run dbt transformations")
    gate = _index_of(steps, "Data-quality gate")
    tail = steps[start + 1 : gate]
    assert tail, "operational tail is empty — the step order changed"
    blocking = [s["name"] for s in tail if s.get("continue-on-error") is not True]
    assert not blocking, (
        f"these steps run between `dbt run` and the data-quality gate without "
        f"continue-on-error, so a failure there skips everything after them: {blocking}"
    )


def test_operational_tail_runs_even_after_an_earlier_failure(steps):
    start = _index_of(steps, "Run dbt transformations")
    gate = _index_of(steps, "Data-quality gate")
    for step in steps[start + 1 : gate + 1]:
        assert "cancelled()" in str(step.get("if", "")), (
            f"{step['name']!r} would be skipped by the implicit success() once an "
            f"earlier step fails — it needs an explicit !cancelled() condition"
        )


def test_gate_fails_the_job_on_every_gated_step(steps):
    gate = steps[_index_of(steps, "Data-quality gate")]
    assert gate.get("continue-on-error") is not True, "the gate itself must be able to fail the job"
    for step_id in GATED_STEP_IDS:
        assert f"steps.{step_id}.outcome" in gate["run"], (
            f"the gate does not check steps.{step_id}.outcome, so that step's "
            f"failure would leave the job green"
        )


def test_every_gated_id_exists_and_is_non_blocking(steps):
    by_id = {s["id"]: s for s in steps if "id" in s}
    for step_id in GATED_STEP_IDS:
        assert step_id in by_id, f"the gate references steps.{step_id} but no step has that id"
        assert by_id[step_id].get("continue-on-error") is True


def test_database_size_probe_is_not_gated(steps):
    """A transient /health hiccup is a monitoring gap, not an ingestion
    failure — it must not send a false 'ingestion failed' alert."""
    gate = steps[_index_of(steps, "Data-quality gate")]
    assert "steps.db_size.outcome" not in gate["run"]


def test_gate_precedes_the_failure_notifications(steps):
    gate = _index_of(steps, "Data-quality gate")
    assert gate < _index_of(steps, "Notify failure")
    assert gate < _index_of(steps, "Email failure alert")


def test_dbt_test_and_source_freshness_are_separate_steps(steps):
    """Split so the run summary says which assertion tripped (MON-250)."""
    test_step = steps[_index_of(steps, "dbt test")]
    freshness_step = steps[_index_of(steps, "dbt source freshness")]
    assert "dbt source freshness" not in test_step["run"]
    assert "dbt test" not in freshness_step["run"]


def test_soft_failure_report_survives_a_red_gate(steps):
    """A data-quality failure must not swallow the soft-failure report the
    2026-07 organeRef incident showed is needed."""
    for name in ("Notify soft failures", "Email soft-failure alert"):
        assert "cancelled()" in str(steps[_index_of(steps, name)]["if"])
