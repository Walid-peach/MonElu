"""
Unit tests for api/routers/lois.py (#369, ADR-035) - no database.

The acte/scrutin binding is the one piece of logic the SQL does not do, so it
is pinned here against the parcours shapes it has to survive: several actes on
one date, a Sénat step sharing the AN decision's day, and a vote no acte
precedes. The HTTP-level 404 and 503 paths run against a mocked cursor.
"""

import re
from datetime import date, datetime, timezone

import psycopg2.errors
import pytest
from fastapi import HTTPException

from api.routers import lois
from api.routers.lois import (
    _BINDABLE_ACTE_PATTERN,
    COLLAPSED_KINDS,
    DOSSIER_STATUSES,
    SCRUTIN_COVERAGE_START,
    _require_known_status,
    bind_scrutin,
    lois_url,
)
from api.routers.votes import _dossier_ref
from scripts.ingest_dossiers import STATUS_VALUES


def _acte(acte_uid: str, code_acte: str, date_acte, ordinal: int) -> dict:
    """A row as SQL_ACTES returns it, with `bindable` computed the way the SQL does."""
    return {
        "acte_uid": acte_uid,
        "code_acte": code_acte,
        "date_acte": date_acte,
        "ordinal": ordinal,
        "bindable": date_acte is not None and re.match(_BINDABLE_ACTE_PATTERN, code_acte),
    }


# The Fin de vie nouvelle lecture, trimmed: two séances on 2026-06-22, the
# decision on 2026-06-30, then the Sénat's deposit and saisie on that same day.
PARCOURS = [
    _acte("AN1-DEPOT", "AN1-DEPOT", date(2025, 3, 11), 1),
    _acte("ANNLEC", "ANNLEC", None, 108),
    _acte("SEANCE-A", "ANNLEC-DEBATS-SEANCE", date(2026, 6, 22), 121),
    _acte("SEANCE-B", "ANNLEC-DEBATS-SEANCE", date(2026, 6, 22), 122),
    _acte("SEANCE-C", "ANNLEC-DEBATS-SEANCE", date(2026, 6, 30), 132),
    _acte("DEC", "ANNLEC-DEBATS-DEC", date(2026, 6, 30), 133),
    _acte("SN-DEPOT", "SNNLEC-DEPOT", date(2026, 6, 30), 135),
    _acte("SN-SAISIE", "SNNLEC-COM-FOND-SAISIE", date(2026, 6, 30), 138),
    _acte("CMP-AN-DEC", "CMP-DEBATS-AN-DEC", date(2026, 7, 10), 140),
]


def test_status_values_match_ingestion():
    """The API filters on exactly the seven values ADR-035 §5 derives."""
    assert DOSSIER_STATUSES == STATUS_VALUES


def test_collapsed_kinds_are_the_adr_035_pair():
    assert set(COLLAPSED_KINDS) == {"amendement", "article"}


@pytest.mark.parametrize(
    "code_acte, bindable",
    [
        ("AN1-DEBATS-SEANCE", True),
        ("AN1-DEBATS-DEC", True),
        ("AN2-DEBATS-DEC", True),
        ("ANNLEC-DEBATS-SEANCE", True),
        ("ANLDEF-DEBATS-DEC", True),
        ("ANLUNI-DEBATS-SEANCE", True),
        ("AN21-DEBATS-SEANCE", True),
        ("CMP-DEBATS-AN-SEANCE", True),
        ("CMP-DEBATS-AN-DEC", True),
        # Grouping nodes, Sénat steps and non-séance AN steps never bind.
        ("AN1-DEBATS", False),
        ("AN1-DEPOT", False),
        ("AN1-COM-FOND-REUNION", False),
        ("SN1-DEBATS-DEC", False),
        ("SNNLEC-DEBATS-SEANCE", False),
        ("CMP-DEBATS-SN-DEC", False),
        ("CMP-DEC", False),
        ("PROM-PUB", False),
    ],
)
def test_bindable_acte_pattern(code_acte, bindable):
    assert bool(re.match(_BINDABLE_ACTE_PATTERN, code_acte)) is bindable


