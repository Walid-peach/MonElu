"""The cache-invalidation scope ingestion hands to `/api/revalidate` (GH #353).

The property under test throughout is asymmetric on purpose: every way of
getting the scope wrong must over-purge (cost) rather than under-purge (a day of
stale pages). The endpoint reads an *absent* body as a full purge, so these
tests care most about which shapes produce no body at all.
"""

import json
import pathlib
import re
import subprocess
import sys

import pytest

from scripts._cache_scope import (
    FAMILIES,
    MAX_ENTITY_IDS,
    CacheScope,
    publish_scope,
    read_changed_ids,
    write_changed_ids,
)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE_TAGS_TS = REPO_ROOT / "frontend" / "src" / "lib" / "cacheTags.ts"


def test_no_op_run_produces_an_empty_scope():
    scope = CacheScope()
    assert scope.is_empty
    assert scope.to_payload() == {"families": []}
    assert "nothing changed" in scope.describe()


def test_empty_families_is_still_a_targeted_payload():
    """A no-op run must send `{"families": []}`, not an empty body.

    An empty body is the full purge, which is exactly what a quiet weekday must
    not trigger - it is the whole point of the change.
    """
    assert json.loads(CacheScope().to_json()) == {"families": []}


def test_changed_votes_take_the_votes_family_and_their_entity_tags():
    scope = CacheScope()
    scope.add_votes(["VTANR5L17V1", "VTANR5L17V2"])
    payload = scope.to_payload()
    assert payload["families"] == ["votes"]
    assert payload["votes"] == ["VTANR5L17V1", "VTANR5L17V2"]


def test_summaries_never_claim_the_votes_family():
    """`votes` carries the health tag, which the root layout reads (GH #353).

    Claiming it for a retried summary would purge every page on the site for one
    rewritten sentence - the exact fan-out this change removes.
    """
    scope = CacheScope()
    scope.add_summaries(["VTANR5L17V1"])
    payload = scope.to_payload()
    assert payload["families"] == ["summaries"]
    assert "votes" not in payload["families"]
    assert payload["votes"] == ["VTANR5L17V1"]


def test_deputy_corrections_are_named_individually():
    scope = CacheScope()
    scope.add_deputies(["PA1592", "PA721"])
    payload = scope.to_payload()
    assert payload["families"] == ["deputies"]
    assert payload["deputies"] == ["PA1592", "PA721"]


def test_over_the_entity_cap_the_run_falls_back_to_a_full_purge():
    """Dropping the ids and keeping the family would under-purge.

    A scrutin's own page is reached only through its `vote:<id>` tag - the
    family tags live on the lists, which is what makes one retried summary
    cheap. So a change set too large to name has to send no body at all, which
    the endpoint reads as the full purge.
    """
    scope = CacheScope()
    scope.add_votes([f"VT{i}" for i in range(MAX_ENTITY_IDS + 1)])
    assert scope.is_over_cap
    assert scope.to_payload() is None
    assert scope.to_json() == ""
    assert "full purge" in scope.describe()


def test_exactly_at_the_cap_still_names_its_entities():
    scope = CacheScope()
    scope.add_votes([f"VT{i}" for i in range(MAX_ENTITY_IDS)])
    assert not scope.is_over_cap
    assert len(scope.to_payload()["votes"]) == MAX_ENTITY_IDS


def test_publish_writes_an_empty_scope_over_the_cap(tmp_path, monkeypatch):
    """The workflow's `-n "$CACHE_SCOPE"` check is what turns this into a full purge."""
    output = tmp_path / "gh_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    scope = CacheScope()
    scope.add_deputies([f"PA{i}" for i in range(MAX_ENTITY_IDS + 1)])
    publish_scope(scope)
    lines = dict(line.split("=", 1) for line in output.read_text().strip().splitlines())
    assert lines["cache_scope"] == ""


def test_unknown_family_is_rejected_at_the_source():
    with pytest.raises(ValueError):
        CacheScope().add_family("everything")


