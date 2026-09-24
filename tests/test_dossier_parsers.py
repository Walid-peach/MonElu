"""
Tests for the dossiers ZIP parser (MON-243 / GH #368, ADR-035).

All pure-function tests — no mocks, no DB, no network. Covers the single-acte
dict vs list shape at the top level and nested, a dossier ending at PROM, a
dossier with only an AN1 stage, a missing titreDossier, the 43-uid cross-dossier
collision, and the totality of ADR-035 §5's status rules.
"""

import itertools
import json
from pathlib import Path

import pytest

from scripts.ingest_dossiers import (
    STATUS_VALUES,
    _as_list,
    _child_actes,
    _initiateur,
    derive_status,
    flatten_actes,
    parse_dossier,
    parse_dossiers,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _load() -> list[dict]:
    return json.loads((FIXTURES / "dossier_sample.json").read_text())


def _dossier(uid: str) -> dict:
    return next(d for d in _load() if d["uid"] == uid)


def _parsed(uid: str):
    parsed = parse_dossier(_dossier(uid))
    assert parsed is not None
    return parsed


# ---------------------------------------------------------------------------
# _as_list / _child_actes — the dict-vs-list shape, at every level
# ---------------------------------------------------------------------------


def test_as_list_wraps_a_bare_dict():
    assert _as_list({"uid": "x"}) == [{"uid": "x"}]


def test_as_list_passes_a_list_through():
    assert _as_list([{"uid": "x"}, {"uid": "y"}]) == [{"uid": "x"}, {"uid": "y"}]


def test_as_list_of_none_is_empty():
    assert _as_list(None) == []


def test_child_actes_handles_a_single_nested_dict():
    """AN1-COM on DLR5L17N51670 has exactly one child, so it is a bare dict."""
    _, actes = _parsed("DLR5L17N51670")
    com = next(a for a in actes if a["code_acte"] == "AN1-COM")
    children = [a for a in actes if a["parent_uid"] == com["acte_uid"]]
    assert [c["code_acte"] for c in children] == ["AN1-COM-FOND-SAISIE"]


def test_child_actes_of_a_leaf_is_empty():
    assert _child_actes({"uid": "x", "actesLegislatifs": None}) == []


def test_top_level_single_acte_dict_is_parsed():
    """DLR5L17N50002's actesLegislatifs.acteLegislatif is a bare dict."""
    _, actes = _parsed("DLR5L17N50002")
    assert [a["code_acte"] for a in actes if a["depth"] == 0] == ["AN1"]
    assert len(actes) == 2


def test_top_level_list_is_parsed():
    _, actes = _parsed("DLR5L17N51670")
    assert [a["code_acte"] for a in actes if a["depth"] == 0] == ["AN1", "SN1"]


# ---------------------------------------------------------------------------
# flatten_actes — tree structure
# ---------------------------------------------------------------------------


def test_flatten_preserves_parent_depth_and_document_order():
    _, actes = _parsed("DLR5L17N51670")
    assert [(a["code_acte"], a["depth"]) for a in actes] == [
        ("AN1", 0),
        ("AN1-DEPOT", 1),
        ("AN1-COM", 1),
        ("AN1-COM-FOND-SAISIE", 2),
        ("AN1-DEBATS-DEC", 1),
        ("SN1", 0),
    ]
    assert [a["ordinal"] for a in actes] == [0, 1, 2, 3, 4, 5]
    by_code = {a["code_acte"]: a for a in actes}
    assert by_code["AN1-DEPOT"]["parent_uid"] == by_code["AN1"]["acte_uid"]
    assert by_code["AN1"]["parent_uid"] is None


def test_flatten_skips_an_acte_with_no_uid_or_code():
    rows = flatten_actes("DLR5L17N99999", [{"codeActe": "AN1"}, {"uid": "L17-X"}])
    assert rows == []


def test_acte_fields_are_carried_verbatim():
    _, actes = _parsed("DLR5L17N51670")
    decision = next(a for a in actes if a["acte_type"] == "Decision_Type")
    assert decision["statut_label"] == "adoptée"
    assert decision["date_acte"] == "2025-05-27"
    assert decision["libelle"] == "Décision"


# ---------------------------------------------------------------------------
# The 43 uids that belong to two dossiers each (ADR-035 §3)
# ---------------------------------------------------------------------------


def test_same_acte_uid_in_two_dossiers_stays_two_distinct_rows():
    """L17-VD223530 is AN21-DGVT on DLR5L17N51427 and ANNLEC-DGVT on DLR5L17N50588.

    A single-column acte_uid primary key would collapse these two rows into one
    and fail on first ingestion — the composite key is what models the real
    relationship, which is that one procedural event can belong to two dossiers.
    """
    rows, actes = parse_dossiers([_dossier("DLR5L17N51427"), _dossier("DLR5L17N50588")])
    assert len(rows) == 2
    shared = [a for a in actes if a["acte_uid"] == "L17-VD223530"]
    assert len(shared) == 2
    assert {a["dossier_uid"] for a in shared} == {"DLR5L17N51427", "DLR5L17N50588"}
    assert {a["code_acte"] for a in shared} == {"AN21-DGVT", "ANNLEC-DGVT"}
    keys = {(a["dossier_uid"], a["acte_uid"]) for a in actes}
    assert len(keys) == len(actes)


# ---------------------------------------------------------------------------
# parse_dossier — dossier-level fields
# ---------------------------------------------------------------------------


def test_dossier_row_fields():
    row, _ = _parsed("DLR5L17N51670")
    assert row["titre"] == "Fin de vie"
    assert row["titre_chemin"] == "fin_de_vie_17e"
    assert row["legislature"] == "17"
    assert row["procedure_code"] == "2"
    assert row["procedure_label"] == "Proposition de loi ordinaire"
    assert row["current_stage"] == "SN1"
    assert row["parcours_start"] == "2025-03-11"
    assert row["parcours_end"] == "2025-10-07"


def test_missing_titre_is_skipped():
    """`titre` is NOT NULL and is the page's <h1>; ADR-035 §8 has no fallback."""
    assert parse_dossier(_dossier("DLR5L17N50003")) is None


def test_initiateur_prefers_the_acteur_ref():
    assert _initiateur(_dossier("DLR5L17N51670")) == "PA605694"


def test_initiateur_falls_back_to_the_organe_ref():
    assert _initiateur(_dossier("DLR5L17N50001")) == "PO866403"


def test_initiateur_absent_is_none():
    assert _initiateur(_dossier("DLR5L17N50002")) is None


# ---------------------------------------------------------------------------
# derive_status — ADR-035 §5's seven ordered rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("uid", "status", "status_label"),
    [
        # 1 — PROM wins over the "adoptée sans modification" decision below it
        ("DLR5L17N50001", "promulguee", "adoptée sans modification"),
        # 2 — CC wins over the "adoptée" decision below it
        ("DLR5L17N50007", "conseil_constitutionnel", "adoptée"),
        # 3 — first word of the normalised label starts "rejet"
        ("DLR5L17N50005", "rejetee", "rejet du texte par la commission préalable"),
        # 4 — sole reading stage, also the last in document order
        (
            "DLR5L17N50004",
            "adoptee_definitivement",
            "adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution",
        ),
        # 5 — no decision, no -COM acte
        ("DLR5L17N50002", "deposee", None),
        # 6 — no decision, a -COM acte exists
        ("DLR5L17N50006", "en_commission", None),
        # 7 — total fallback: adopted at first reading with the Sénat still to come
        ("DLR5L17N51670", "en_navette", "adoptée"),
    ],
)
def test_status_rules(uid, status, status_label):
    row, _ = _parsed(uid)
    assert row["status"] == status
    assert row["status_label"] == status_label


