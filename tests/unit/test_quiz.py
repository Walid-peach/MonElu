"""Unit tests for the vote-matching quiz endpoints (MON-137, ADR-025)."""

import pytest
from pydantic import ValidationError

from api.quiz_data import QUIZ_QUESTIONS, QUIZ_VERSION
from api.routers.quiz import (
    QuizMatchRequest,
    compute_group_alignment,
    eligibility_threshold,
)

V1, V2, V3 = (q["vote_id"] for q in QUIZ_QUESTIONS[:3])

ANSWERS_3 = [
    {"vote_id": V1, "position": "pour"},
    {"vote_id": V2, "position": "contre"},
    {"vote_id": V3, "position": "abstention"},
]


def _row(deputy_id, vote_id, position, party="Groupe X", name=None):
    return {
        "deputy_id": deputy_id,
        "vote_id": vote_id,
        "position": position,
        "full_name": name or f"Député {deputy_id}",
        "party": party,
        "party_short": party.split()[-1] if party else None,
        "department": "Gironde",
        "photo_url": None,
    }


# ---------------------------------------------------------------------------
# Question set + GET /quiz/questions
# ---------------------------------------------------------------------------
def test_question_set_shape():
    assert len(QUIZ_QUESTIONS) == 10
    ids = [q["vote_id"] for q in QUIZ_QUESTIONS]
    assert len(set(ids)) == len(ids)
    for q in QUIZ_QUESTIONS:
        assert q["question"].startswith("Auriez-vous voté")
        assert q["context"] and q["theme"]


def test_get_questions_returns_versioned_set(client):
    resp = client.get("/quiz/questions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == QUIZ_VERSION
    assert body["count"] == 10
    assert body["questions"][0]["vote_id"] == V1


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------
def test_match_request_rejects_too_few_answers():
    with pytest.raises(ValidationError):
        QuizMatchRequest(answers=ANSWERS_3[:2])


def test_match_request_rejects_unknown_vote_id():
    with pytest.raises(ValidationError, match="inconnu"):
        QuizMatchRequest(answers=ANSWERS_3[:2] + [{"vote_id": "VTFAKE", "position": "pour"}])


def test_match_request_rejects_duplicate_vote_id():
    with pytest.raises(ValidationError, match="double"):
        QuizMatchRequest(answers=ANSWERS_3[:2] + [{"vote_id": V1, "position": "contre"}])


def test_match_rejects_invalid_position(client):
    resp = client.post(
        "/quiz/match",
        json={"answers": ANSWERS_3[:2] + [{"vote_id": V3, "position": "nonVotant"}]},
    )
    assert resp.status_code == 422


def test_match_rejects_unknown_department(client, mock_cursor):
    resp = client.post("/quiz/match", json={"answers": ANSWERS_3, "department": "9999"})
    assert resp.status_code == 422
    mock_cursor.execute.assert_not_called()


# ---------------------------------------------------------------------------
# Matching math through the endpoint
# ---------------------------------------------------------------------------
def test_match_ranks_agreement_and_applies_threshold(client, mock_cursor):
    mock_cursor.fetchall.return_value = [
        # A agrees on all three answers
        _row("A", V1, "pour"),
        _row("A", V2, "contre"),
        _row("A", V3, "abstention"),
        # B agrees on two of three
        _row("B", V1, "pour"),
        _row("B", V2, "contre"),
        _row("B", V3, "pour"),
        # C has one comparable vote — below the threshold of 2, never ranked
        _row("C", V1, "pour", party="Groupe Y"),
        # D disagrees on both comparable votes
        _row("D", V1, "contre", party="Groupe Y"),
        _row("D", V2, "pour", party="Groupe Y"),
    ]

    resp = client.post("/quiz/match", json={"answers": ANSWERS_3})
    assert resp.status_code == 200
    body = resp.json()

    assert body["version"] == QUIZ_VERSION
    assert body["answered"] == 3
    assert body["eligible_deputies"] == 3

    top = body["top_matches"]
    assert [m["deputy_id"] for m in top] == ["A", "B", "D"]
    assert top[0]["agreement_pct"] == 100.0
    assert top[1]["agreement_pct"] == 66.7
    assert top[2]["agreement_pct"] == 0.0
    assert top[0]["compared"] == 3

    assert body["opposite"]["deputy_id"] == "D"

    # Groupe X: majority pour+contre match on V1/V2, V3 is a 1-1 tie (skipped).
    # Groupe Y: V1 ties, only V2 has a line — compared 1 < threshold, excluded.
    assert [g["party"] for g in body["groups"]] == ["Groupe X"]
    assert body["groups"][0]["agreement_pct"] == 100.0
    assert body["groups"][0]["compared"] == 2
    assert body["groups"][0]["deputy_count"] == 2


def test_match_department_roster_includes_absent_deputy(client, mock_cursor):
    positions = [
        _row("A", V1, "pour"),
        _row("A", V2, "contre"),
    ]
    roster = [
        {
            "deputy_id": "A",
            "full_name": "Député A",
            "party": "Groupe X",
            "party_short": "X",
            "department": "Gironde",
            "photo_url": None,
        },
        # E never voted on any quiz scrutin — still listed, with no percentage
        {
            "deputy_id": "E",
            "full_name": "Député E",
            "party": "Groupe X",
            "party_short": "X",
            "department": "Gironde",
            "photo_url": None,
        },
    ]
    mock_cursor.fetchall.side_effect = [positions, roster]

    resp = client.post("/quiz/match", json={"answers": ANSWERS_3, "department": "33"})
    assert resp.status_code == 200
    dept = resp.json()["my_department"]
    assert dept["code"] == "33"
    assert dept["name"] == "Gironde"
    by_id = {d["deputy_id"]: d for d in dept["deputies"]}
    assert by_id["A"]["agreement_pct"] == 100.0
    assert by_id["E"]["agreement_pct"] is None
    assert by_id["E"]["compared"] == 0


def test_match_no_positions_returns_empty_results(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    resp = client.post("/quiz/match", json={"answers": ANSWERS_3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["top_matches"] == []
    assert body["opposite"] is None
    assert body["groups"] == []
    assert body["eligible_deputies"] == 0


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------
def test_eligibility_threshold_floor_and_half():
    assert eligibility_threshold(3) == 2
    assert eligibility_threshold(4) == 2
    assert eligibility_threshold(7) == 4
    assert eligibility_threshold(10) == 5


def test_group_alignment_skips_tied_votes():
    rows = [
        _row("A", V1, "pour"),
        _row("B", V1, "contre"),  # 1-1 tie on V1 — no group line
        _row("A", V2, "contre"),
        _row("B", V2, "contre"),
        _row("A", V3, "abstention"),
        _row("B", V3, "abstention"),
    ]
    answers = {V1: "pour", V2: "contre", V3: "pour"}
    groups = compute_group_alignment(rows, answers, threshold=2)
    assert len(groups) == 1
    g = groups[0]
    assert g.compared == 2  # V1 skipped
    assert g.matches == 1  # V2 matches, V3 does not
    assert g.agreement_pct == 50.0


def test_group_alignment_ignores_deputies_without_party():
    rows = [_row("A", V1, "pour", party=None), _row("A", V2, "pour", party=None)]
    assert compute_group_alignment(rows, {V1: "pour", V2: "pour"}, threshold=2) == []
