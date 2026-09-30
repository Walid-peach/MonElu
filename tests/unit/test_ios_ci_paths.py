"""
Guards the split between the web checks and the iOS checks (ADR-041 §3, #449).

`ci.yml` skips PRs confined to `ios/`, and `ios.yml` runs only on PRs that can
affect the app. A filter that drifts fails silently in one of two ways: web
jobs burn minutes on every Swift change, or - worse - an API change stops
building the app whose client is generated from it. Both filters are pinned
here, alongside the deploy filters in test_ios_deploy_isolation.py.
"""

import fnmatch
import pathlib

import pytest

yaml = pytest.importorskip("yaml")

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

IOS_PATHS = ["ios/**", "api/**", "data/reference/**", ".github/workflows/ios.yml"]


def _triggers(name: str) -> dict:
    workflow = yaml.safe_load((WORKFLOWS / name).read_text())
    # PyYAML reads the bare `on:` key as the boolean True (YAML 1.1).
    return workflow.get("on", workflow.get(True))


SNAPSHOT = "ios/Packages/MonEluAPI/Sources/MonEluAPI/openapi.json"


def _matches(path: str, patterns: list[str]) -> bool:
    """GitHub's `paths` semantics: patterns apply in order, a `!` pattern
    excludes, and the last pattern that matches decides. fnmatch's `*` spans
    directories like GitHub's `**`, which is close enough for these prefixes."""
    included = False
    for pattern in patterns:
        if pattern.startswith("!"):
            if fnmatch.fnmatch(path, pattern[1:]):
                included = False
        elif fnmatch.fnmatch(path, pattern):
            included = True
    return included


def test_ci_skips_prs_confined_to_ios_except_the_openapi_snapshot():
    pull_request = _triggers("ci.yml")["pull_request"]
    assert pull_request["branches"] == ["master"]
    assert pull_request["paths"] == ["**", "!ios/**", SNAPSHOT]
    assert "paths-ignore" not in pull_request, (
        "`paths` and `paths-ignore` cannot be combined on one event"
    )


def test_ios_workflow_runs_on_prs_that_can_affect_the_app():
    triggers = _triggers("ios.yml")
    assert triggers["pull_request"]["branches"] == ["master"]
    assert triggers["pull_request"]["paths"] == IOS_PATHS
    assert triggers["push"]["paths"] == IOS_PATHS
    assert "workflow_dispatch" in triggers


@pytest.mark.parametrize(
    ("changed", "runs_ci", "runs_ios"),
    [
        (["ios/MonElu/Sources/RootTabView.swift"], False, True),
        (["frontend/src/app/page.tsx"], True, False),
        (["api/routers/votes.py"], True, True),
        (["data/reference/groups.json"], True, True),
        (["ios/Project.swift", "frontend/src/lib/api.ts"], True, True),
        # The snapshot's drift test lives in ci.yml, so a hand edit runs it.
        ([SNAPSHOT], True, True),
    ],
)
def test_a_pr_runs_the_right_workflows(changed, runs_ci, runs_ios):
    ci_paths = _triggers("ci.yml")["pull_request"]["paths"]
    ios_paths = _triggers("ios.yml")["pull_request"]["paths"]
    # A workflow runs when any changed file is in scope.
    assert any(_matches(path, ci_paths) for path in changed) is runs_ci
    assert any(_matches(path, ios_paths) for path in changed) is runs_ios


def test_ios_workflow_pins_the_snapshot_toolchain():
    """Reference images render identically only on the Xcode, device and
    runtime they were recorded with (ios/CLAUDE.md, Design)."""
    workflow = yaml.safe_load((WORKFLOWS / "ios.yml").read_text())
    assert workflow["env"]["XCODE_APP"] == "/Applications/Xcode_27.0.app"
    assert workflow["env"]["SIMULATOR_DEVICE"] == "iPhone 18 Pro"
    assert workflow["env"]["SIMULATOR_RUNTIME"].endswith("iOS-27-0")


def _jobs() -> dict:
    return yaml.safe_load((WORKFLOWS / "ios.yml").read_text())["jobs"]


def test_tests_and_smoke_run_as_parallel_jobs():
    """#469: the smoke flows do not wait for the unit and snapshot tests."""
    jobs = _jobs()
    assert set(jobs) == {"changes", "test", "smoke"}
    assert "make ios-test" in [step.get("run", "") for step in jobs["test"]["steps"]]
    assert jobs["smoke"]["needs"] == "changes"
    assert "test" not in str(jobs["smoke"].get("needs"))


def test_no_build_cache():
    """Restoring it cost 4 to 7 minutes and made the build no faster (#469)."""
    for job in _jobs().values():
        assert all("actions/cache" not in step.get("uses", "") for step in job["steps"])


def test_smoke_runs_only_when_the_app_changed():
    """The smoke flows hit the production API, so an API-only PR cannot be
    tested by them; it still builds and tests the app."""
    jobs = _jobs()
    assert jobs["smoke"]["if"] == "needs.changes.outputs.app == 'true'"
    detect = next(step for step in jobs["changes"]["steps"] if step.get("id") == "diff")["run"]
    assert "^(ios/|data/reference/|\\.github/workflows/ios\\.yml$)" in detect


def test_smoke_is_light_only_on_pull_requests():
    """The snapshot tests cover dark mode on every PR; both appearances run
    after a merge to master."""
    appearances = _jobs()["smoke"]["env"]["IOS_APPEARANCES"]
    assert appearances == "${{ github.event_name == 'pull_request' && 'light' || 'light dark' }}"


def test_smoke_runs_the_flows_and_keeps_their_screenshots():
    """The smoke flows are ADR-041 §8's evidence for a reviewer who does not
    read Swift, so their screenshots are uploaded on every run (#450)."""
    steps = _jobs()["smoke"]["steps"]
    assert "make ios-smoke" in [step.get("run", "") for step in steps]
    upload = next(step for step in steps if step.get("name") == "Upload smoke screenshots")
    assert upload["if"] == "always()"
    assert upload["with"]["path"] == "ios/build/screenshots"