def test_rule_4_does_not_fire_when_a_second_reading_stage_exists():
    """The conservative half of rule 4: a text adopted at first reading with a
    second chamber still to come is in navette, not finished."""
    row, _ = _parsed("DLR5L17N51670")
    assert row["status"] == "en_navette"


def test_a_decision_with_no_date_is_not_the_deciding_acte():
    """`decisions` is the Decision_Type actes *carrying a dateActe* (ADR-035 §5)."""
    actes = flatten_actes(
        "DLR5L17N99999",
        [
            {
                "uid": "L17-AN1-X",
                "codeActe": "AN1",
                "@xsi:type": "Etape_Type",
                "actesLegislatifs": {
                    "acteLegislatif": {
                        "uid": "L17-X-DEC",
                        "codeActe": "AN1-DEBATS-DEC",
                        "@xsi:type": "Decision_Type",
                        "dateActe": None,
                        "statutConclusion": {"libelle": "rejetée"},
                    }
                },
            }
        ],
    )
    status, label = derive_status(actes)
    assert (status, label) == ("deposee", None)


# ---------------------------------------------------------------------------
# Totality — the property the prose version of the rules failed (ADR-035 §5)
# ---------------------------------------------------------------------------

# Every distinct statutConclusion.libelle observed across the 654 decision actes
# in the export, plus the None case. These are free text, not an enum, which is
# why the rules match on the first word rather than on equality.
OBSERVED_STATUT_LABELS = [
    None,
    "adoptée",
    "adopté",
    "modifiée",
    "modifié",
    "Accord",
    "Désaccord",
    "Conforme",
    "Conforme avec réserve",
    "Non conforme",
    "Partiellement conforme",
    "adoptée sans modification",
    "adopté sans modification",
    "adoptée avec modifications",
    "adopté avec modifications",
    "adoptée, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution",
    "adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution",
    "considérée comme définitive en application de l'article 151-7 du Règlement",
    "considéré comme adopté par l'Assemblée nationale en application de l'article 49, alinéa 3 de la Constitution",  # noqa: E501
    "considéré comme rejeté par l'Assemblée nationale en application de l'article 49, alinéa 3 de la Constitution",  # noqa: E501
    "rejeté",
    "rejetée",
    "rejet du texte par la commission préalable",
]

