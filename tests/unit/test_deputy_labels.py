"""
Raw AN codes in deputies (#517): the département expansion, the label guard's
patterns, and the party_short backfill.
"""

import re
from unittest.mock import MagicMock

from api.departments_data import department_name
from api.groups_data import CANONICAL_SHORT_LABELS, GROUP_SLUGS
from scripts.update_party import (
    RAW_DEPARTMENT_PATTERN,
    RAW_ORGANE_PATTERN,
    normalize_party_short,
)


def test_department_name_expands_codes():
    assert department_name("33") == "Gironde"
    assert department_name("2a") == "Corse-du-Sud"
    assert department_name("974") == "La Réunion"
    assert department_name("099") == "Français établis hors de France"
    assert department_name("99") == "Français établis hors de France"


def test_department_name_keeps_an_unknown_code_for_the_guard():
    assert department_name("999") == "999"


def test_department_name_leaves_a_full_name_alone():
    assert department_name("Gironde") == "Gironde"


def test_raw_organe_pattern():
    assert re.search(RAW_ORGANE_PATTERN, "PO838901")
    for label in CANONICAL_SHORT_LABELS.values():
        assert not re.search(RAW_ORGANE_PATTERN, label)


def test_raw_department_pattern():
    for raw in ["099", "33", "2A", "2b", "974"]:
        assert re.search(RAW_DEPARTMENT_PATTERN, raw, re.IGNORECASE), raw
    for name in ["Gironde", "Corse-du-Sud", "Français établis hors de France"]:
        assert not re.search(RAW_DEPARTMENT_PATTERN, name, re.IGNORECASE), name


def test_every_group_has_a_short_label():
    assert set(GROUP_SLUGS.values()) == set(CANONICAL_SHORT_LABELS)


def test_normalize_party_short_writes_every_canonical_pair_and_clears_raw_uids(monkeypatch):
    batches = []
    monkeypatch.setattr(
        "scripts.update_party.psycopg2.extras.execute_batch",
        lambda cur, sql, rows, page_size: batches.append((sql, rows)),
    )
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    normalize_party_short(conn)
    ((batch_sql, rows),) = batches
    assert "WHERE party = %s AND party_short IS DISTINCT FROM %s" in batch_sql
    assert {(label, short) for short, label, _ in rows} == set(CANONICAL_SHORT_LABELS.items())
    sql = " ".join(call.args[0] for call in cur.execute.call_args_list)
    assert "party IS NULL AND party_short ~ %s" in sql
    assert cur.execute.call_args_list[-1].args[1] == (RAW_ORGANE_PATTERN,)
    conn.commit.assert_called_once()
