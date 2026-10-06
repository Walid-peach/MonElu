"""
data/reference/*.json is the one copy of the departments, groups and themes
tables that the iOS app bundles and the website's Jest suite checks itself
against (ADR-041 §4, #439). It is generated from api/*_data.py, so it can only
be wrong by being stale - which is what this catches.

Fix a failure by running `python scripts/export_reference_data.py` and
committing the result, never by editing the JSON by hand.
"""

import json

from scripts.export_reference_data import (
    DEFAULT_OUT_DIR,
    drifted,
    main,
    reference_tables,
    write,
)


def test_committed_reference_data_matches_the_python_source():
    assert drifted(DEFAULT_OUT_DIR) == []


def test_check_mode_fails_on_drift_and_passes_when_current(tmp_path, capsys):
    write(tmp_path)
    assert main(["--check", "--out-dir", str(tmp_path)]) == 0

    groups = tmp_path / "groups.json"
    rows = json.loads(groups.read_text(encoding="utf-8"))
    rows[0]["name"] = "Renamed upstream"
    groups.write_text(json.dumps(rows), encoding="utf-8")

    assert main(["--check", "--out-dir", str(tmp_path)]) == 1
    assert "groups.json" in capsys.readouterr().out


def test_check_mode_fails_when_a_file_is_missing(tmp_path):
    write(tmp_path)
    (tmp_path / "themes.json").unlink()
    assert main(["--check", "--out-dir", str(tmp_path)]) == 1


def test_tables_are_ordered_lists_with_unique_keys():
    """Lists, because Swift's Dictionary drops order; unique keys, because a
    duplicate would decode silently on one client and not another."""
    for name, rows in reference_tables().items():
        assert isinstance(rows, list) and rows, name
        key = {
            "departments.json": "code",
            "dossier_stages.json": "code",
            "dossier_statuses.json": "status",
        }.get(name, "slug")
        keys = [row[key] for row in rows]
        assert len(keys) == len(set(keys)), name


def test_vote_positions_file_is_well_formed():
    """Hand-written (the labels have no Python source); Jest checks the labels
    against vote-position.ts, this checks the four keys the API returns."""
    rows = json.loads((DEFAULT_OUT_DIR / "vote_positions.json").read_text(encoding="utf-8"))
    assert [row["key"] for row in rows] == ["pour", "contre", "abstention", "nonVotant"]
    assert all(row["label"] for row in rows)


def test_bill_status_labels_cover_every_derived_status():
    """One label per value the API derives, in ADR-035 §5's order."""
    from api.lois_data import DOSSIER_STATUS_LABELS
    from api.routers.lois import DOSSIER_STATUSES

    assert tuple(DOSSIER_STATUS_LABELS) == DOSSIER_STATUSES


def test_bill_stages_are_reading_stages_on_the_four_steps():
    """Every stage code is one ingestion knows, on one of the strip's steps."""
    from api.lois_data import DOSSIER_STAGES
    from scripts.ingest_dossiers import (
        CONSEIL_CONSTITUTIONNEL_CODE,
        PROMULGATION_CODE,
        READING_STAGE_CODES,
    )

    known = READING_STAGE_CODES | {CONSEIL_CONSTITUTIONNEL_CODE, PROMULGATION_CODE}
    assert set(DOSSIER_STAGES) <= known
    assert {step for step, _ in DOSSIER_STAGES.values()} == {"an", "senat", "cmp", "loi"}