TOP_LEVEL_CODES = ["AN1", "SN1", "ANLUNI", "CMP", "PROM", "CC"]


def _synthetic(top_codes, statut_label, with_commission, with_decision):
    """One dossier's flattened actes, built from a combination of the shapes."""
    top = []
    for code in top_codes:
        children = []
        if with_commission:
            children.append(
                {
                    "uid": f"L17-{code}-COM",
                    "codeActe": f"{code}-COM",
                    "@xsi:type": "Etape_Type",
                    "dateActe": "2026-01-01",
                }
            )
        if with_decision:
            children.append(
                {
                    "uid": f"L17-{code}-DEC",
                    "codeActe": f"{code}-DEBATS-DEC",
                    "@xsi:type": "Decision_Type",
                    "dateActe": "2026-02-01",
                    "statutConclusion": {"libelle": statut_label},
                }
            )
        top.append(
            {
                "uid": f"L17-{code}-X",
                "codeActe": code,
                "@xsi:type": "Etape_Type",
                "dateActe": "2026-01-01",
                "actesLegislatifs": {"acteLegislatif": children} if children else None,
            }
        )
    return flatten_actes("DLR5L17N99999", top)


def test_status_rules_resolve_every_shape():
    """Rule 7 is a total fallback, so the rule set never leaves a dossier unresolved.

    This is the property the prose version of the rules failed: combinations of
    stage shape, commission presence, decision presence and free-text label all
    have to land on one of the seven values, with no "unknown".
    """
    combinations = itertools.product(
        [[], ["AN1"], ["AN1", "SN1"], ["ANLUNI"], ["AN1", "SN1", "CMP"], ["AN1", "PROM"], ["CC"]],
        OBSERVED_STATUT_LABELS,
        [False, True],
        [False, True],
    )
    seen = set()
    for top_codes, label, with_commission, with_decision in combinations:
        actes = _synthetic(top_codes, label, with_commission, with_decision)
        status, status_label = derive_status(actes)
        assert status in STATUS_VALUES, (top_codes, label, with_commission, with_decision)
        if with_decision and top_codes:
            assert status_label == label
        seen.add(status)
    # Not a coverage formality: a rule that can never fire is a rule that was
    # mis-ordered, which is exactly how rule 4 gets swallowed by rule 7.
    assert seen == set(STATUS_VALUES)


def test_empty_dossier_resolves_to_deposee():
    assert derive_status([]) == ("deposee", None)