def test_families_match_the_frontend_vocabulary():
    """The two halves are separate files; a rename in one must not pass alone."""
    source = CACHE_TAGS_TS.read_text(encoding="utf-8")
    block = source.split("SCOPE_FAMILY_TAGS: Record<string, readonly string[]> = {")[1]
    block = block.split("}")[0]
    declared = {line.split(":")[0].strip() for line in block.splitlines() if ":" in line}
    declared = {name for name in declared if name and not name.startswith("//")}
    assert declared == set(FAMILIES)


def test_changed_ids_round_trip(tmp_path):
    path = tmp_path / "ids.txt"
    write_changed_ids(str(path), ["VT1", "VT2"])
    assert read_changed_ids(str(path)) == ["VT1", "VT2"]


def test_missing_changed_ids_file_reads_as_nothing(tmp_path):
    assert read_changed_ids(str(tmp_path / "absent.txt")) == []
    assert read_changed_ids(None) == []


def test_publish_scope_writes_the_body_and_the_human_line(tmp_path, monkeypatch):
    output = tmp_path / "gh_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    scope = CacheScope()
    scope.add_votes(["VT1"])
    publish_scope(scope)
    lines = dict(line.split("=", 1) for line in output.read_text().strip().splitlines())
    assert json.loads(lines["cache_scope"])["families"] == ["votes"]
    # Single-line: GITHUB_OUTPUT parses one key per line, so a pretty-printed
    # payload would corrupt every later output in the same file.
    assert "\n" not in lines["cache_scope"]
    assert "families: votes" in lines["cache_scope_summary"]


def _run_builder(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "build_summary_scope.py"), *args],
        capture_output=True,
        text=True,
    )


def test_summary_scope_builder_emits_a_summaries_only_payload(tmp_path):
    path = tmp_path / "ids.txt"
    path.write_text("VT1\nVT2\n")
    result = _run_builder(str(path))
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"families": ["summaries"], "votes": ["VT1", "VT2"]}


def test_summary_scope_builder_prints_nothing_when_there_is_no_id_file(tmp_path):
    """No file means the caller falls back to a full purge, not to an empty scope."""
    result = _run_builder(str(tmp_path / "absent.txt"))
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


def test_summary_scope_builder_prints_nothing_over_the_cap(tmp_path):
    path = tmp_path / "ids.txt"
    path.write_text("\n".join(f"VT{i}" for i in range(MAX_ENTITY_IDS + 1)))
    result = _run_builder(str(path))
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


# ---------------------------------------------------------------------------
# The guards the change detection is built on
# ---------------------------------------------------------------------------

WRITERS = (
    "ingest_votes.py",
    "ingest_deputies.py",
    "ingest_positions.py",
    "ingest_agenda.py",
    "update_party.py",
)


@pytest.mark.parametrize("script", WRITERS)
def test_every_writer_maintains_changed_at(script: str):
    """`changed_at` is the change marker, and every writer has to maintain it.

    `changed_ids()` reads `changed_at >= run_start`. A writer that stops setting
    it conditionally reports either nothing or its whole table as changed, and
    the targeted purge silently degrades - green tests, green workflow, and
    either stale pages or the Vercel bill back where GH #353 found it.
    """
    source = (REPO_ROOT / "scripts" / script).read_text(encoding="utf-8")
    assert "changed_at" in source, f"{script} writes rows without maintaining changed_at"
    assert "IS DISTINCT FROM" in source, f"{script} moves changed_at unconditionally"


# The three tables dbt declares with `loaded_at_field: ingested_at`.
FRESHNESS_SOURCES = ("ingest_votes.py", "ingest_deputies.py", "ingest_positions.py")


