"""
Tests for the agenda ZIP parser (MON-210, ADR-030).

All pure-function tests — no mocks, no DB, no network. Covers the single-point
vs list-point pointODJ shape, séance-vs-commission filtering, a cancelled
réunion, and a point with no dossierRef.
"""

import json
from pathlib import Path

from scripts.ingest_agenda import _odj_points, parse_point, parse_reunions

FIXTURES = Path(__file__).parent / "fixtures"


def _load_reunions() -> list[dict]:
    return json.loads((FIXTURES / "agenda_sample.json").read_text())


def _reunion(uid: str) -> dict:
    return next(r for r in _load_reunions() if r["uid"] == uid)


# ---------------------------------------------------------------------------
# _odj_points — single-point vs list shape
# ---------------------------------------------------------------------------


def test_odj_points_single_bare_object():
    reunion = _reunion("RUANR5L17S2026IDS29879")
    points = _odj_points(reunion)
    assert len(points) == 1
    assert points[0]["uid"] == "RUANR5L17S2026IDS29879PT50907"


def test_odj_points_list_shape():
    reunion = _reunion("RUANR5L17S2026IDS29900")
    points = _odj_points(reunion)
    assert len(points) == 2
    assert {p["uid"] for p in points} == {
        "RUANR5L17S2026IDS29900PT50920",
        "RUANR5L17S2026IDS29900PT50921",
    }


def test_odj_points_empty_when_missing():
    assert _odj_points({}) == []


# ---------------------------------------------------------------------------
# parse_point
# ---------------------------------------------------------------------------


def test_parse_point_with_dossier_ref():
    reunion = _reunion("RUANR5L17S2026IDS29879")
    point = _odj_points(reunion)[0]
    record = parse_point(reunion, point)
    assert record is not None
    assert record["point_uid"] == "RUANR5L17S2026IDS29879PT50907"
    assert record["reunion_uid"] == "RUANR5L17S2026IDS29879"
    assert record["dossier_id"] == "DLR5L17N53980"
    assert record["procedure_label"] == "Procédure accélérée"
    assert record["reunion_etat"] == "Confirmé"
    assert record["published_at"] == "2026-01-05"
    assert record["cancelled_at"] is None
    assert record["objet_hash"] is not None


def test_parse_point_without_dossier_ref():
    """A point with no dossierRef (e.g. Questions au Gouvernement) parses fine
    and carries dossier_id=None rather than raising."""
    reunion = _reunion("RUANR5L17S2026IDS29900")
    point = next(p for p in _odj_points(reunion) if p["uid"] == "RUANR5L17S2026IDS29900PT50920")
    record = parse_point(reunion, point)
    assert record is not None
    assert record["dossier_id"] is None
    assert record["objet"] == "Questions au Gouvernement"


def test_parse_point_missing_uid_returns_none():
    reunion = _reunion("RUANR5L17S2026IDS29879")
    assert parse_point(reunion, {}) is None


def test_parse_point_missing_sitting_start_returns_none():
    assert parse_point({"uid": "R1"}, {"uid": "P1"}) is None


# ---------------------------------------------------------------------------
# Cancelled réunion — reflected, not dropped (ADR-030)
# ---------------------------------------------------------------------------


def test_cancelled_reunion_reflected_in_etat_and_cancelled_at():
    reunion = _reunion("RUANR5L17S2026IDS29950")
    point = _odj_points(reunion)[0]
    record = parse_point(reunion, point)
    assert record is not None
    assert record["reunion_etat"] == "Annulé"
    assert record["point_etat"] == "Annulé"
    assert record["cancelled_at"] == "2026-01-18"


# ---------------------------------------------------------------------------
# parse_reunions — séance-only filtering + --since window
# ---------------------------------------------------------------------------


def test_parse_reunions_filters_out_commission():
    records = parse_reunions(_load_reunions())
    reunion_uids = {r["reunion_uid"] for r in records}
    assert "RUANR5L17C2026IDS30000" not in reunion_uids


def test_parse_reunions_includes_all_seance_points():
    records = parse_reunions(_load_reunions())
    # 1 (single) + 2 (list) + 1 (cancelled) = 4 séance ODJ points
    assert len(records) == 4


def test_parse_reunions_since_filters_older_sittings():
    records = parse_reunions(_load_reunions(), since="2026-01-16")
    reunion_uids = {r["reunion_uid"] for r in records}
    assert reunion_uids == {"RUANR5L17S2026IDS29950"}
