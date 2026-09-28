"""
Guards ADR-041 §3: a change confined to `ios/` must not redeploy the API or
re-run dbt against production.

Railway redeploys on every push to master unless `railway.json` narrows it,
and `deploy.yml` runs `dbt run` against production on every push to master.
Neither failure would be loud: an iOS merge would simply restart the API and
rebuild the marts for no reason. Both halves are pinned here.

The Railway patterns are deliberately "everything, then not ios/" rather than
a list of the paths the API image reads - an enumerated list silently stops
deploying the day a new backend directory appears.
"""

import json
import pathlib

import pytest

yaml = pytest.importorskip("yaml")

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_railway_watches_everything_except_ios():
    build = json.loads((ROOT / "railway.json").read_text())["build"]
    assert build["watchPatterns"] == ["**", "!/ios/**"]


def test_deploy_workflow_ignores_ios_only_pushes():
    workflow = yaml.safe_load((ROOT / ".github" / "workflows" / "deploy.yml").read_text())
    # PyYAML reads the bare `on:` key as the boolean True (YAML 1.1).
    triggers = workflow.get("on", workflow.get(True))
    push = triggers["push"]
    assert push["branches"] == ["master"]
    assert push["paths-ignore"] == ["ios/**"]
    assert "paths" not in push, "`paths` and `paths-ignore` cannot be combined on one event"
    assert "workflow_dispatch" in triggers
