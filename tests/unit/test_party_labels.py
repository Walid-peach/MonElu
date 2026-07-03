"""
Table-driven tests for the party-label normalization logic that encodes
the 2026-07 fragmentation incident's lessons:
  - scripts/backfill_party_labels.py::compute_changes
  - scripts/ingest_organes.py::build_deputy_party_map priority order
"""

import io
import json
import zipfile

from scripts.backfill_party_labels import CANONICAL_LABELS, LABEL_MAP, compute_changes
from scripts.ingest_organes import build_deputy_party_map

# ---------------------------------------------------------------------------
# compute_changes
# ---------------------------------------------------------------------------


def test_variant_label_is_mapped():
    changes, unmapped = compute_changes([("PA1", "Alice", "Rassemblement national")])
    assert changes == [("PA1", "Alice", "Rassemblement national", "Rassemblement National")]
    assert unmapped == []


def test_canonical_label_is_never_touched_even_with_override():
    # PA605694 (Falorni) has an OVERRIDE, but a canonical current label wins
    changes, unmapped = compute_changes([("PA605694", "Olivier Falorni", "Les Démocrates")])
    assert changes == []
    assert unmapped == []


def test_override_beats_label_map():
    # PA720162 (Bolo) carried "Ensemble !" but sat with Les Démocrates
    changes, _ = compute_changes(
        [("PA720162", "Philippe Bolo", "Ensemble ! (majorité présidentielle)")]
    )
    assert changes == [
        (
            "PA720162",
            "Philippe Bolo",
            "Ensemble ! (majorité présidentielle)",
            "Les Démocrates",
        )
    ]


def test_null_party_is_left_alone():
    changes, unmapped = compute_changes([("PA9", "Untel", None)])
    assert changes == []
    assert unmapped == []


def test_unknown_label_is_reported_not_guessed():
    changes, unmapped = compute_changes([("PA9", "Untel", "Parti Inconnu")])
    assert changes == []
    assert unmapped == [("PA9", "Untel", "Parti Inconnu")]


def test_label_map_targets_are_canonical():
    assert set(LABEL_MAP.values()) <= CANONICAL_LABELS


# ---------------------------------------------------------------------------
# build_deputy_party_map priority: active GP > latest ended GP > PARPOL
# ---------------------------------------------------------------------------


def _make_amo10_zip(mandats: list[dict]) -> zipfile.ZipFile:
    acteur = {"acteur": {"uid": {"#text": "PA1"}, "mandats": {"mandat": mandats}}}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("json/acteur/PA1.json", json.dumps(acteur))
    return zipfile.ZipFile(buf)


GP_MAP = {"ORG_GP1": "Groupe A", "ORG_GP2": "Groupe B", "ORG_PP": "Parti P"}


def _mandat(type_organe: str, organe_ref: str, date_fin: str | None) -> dict:
    return {
        "typeOrgane": type_organe,
        "dateFin": date_fin,
        "organes": {"organeRef": organe_ref},
    }


def test_active_gp_wins_over_everything():
    zf = _make_amo10_zip(
        [
            _mandat("GP", "ORG_GP1", None),
            _mandat("GP", "ORG_GP2", "2025-01-01"),
            _mandat("PARPOL", "ORG_PP", None),
        ]
    )
    assert build_deputy_party_map(zf, GP_MAP) == {"PA1": "Groupe A"}


def test_latest_ended_gp_beats_active_parpol():
    zf = _make_amo10_zip(
        [
            _mandat("GP", "ORG_GP1", "2024-12-01"),
            _mandat("GP", "ORG_GP2", "2025-06-01"),
            _mandat("PARPOL", "ORG_PP", None),
        ]
    )
    assert build_deputy_party_map(zf, GP_MAP) == {"PA1": "Groupe B"}


def test_parpol_is_last_resort():
    zf = _make_amo10_zip([_mandat("PARPOL", "ORG_PP", None)])
    assert build_deputy_party_map(zf, GP_MAP) == {"PA1": "Parti P"}
