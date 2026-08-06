"""
Tests for department code expansion in parse_deputy() (MON-219): the raw AN
code ("75", "2A") must be expanded to its full name at insert time instead of
depending on the separate, non-critical update_party.py step to do it later.
"""

from scripts.ingest_deputies import parse_deputy


def _deputy_item(department_code: str | None) -> dict:
    election = (
        {"lieu": {"numDepartement": department_code, "numCirco": "1"}} if department_code else {}
    )
    return {
        "uid": {"#text": "PA1"},
        "etatCivil": {"ident": {"prenom": "Jean", "nom": "Dupont"}},
        "mandats": {
            "mandat": {
                "typeOrgane": "ASSEMBLEE",
                "dateDebut": "2024-07-07T00:00:00",
                "election": election,
            }
        },
    }


class TestDepartmentExpansion:
    def test_two_digit_code_expands_to_full_name(self):
        record = parse_deputy(_deputy_item("75"))
        assert record["department"] == "Paris"

    def test_corsican_code_expands_to_full_name(self):
        record = parse_deputy(_deputy_item("2A"))
        assert record["department"] == "Corse-du-Sud"

    def test_overseas_code_expands_to_full_name(self):
        record = parse_deputy(_deputy_item("974"))
        assert record["department"] == "La Réunion"

    def test_unknown_code_falls_back_to_raw_code(self):
        record = parse_deputy(_deputy_item("999"))
        assert record["department"] == "999"

    def test_missing_department_is_none(self):
        record = parse_deputy(_deputy_item(None))
        assert record["department"] is None