def test_vote_on_the_whole_text_lands_on_the_decision_not_the_senat_step():
    """2026-06-30 carries an AN séance, the AN decision and two Sénat actes.

    A date-only rule would pick the Sénat saisie (highest ordinal that day).
    """
    assert bind_scrutin(date(2026, 6, 30), PARCOURS) == "DEC"


def test_several_seances_on_one_day_bind_to_the_last():
    assert bind_scrutin(date(2026, 6, 22), PARCOURS) == "SEANCE-B"


def test_vote_between_actes_binds_to_the_latest_preceding_one():
    assert bind_scrutin(date(2026, 6, 25), PARCOURS) == "SEANCE-B"


def test_cmp_reading_at_the_an_is_bindable():
    assert bind_scrutin(date(2026, 7, 10), PARCOURS) == "CMP-AN-DEC"


def test_vote_before_any_an_seance_is_unattached():
    assert bind_scrutin(date(2025, 3, 11), PARCOURS) is None


def test_undated_vote_is_unattached():
    assert bind_scrutin(None, PARCOURS) is None


def test_timestamp_votes_bind_on_their_date():
    voted_at = datetime(2026, 6, 30, 18, 45, tzinfo=timezone.utc)
    assert bind_scrutin(voted_at, PARCOURS) == "DEC"


def test_coverage_start_is_the_march_2026_cutover():
    assert SCRUTIN_COVERAGE_START == date(2026, 3, 26)


def test_unknown_status_filter_is_rejected():
    with pytest.raises(HTTPException) as exc:
        _require_known_status("adoptee")
    assert exc.value.status_code == 422
    _require_known_status(None)
    _require_known_status("en_navette")


def test_lois_url_follows_the_frontend_origin(monkeypatch):
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://monelu.fr/")
    assert lois_url("DLR5L17N51670") == "https://monelu.fr/lois/DLR5L17N51670"


# ---------------------------------------------------------------------------
# GET /votes/{vote_id}'s dossier block
# ---------------------------------------------------------------------------


def test_vote_dossier_block_with_a_page(monkeypatch):
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://monelu.fr")
    ref = _dossier_ref(
        "DLR5L17N51670",
        {
            "dossier_uid": "DLR5L17N51670",
            "titre": "Fin de vie",
            "status": "promulguee",
            "has_scrutins": True,
        },
    )
    assert ref.lois_url == "https://monelu.fr/lois/DLR5L17N51670"
    assert ref.titre == "Fin de vie"


def test_vote_dossier_block_without_a_page():
    ref = _dossier_ref(
        "DLR5L17N1",
        {"dossier_uid": "DLR5L17N1", "titre": "T", "status": "deposee", "has_scrutins": False},
    )
    assert ref.lois_url is None
    assert ref.status == "deposee"


def test_vote_dossier_block_for_a_legislature_16_ref():
    """No dossiers row at all: the uid survives, nothing else is invented."""
    ref = _dossier_ref("DLR5L16N49263", None)
    assert ref.dossier_uid == "DLR5L16N49263"
    assert ref.titre is None
    assert ref.lois_url is None


# ---------------------------------------------------------------------------
# HTTP paths over a mocked cursor
# ---------------------------------------------------------------------------


def test_unknown_dossier_is_404(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert client.get("/lois/DLR5L17N0").status_code == 404
    assert client.get("/lois/DLR5L17N0/amendements").status_code == 404


def test_missing_mart_is_503(client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "dossier_uid": "DLR5L17N51670",
        "titre": "Fin de vie",
        "procedure_label": None,
        "initiateur": None,
        "status": "promulguee",
        "status_label": "adoptée",
        "current_stage": "PROM",
        "parcours_start": date(2025, 3, 11),
        "parcours_end": date(2026, 8, 18),
    }
    mock_cursor.fetchall.side_effect = [
        [],  # actes
        [],  # collapsed scrutins
        psycopg2.errors.UndefinedTable("mart missing"),
    ]
    assert client.get("/lois/DLR5L17N51670").status_code == 503


def test_list_rejects_an_unknown_status(client, mock_cursor):
    assert client.get("/lois?status=adoptee").status_code == 422
    mock_cursor.execute.assert_not_called()


def test_router_is_mounted_under_lois():
    paths = {route.path for route in lois.router.routes}
    assert paths == {"", "/{dossier_uid}", "/{dossier_uid}/amendements"}
