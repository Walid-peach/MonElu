"""
Table-driven tests for the party-label normalization logic that encodes
the 2026-07 fragmentation incident's lessons:
  - scripts/backfill_party_labels.py::compute_changes
  - scripts/ingest_organes.py::build_deputy_party_map priority order
"""

import io
import json
import zipfile

from scripts.backfill_party_labels import (
    CANONICAL_LABELS,
    CANONICAL_SHORT_LABELS,
    LABEL_MAP,
    compute_changes,
)
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


def test_canonical_short_labels_cover_every_canonical_label():
    # party_short is derived from this map for every canonical party (see
    # update_party.py / backfill_party_labels.py) — a missing entry would
    # raise a KeyError at write time, so the two sets must stay in lockstep.
    assert set(CANONICAL_SHORT_LABELS.keys()) == CANONICAL_LABELS


def test_canonical_short_labels_are_unique():
    # Two full names collapsing to the same short code would silently merge
    # distinct groups in the vote breakdown table.
    codes = list(CANONICAL_SHORT_LABELS.values())
    assert len(codes) == len(set(codes))


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


def _mandat(type_organe: str, organe_ref: str | list[str], date_fin: str | None) -> dict:
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


def test_organe_ref_list_does_not_crash():
    # A MINISTERE mandat can carry several organeRefs (a minister sits in more
    # than one governmental organe) - the AN export collapses this to a list
    # instead of a scalar. This must not crash the GP/PARPOL lookup for the
    # deputy's other, unrelated mandats (2026-07 incident: TypeError on
    # `organe_ref not in gp_map` when organe_ref was a list).
    zf = _make_amo10_zip(
        [
            _mandat("MINISTERE", ["ORG_UNRELATED_1", "ORG_UNRELATED_2"], None),
            _mandat("GP", "ORG_GP1", None),
        ]
    )
    assert build_deputy_party_map(zf, GP_MAP) == {"PA1": "Groupe A"}


def test_gp_mandat_with_list_organe_ref_resolves_first_known_match():
    zf = _make_amo10_zip([_mandat("GP", ["ORG_UNKNOWN", "ORG_GP1"], None)])
    assert build_deputy_party_map(zf, GP_MAP) == {"PA1": "Groupe A"}