@pytest.mark.parametrize("script", FRESHNESS_SOURCES)
def test_ingested_at_stays_unconditional_for_dbt_source_freshness(script: str):
    """`ingested_at` means "the last run that wrote this row", and must stay that.

    `transform/models/staging/sources.yml` sets `loaded_at_field: ingested_at`
    on all three raw sources and documents `deputies` as the "cron silently
    died" detector at `error_after: 7 days`, precisely because every successful
    run re-upserts all 577 rows whether or not anything changed. `dbt source
    freshness` runs in `ingest_prod.yml` and the MON-250 gate re-fails the job
    on it, so making this column conditional - or skipping the row with a
    `WHERE` on the `DO UPDATE`, which stamps nothing at all - turns the daily
    job red about a week into any quiet stretch *and* destroys the alert for a
    cron that has really died.

    That is the trap `changed_at` (migration 011) exists to avoid, and this is
    the test that catches walking back into it.
    """
    source = (REPO_ROOT / "scripts" / script).read_text(encoding="utf-8")
    upsert = source.split("UPSERT_SQL")[1]
    assert re.search(r"ingested_at\s*=\s*NOW\(\)", upsert), (
        f"{script} no longer stamps ingested_at unconditionally"
    )
    # A CASE around it is the same regression wearing a different hat.
    assert not re.search(r"ingested_at\s*=\s*CASE", upsert), (
        f"{script} stamps ingested_at conditionally"
    )
    # A `WHERE` on the DO UPDATE skips the row entirely, so it cannot stamp
    # `ingested_at` either - the failure mode looks different but is the same.
    conflict = upsert.split("ON CONFLICT")[1].split('"""')[0]
    assert "\nWHERE " not in conflict, (
        f"{script} skips unchanged rows, which stops ingested_at from moving"
    )


def test_freshness_contract_is_declared_where_this_test_claims():
    """Pins the other side of the contract, so a sources.yml edit is visible here."""
    sources = (REPO_ROOT / "transform" / "models" / "staging" / "sources.yml").read_text(
        encoding="utf-8"
    )
    assert sources.count("loaded_at_field: ingested_at") == 3
    assert "changed_at" not in sources, (
        "dbt must read ingested_at (the run stamp), never changed_at (the change stamp)"
    )


def test_orchestrator_publishes_a_scope_and_collects_summary_ids():
    source = (REPO_ROOT / "scripts" / "run_ingestion_prod.py").read_text(encoding="utf-8")
    assert "publish_scope(scope)" in source
    # clock_timestamp(), not NOW(): the lock connection is held open for the
    # whole pipeline, so NOW() would predate every step.
    assert "clock_timestamp()" in source
    assert "--changed-ids-out" in source


def test_position_changes_do_not_claim_the_votes_family():
    """A corrected position purges the scrutin's page without purging the site.

    `add_position_votes` exists so this cannot be written as `add_votes`, which
    would claim `votes` and with it the `health` tag the root layout reads.
    """
    scope = CacheScope()
    scope.add_position_votes(["VT1"])
    payload = scope.to_payload()
    assert payload["families"] == ["positions"]
    assert payload["votes"] == ["VT1"]


def test_force_full_purge_sends_no_body_and_says_why():
    """The "we know that we do not know" case: a generator that died mid-sweep."""
    scope = CacheScope()
    scope.add_votes(["VT1"])
    scope.force_full_purge("vote summaries failed before reporting what it wrote")
    assert scope.needs_full_purge
    assert scope.to_json() == ""
    assert "full purge" in scope.describe()
    assert "vote summaries failed" in scope.describe()


def test_orchestrator_covers_the_signals_row_timestamps_cannot_see():
    """Two blind spots the scope would otherwise have, pinned at the source.

    An agenda item withdrawn upstream is never upserted, so nothing row-level
    moves; a summary generator that dies before writing its id file leaves an
    empty read that looks like "nothing was summarized".
    """
    source = (REPO_ROOT / "scripts" / "run_ingestion_prod.py").read_text(encoding="utf-8")
    assert "visible_agenda_count" in source
    assert "force_full_purge" in source
