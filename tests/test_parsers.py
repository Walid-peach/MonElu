"""
Tests for the AN ZIP parsers and the SQL router.

All pure-function tests — no mocks, no DB, no network.
Covers MON-55 (zero tests for parsers + sql_router) and MON-57 (real AN fixture).
"""

import json
from pathlib import Path

import pytest

from rag.chain.sql_router import detect_department, detect_intent, normalize_text
from scripts.ingest_positions import _votants, extract_positions
from scripts.ingest_votes import _to_int, parse_vote

FIXTURES = Path(__file__).parent / "fixtures"

# ---------------------------------------------------------------------------
# Load the real AN scrutin fixture (public data, anonymity-safe)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def scrutin():
    raw = json.loads((FIXTURES / "scrutin_sample.json").read_text())
    return raw["scrutin"]


# ---------------------------------------------------------------------------
# _to_int
# ---------------------------------------------------------------------------


def test_to_int_valid():
    assert _to_int("289") == 289
    assert _to_int(0) == 0


def test_to_int_none_and_invalid():
    assert _to_int(None) is None
    assert _to_int("n/a") is None
    assert _to_int("") is None


# ---------------------------------------------------------------------------
# parse_vote — real AN scrutin fixture
# ---------------------------------------------------------------------------


def test_parse_vote_happy_path(scrutin):
    result = parse_vote(scrutin)
    assert result is not None
    assert result["vote_id"] == "VTANR5L17V1"
    assert result["voted_at"] == "2024-07-16"
    assert "finances" in result["vote_title"].lower()
    assert result["result"] == "adopté"
    assert result["votes_for"] == 289
    assert result["votes_against"] == 240
    assert result["abstentions"] == 10
    assert result["total_voters"] == 539


def test_parse_vote_titre_dict():
    """titre can be a dict with #text key — must extract string."""
    item = {
        "uid": "VTANR5L17V2",
        "dateScrutin": "2024-09-01",
        "titre": {"#text": "Loi sur l'environnement"},
        "sort": {"code": "rejeté"},
        "syntheseVote": {
            "nombreVotants": "100",
            "decompte": {"pour": "40", "contre": "60", "abstentions": "0"},
        },
        "typeVote": {"codeTypeVote": "SFS"},
    }
    result = parse_vote(item)
    assert result is not None
    assert "environnement" in result["vote_title"].lower()
    assert result["result"] == "rejeté"


def test_parse_vote_missing_uid_returns_none():
    assert parse_vote({"dateScrutin": "2024-07-16", "titre": "X"}) is None


def test_parse_vote_empty_dict_returns_none():
    assert parse_vote({}) is None


# ---------------------------------------------------------------------------
# _votants — handles list, single dict, null
# ---------------------------------------------------------------------------


def test_votants_list():
    block = {"votant": [{"acteurRef": "PA1"}, {"acteurRef": "PA2"}]}
    assert _votants(block) == ["PA1", "PA2"]


def test_votants_single_dict():
    """Single voter arrives as a dict, not a list — the key AN quirk."""
    block = {"votant": {"acteurRef": "PA3"}}
    assert _votants(block) == ["PA3"]


def test_votants_null_block():
    assert _votants(None) == []
    assert _votants({}) == []
    assert _votants({"votant": None}) == []


# ---------------------------------------------------------------------------
# extract_positions — real AN scrutin fixture
# ---------------------------------------------------------------------------


def test_extract_positions_returns_all_deputies(scrutin):
    positions = extract_positions(scrutin)
    deputy_ids = {p["deputy_id"] for p in positions}
    # Fixture has PA1..PA6 across two groupes
    assert deputy_ids == {"PA1", "PA2", "PA3", "PA4", "PA5", "PA6"}


def test_extract_positions_correct_values(scrutin):
    positions = extract_positions(scrutin)
    by_id = {p["deputy_id"]: p["position"] for p in positions}
    assert by_id["PA1"] == "pour"
    assert by_id["PA2"] == "pour"
    assert by_id["PA3"] == "contre"
    assert by_id["PA4"] == "nonVotant"
    assert by_id["PA5"] == "contre"
    assert by_id["PA6"] == "abstention"


def test_extract_positions_vote_id_matches(scrutin):
    positions = extract_positions(scrutin)
    assert all(p["vote_id"] == "VTANR5L17V1" for p in positions)


def test_extract_positions_no_duplicates(scrutin):
    """Each deputy appears at most once per scrutin."""
    positions = extract_positions(scrutin)
    deputy_ids = [p["deputy_id"] for p in positions]
    assert len(deputy_ids) == len(set(deputy_ids))


def test_extract_positions_empty_scrutin():
    assert extract_positions({}) == []
    assert extract_positions({"uid": ""}) == []


# ---------------------------------------------------------------------------
# sql_router — detect_intent
# ---------------------------------------------------------------------------


def test_detect_intent_party_count():
    assert (
        detect_intent("Combien de députés dans chaque groupe parlementaire ?")
        == "deputy_count_by_party"
    )


def test_detect_intent_vote_total():
    assert detect_intent("Combien de votes au total depuis le début ?") == "vote_total_count"


def test_detect_intent_abstention_rate():
    assert (
        detect_intent("Quel groupe parlementaire a le plus d'abstentions ?")
        == "party_abstention_rate"
    )


def test_detect_intent_presence_rate():
    assert detect_intent("Quel est le taux de présence moyen par groupe ?") == "party_presence_rate"


def test_detect_intent_no_match():
    assert detect_intent("Quel est l'avis de Braun-Pivet sur le budget ?") is None
    assert detect_intent("Bonjour") is None


def test_detect_intent_notable_deputy_blocks_vote_count():
    """A vote-count question mentioning a notable deputy (Attal, Le Pen) bypasses routing."""
    assert detect_intent("Combien de votes au total pour Attal ?") is None


# ---------------------------------------------------------------------------
# sql_router — detect_department
# ---------------------------------------------------------------------------


def test_detect_department_known():
    assert detect_department("Combien de députés dans le Nord ?") == "Nord"


def test_detect_department_accented():
    assert detect_department("Qui représente les Yvelines ?") == "Yvelines"


def test_detect_department_unknown():
    assert detect_department("Combien de députés en France ?") is None


# ---------------------------------------------------------------------------
# sql_router — normalize_text
# ---------------------------------------------------------------------------


def test_normalize_text_apostrophes():
    assert normalize_text("val-d’oise") == "val-d'oise"


def test_normalize_text_whitespace():
    assert normalize_text("  combien   de  députés  ") == "combien de députés"
