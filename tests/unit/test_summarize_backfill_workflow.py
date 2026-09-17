"""
Guards the summary-backfill failure contract (GH #384).

`summarize_backfill.yml` reported success every day for six consecutive days
while generating zero summaries: the Groq key had expired, every call returned
401, `generate_vote_summaries.py` logged each one at WARNING and exited 0, and
the workflow parsed the error count into a step output it never asserted on. A
run where every call failed was indistinguishable from a run with nothing to do,
while 1 243 votes sat unsummarized.

The fix is in two halves that only work together, so both are pinned here:
the script exits non-zero when it attempted work and generated nothing, and the
workflow stops discarding that exit code through `tee`.
"""

import pathlib

import pytest

yaml = pytest.importorskip("yaml")

from scripts.generate_vote_summaries import check_summary_yield  # noqa: E402

WORKFLOW = (
    pathlib.Path(__file__).resolve().parents[2] / ".github" / "workflows" / "summarize_backfill.yml"
)


@pytest.fixture(scope="module")
def steps() -> list[dict]:
    return yaml.safe_load(WORKFLOW.read_text())["jobs"]["backfill"]["steps"]


@pytest.fixture(scope="module")
def summarize_step(steps: list[dict]) -> dict:
    for step in steps:
        if step.get("id") == "summarize":
            return step
    raise AssertionError("no step with id 'summarize' in summarize_backfill.yml")


class TestScriptGuard:
    def test_total_failure_exits_1(self):
        """The 2026-09 shape: every Groq call 401s, nothing is written."""
        with pytest.raises(SystemExit) as exc_info:
            check_summary_yield({"generated": 0, "errors": 1243})
        assert exc_info.value.code == 1

    def test_partial_failure_stays_green(self):
        """A few bad votes must not redden the run - they keep
        summary_plain IS NULL and are retried on the next run."""
        check_summary_yield({"generated": 40, "errors": 3})

    def test_single_success_with_many_errors_stays_green(self):
        """Deliberately not a ratio guard, unlike the ingestion parsers: this
        job is self-healing and its daily backlog is small enough that one
        transient 429 would already exceed SKIP_RATE_THRESHOLD."""
        check_summary_yield({"generated": 1, "errors": 30})

    def test_clean_run_passes(self):
        check_summary_yield({"generated": 12, "errors": 0})

    def test_nothing_attempted_is_not_a_failure(self):
        """main() returns before the guard when the backlog is empty; the guard
        must agree, or an idle day would go red."""
        check_summary_yield({"generated": 0, "errors": 0})


class TestWorkflowPropagatesTheFailure:
    def test_the_pipeline_cannot_report_tees_exit_code(self, summarize_step):
        """The summarizer is piped into tee, so its exit code survives only
        under pipefail. `shell: bash` already implies `-eo pipefail`, and the
        explicit `set -o pipefail` keeps that true if the shell line is ever
        dropped - the default shell is `bash -e`, without pipefail. Either one
        alone is enough; losing both silently restores GH #384."""
        assert (
            summarize_step.get("shell") == "bash" or "set -o pipefail" in summarize_step["run"]
        ), "neither `shell: bash` nor an explicit `set -o pipefail` - tee's exit code would win"
        assert "set -o pipefail" in summarize_step["run"], (
            "the explicit set -o pipefail is gone; the step now depends entirely on "
            "`shell: bash` implying it"
        )

    def test_summarizer_exit_code_is_propagated(self, summarize_step):
        run = summarize_step["run"]
        assert "|| status=$?" in run, "the pipeline's exit status is not captured"
        assert 'exit "$status"' in run, "the captured status is never returned to Actions"

    def test_counts_are_published_before_the_step_exits(self, summarize_step):
        """The job summary reads these outputs and must still describe a red
        run, so the exit has to come last."""
        run = summarize_step["run"]
        assert run.index("generated=$generated") < run.index('exit "$status"')
        assert run.index("errors=$errors") < run.index('exit "$status"')

    def test_step_can_actually_fail_the_job(self, summarize_step):
        assert summarize_step.get("continue-on-error") is not True

    def test_failure_is_announced(self, steps):
        notify = [s for s in steps if s.get("name") == "Notify failure"]
        assert notify, "no failure notification step"
        assert "failure()" in str(notify[0].get("if"))

    def test_job_summary_still_runs_on_a_red_run(self, steps):
        summary = [s for s in steps if s.get("name") == "Write job summary"]
        assert summary, "no job summary step"
        assert "always()" in str(summary[0].get("if")), (
            "the summary step would be skipped once the summarizer fails, hiding "
            "the counts on exactly the runs that need them"
        )


# ---------------------------------------------------------------------------
# Scoped cache invalidation (GH #353)
# ---------------------------------------------------------------------------


def _named(steps: list[dict], name: str) -> dict:
    for step in steps:
        if step.get("name") == name:
            return step
    raise AssertionError(f"no step named {name!r} in summarize_backfill.yml")


def test_summarizer_writes_the_ids_it_summarized(summarize_step: dict) -> None:
    """The scope is built from the ids, so the generator has to emit them."""
    assert "--changed-ids-out /tmp/summarized_vote_ids.txt" in summarize_step["run"]


def test_revalidate_sends_a_summaries_only_scope(steps: list[dict]) -> None:
    """This job rewrites summary text and nothing else.

    It must not send the `votes` family: that family carries the `health` tag
    the root layout reads, so it would purge every page on the site for a
    handful of retried sentences, and `MAX(voted_at)` has not moved anyway.
    """
    run = _named(steps, "Revalidate frontend cache")["run"]
    assert "scripts.build_summary_scope /tmp/summarized_vote_ids.txt" in run
    assert '--data "$scope"' in run


def test_revalidate_falls_back_to_a_full_purge_without_an_id_file(steps: list[dict]) -> None:
    """`build_summary_scope.py` prints nothing when there is no file.

    An empty `$scope` is an empty body, which the endpoint reads as the full
    purge - over-purging on doubt, never under-purging.
    """
    run = _named(steps, "Revalidate frontend cache")["run"]
    assert "|| echo" in run
