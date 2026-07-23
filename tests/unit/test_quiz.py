"""Unit tests for the vote-matching quiz endpoints (MON-137, ADR-025)."""

import pytest
from pydantic import ValidationError

from api.quiz_data import QUIZ_QUESTIONS, QUIZ_VERSION
from api.routers.quiz import (
    QuizMatchRequest,
    _strip_detail,
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


def test_get_questions_returns_versioned_set(client, mock_cursor):
    mock_cursor.fetchall.return_value = [
        {
            "vote_id": V1,
            "votes_for": 291,
            "votes_against": 241,
            "abstentions": 12,
            "result": "adopté",
            "voted_at": None,
        }
    ]
    resp = client.get("/quiz/questions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == QUIZ_VERSION
    assert body["count"] == 10
    first = body["questions"][0]
    assert first["vote_id"] == V1
    assert first["votes_for"] == 291
    assert first["votes_against"] == 241
    assert first["abstentions"] == 12
    assert first["result"] == "adopté"
    # A question whose vote_id has no matching row (defensive: shouldn't
    # happen per ADR-025, but the SELECT is a plain join, not a guarantee)
    # degrades gracefully instead of 500ing.
    second = body["questions"][1]
    assert second["votes_for"] is None
    assert second["result"] is None


def test_get_questions_formats_vote_date(client, mock_cursor):
    import datetime

    mock_cursor.fetchall.return_value = [
        {
            "vote_id": V1,
            "votes_for": 291,
            "votes_against": 241,
            "abstentions": 12,
            "result": "adopté",
            "voted_at": datetime.datetime(2026, 7, 15, 14, 30, tzinfo=datetime.timezone.utc),
        }
    ]
    resp = client.get("/quiz/questions")
    assert resp.json()["questions"][0]["vote_date"] == "2026-07-15"


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

    # Per-question breakdown (MON-181): populated only for the best match
    # (top[0]) and the opposite, in answered order, with a null position
    # where the deputy has no expressed row for that vote.
    assert [d["vote_id"] for d in top[0]["detail"]] == [V1, V2, V3]
    assert [d["deputy_position"] for d in top[0]["detail"]] == ["pour", "contre", "abstention"]
    assert top[1]["detail"] is None
    assert top[2]["detail"] is None
    assert [d["deputy_position"] for d in body["opposite"]["detail"]] == ["contre", "pour", None]

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


# ---------------------------------------------------------------------------
# Shares (MON-139, ADR-025)
# ---------------------------------------------------------------------------
SHARE_ID = "11111111-1111-1111-1111-111111111111"


def _stored_result():
    return {
        "version": QUIZ_VERSION,
        "answered": 3,
        "eligible_deputies": 1,
        "top_matches": [
            {
                "deputy_id": "A",
                "full_name": "Député A",
                "party": "Groupe X",
                "party_short": "X",
                "department": "Gironde",
                "photo_url": None,
                "agreement_pct": 100.0,
                "matches": 3,
                "compared": 3,
            }
        ],
        "opposite": None,
        "groups": [],
        "my_department": None,
    }


def test_share_recomputes_server_side_and_stores_snapshot(client, mock_cursor):
    import datetime

    # Positions drive the recomputation: A agrees 3/3, B 1/3.
    mock_cursor.fetchall.return_value = [
        _row("A", V1, "pour"),
        _row("A", V2, "contre"),
        _row("A", V3, "abstention"),
        _row("B", V1, "pour"),
        _row("B", V2, "pour"),
        _row("B", V3, "pour"),
    ]
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": _stored_result(),
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.post("/quiz/share", json={"answers": ANSWERS_3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == SHARE_ID
    assert body["share_url"].endswith(f"/quiz/s/{SHARE_ID}")
    assert body["result"]["top_matches"][0]["deputy_id"] == "A"

    # The INSERT carries the server-computed result, not anything client-sent:
    # A at 100% (3/3) ranked first, B at 33.3% (1/3) second.
    insert_call = mock_cursor.execute.call_args_list[-1]
    sql, params = insert_call.args
    assert "INSERT INTO quiz_shares" in sql
    stored = params[1].adapted  # psycopg2 Json wrapper
    assert stored["version"] == QUIZ_VERSION
    assert [m["deputy_id"] for m in stored["top_matches"]] == ["A", "B"]
    assert stored["top_matches"][0]["agreement_pct"] == 100.0
    assert stored["top_matches"][1]["agreement_pct"] == 33.3

    # MON-181: the share snapshot must carry no per-question detail — it
    # would pair the sharer's own answers with a deputy's positions, leaking
    # answers (forbidden by ADR-025 pending MON-179's opt-in revision).
    assert "detail" not in stored["top_matches"][0]
    assert "detail" not in stored["top_matches"][1]


def test_share_rejects_unknown_vote_id(client):
    resp = client.post(
        "/quiz/share",
        json={"answers": [{"vote_id": "VTFORGED", "position": "pour"}] * 3},
    )
    assert resp.status_code == 422


def test_share_insert_failure_returns_500(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    # First execute (positions SELECT) succeeds, the INSERT blows up.
    mock_cursor.execute.side_effect = [None, RuntimeError("db down")]
    resp = client.post("/quiz/share", json={"answers": ANSWERS_3})
    assert resp.status_code == 500


def test_get_share_returns_stored_snapshot(client, mock_cursor):
    import datetime

    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": _stored_result(),
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }
    resp = client.get(f"/quiz/share/{SHARE_ID}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"]["top_matches"][0]["full_name"] == "Député A"
    assert body["share_url"].endswith(f"/quiz/s/{SHARE_ID}")


def test_get_share_unknown_id_returns_404(client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    resp = client.get("/quiz/share/99999999-9999-9999-9999-999999999999")
    assert resp.status_code == 404


def test_get_share_malformed_id_returns_422(client):
    resp = client.get("/quiz/share/not-a-uuid")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Friend comparison — opt-in answer storage (MON-184, ADR-028)
# ---------------------------------------------------------------------------
def test_share_without_opt_in_omits_answers_key(client, mock_cursor):
    import datetime

    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": _stored_result(),
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.post("/quiz/share", json={"answers": ANSWERS_3})
    assert resp.status_code == 200

    insert_call = mock_cursor.execute.call_args_list[-1]
    _, params = insert_call.args
    stored = params[1].adapted
    assert "answers" not in stored

    body = resp.json()
    assert body["result"]["answers"] is None


def test_share_with_opt_in_stores_submitted_answers(client, mock_cursor):
    import datetime

    stored_result = _stored_result()
    stored_result["answers"] = ANSWERS_3
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": stored_result,
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.post("/quiz/share", json={"answers": ANSWERS_3, "include_answers": True})
    assert resp.status_code == 200

    insert_call = mock_cursor.execute.call_args_list[-1]
    _, params = insert_call.args
    stored = params[1].adapted
    assert stored["answers"] == ANSWERS_3

    body = resp.json()
    assert body["result"]["answers"] == ANSWERS_3


def test_share_opt_in_defaults_false_when_field_omitted():
    from api.routers.quiz import QuizShareRequest

    req = QuizShareRequest(answers=ANSWERS_3)
    assert req.include_answers is False


def test_get_share_returns_answers_when_present(client, mock_cursor):
    import datetime

    stored_result = _stored_result()
    stored_result["answers"] = ANSWERS_3
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": stored_result,
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }
    resp = client.get(f"/quiz/share/{SHARE_ID}")
    assert resp.status_code == 200
    assert resp.json()["result"]["answers"] == ANSWERS_3


# ---------------------------------------------------------------------------
# Per-question detail (MON-181)
# ---------------------------------------------------------------------------
def test_strip_detail_removes_key_everywhere():
    data = {
        "top_matches": [
            {"deputy_id": "A", "detail": [{"vote_id": V1, "deputy_position": "pour"}]},
            {"deputy_id": "B", "detail": None},
        ],
        "opposite": {"deputy_id": "D", "detail": [{"vote_id": V1, "deputy_position": "contre"}]},
        "my_department": {
            "code": "33",
            "name": "Gironde",
            "deputies": [
                {"deputy_id": "A", "detail": [{"vote_id": V1, "deputy_position": "pour"}]}
            ],
        },
    }
    stripped = _strip_detail(data)
    assert all("detail" not in m for m in stripped["top_matches"])
    assert "detail" not in stripped["opposite"]
    assert all("detail" not in m for m in stripped["my_department"]["deputies"])


def test_strip_detail_handles_no_opposite_or_department():
    data = {"top_matches": [], "opposite": None, "my_department": None}
    assert _strip_detail(data) == data
