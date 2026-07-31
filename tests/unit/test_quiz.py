"""Unit tests for the vote-matching quiz endpoints (MON-137, ADR-025)."""

import pytest
from pydantic import ValidationError

from api.quiz_data import QUIZ_QUESTIONS, QUIZ_VERSION
from api.routers.quiz import (
    QuizDeputyMatch,
    QuizMatchRequest,
    _strip_detail,
    compute_group_alignment,
    compute_theme_summary,
    eligibility_threshold,
    ranking_score,
    select_opposite,
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
# GET /quiz/weekly — selection rule (MON-185)
# ---------------------------------------------------------------------------
import datetime as _dt  # noqa: E402

from api.routers.quiz import (  # noqa: E402
    build_weekly_question,
    is_divisive_vote,
    is_whole_text_vote,
    select_weekly_vote,
    week_start,
)

NOT_QUIZ_ID = "VTANR5L17V9999"
assert NOT_QUIZ_ID not in {q["vote_id"] for q in QUIZ_QUESTIONS}


def _weekly_row(
    vote_id=NOT_QUIZ_ID,
    vote_title="l'ensemble du projet de loi relatif à un sujet quelconque",
    summary_plain="Ce texte prévoit une réforme du sujet en question.",
    votes_for=300,
    votes_against=200,
    total_voters=500,
    voted_at=_dt.datetime(2026, 7, 10, 10, 0, tzinfo=_dt.timezone.utc),
    result="adopté",
    abstentions=0,
):
    return {
        "vote_id": vote_id,
        "vote_title": vote_title,
        "summary_plain": summary_plain,
        "votes_for": votes_for,
        "votes_against": votes_against,
        "total_voters": total_voters,
        "voted_at": voted_at,
        "result": result,
        "abstentions": abstentions,
    }


def test_is_whole_text_vote_accepts_straight_and_curly_apostrophe():
    assert is_whole_text_vote("l'ensemble du projet de loi X")
    assert is_whole_text_vote("l’ensemble du projet de loi X")
    assert is_whole_text_vote("L'ENSEMBLE DU PROJET DE LOI X")


def test_is_whole_text_vote_rejects_amendment_titles():
    assert not is_whole_text_vote("l'amendement n°42 à l'article 3")
    assert not is_whole_text_vote("l'article 3 du projet de loi X")


def test_is_divisive_vote_threshold():
    # minority share exactly 35% qualifies
    assert is_divisive_vote(65, 35)
    assert not is_divisive_vote(70, 30)
    assert not is_divisive_vote(0, 0)
    assert not is_divisive_vote(None, 40)
    assert not is_divisive_vote(40, None)


def test_select_weekly_vote_enforces_participation_threshold():
    low_turnout = _weekly_row(total_voters=399)
    ok = _weekly_row(vote_id="VTANR5L17V8888", total_voters=400)
    assert select_weekly_vote([low_turnout, ok])["vote_id"] == ok["vote_id"]


def test_select_weekly_vote_enforces_divisiveness_threshold():
    lopsided = _weekly_row(votes_for=550, votes_against=10)
    ok = _weekly_row(vote_id="VTANR5L17V8888", votes_for=300, votes_against=200)
    assert select_weekly_vote([lopsided, ok])["vote_id"] == ok["vote_id"]


def test_select_weekly_vote_enforces_whole_text_pattern():
    amendment = _weekly_row(vote_title="l'amendement n°12 au projet de loi X")
    ok = _weekly_row(vote_id="VTANR5L17V8888", vote_title="l'ensemble du projet de loi X")
    assert select_weekly_vote([amendment, ok])["vote_id"] == ok["vote_id"]


def test_select_weekly_vote_excludes_quiz_set_ids():
    from_quiz_set = _weekly_row(vote_id=QUIZ_QUESTIONS[0]["vote_id"])
    ok = _weekly_row(vote_id="VTANR5L17V8888")
    assert select_weekly_vote([from_quiz_set, ok])["vote_id"] == ok["vote_id"]


def test_select_weekly_vote_returns_none_when_nothing_qualifies():
    assert select_weekly_vote([_weekly_row(total_voters=100)]) is None
    assert select_weekly_vote([]) is None


def test_select_weekly_vote_picks_latest_qualifying_first():
    older = _weekly_row(
        vote_id="VTANR5L17V1111", voted_at=_dt.datetime(2026, 6, 1, tzinfo=_dt.timezone.utc)
    )
    newer = _weekly_row(
        vote_id="VTANR5L17V2222", voted_at=_dt.datetime(2026, 7, 1, tzinfo=_dt.timezone.utc)
    )
    # Candidates arrive latest-first (matches the SQL ORDER BY voted_at DESC) —
    # selection just returns the first qualifying row, doesn't re-sort.
    assert select_weekly_vote([newer, older])["vote_id"] == "VTANR5L17V2222"


def test_week_start_is_the_monday_of_the_iso_week():
    # 2026-07-23 is a Thursday
    thursday = _dt.date(2026, 7, 23)
    monday = _dt.date(2026, 7, 20)
    assert week_start(thursday) == monday
    # Every day of the same ISO week resolves to the same Monday — this is
    # what makes /quiz/weekly deterministic for all visitors within a week.
    for offset in range(7):
        assert week_start(monday + _dt.timedelta(days=offset)) == monday


def test_build_weekly_question_uses_summary_plain():
    q = build_weekly_question("Ce texte prévoit une réforme.", "Titre officiel du scrutin")
    assert q == "Auriez-vous voté pour ou contre : Ce texte prévoit une réforme ?"


def test_build_weekly_question_falls_back_to_title():
    q = build_weekly_question(None, "l'ensemble du projet de loi X")
    assert q == "Auriez-vous voté pour ou contre : l'ensemble du projet de loi X ?"


def test_get_weekly_returns_qualifying_scrutin(client, mock_cursor):
    mock_cursor.fetchall.return_value = [_weekly_row()]
    resp = client.get("/quiz/weekly")
    assert resp.status_code == 200
    body = resp.json()
    assert body["vote_id"] == NOT_QUIZ_ID
    assert body["question"].startswith("Auriez-vous voté")
    assert body["votes_for"] == 300
    assert body["vote_date"] == "2026-07-10"


def test_get_weekly_404_when_no_scrutin_qualifies(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    resp = client.get("/quiz/weekly")
    assert resp.status_code == 404


def test_get_weekly_never_returns_a_curated_quiz_question(client, mock_cursor):
    mock_cursor.fetchall.return_value = [_weekly_row(vote_id=QUIZ_QUESTIONS[0]["vote_id"])]
    resp = client.get("/quiz/weekly")
    assert resp.status_code == 404


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


def test_ranking_score_prefers_coverage_at_equal_or_higher_raw_rate():
    # 9/10 (90%) outranks 5/5 (100%) — more evidence at a slightly lower raw
    # rate beats the eligibility floor's worth of evidence at a perfect rate.
    assert ranking_score(9, 10) > ranking_score(5, 5)
    # Same raw rate (100%), more comparisons still ranks higher.
    assert ranking_score(10, 10) > ranking_score(5, 5)


def test_match_prefers_higher_coverage_over_higher_raw_percentage(client, mock_cursor):
    """MON-172: a 5/5 (100%) deputy must not outrank a 9/10 (90%) deputy."""
    vote_ids = [q["vote_id"] for q in QUIZ_QUESTIONS]
    answers = [{"vote_id": vid, "position": "pour"} for vid in vote_ids]

    rows = [_row("LOW", vid, "pour") for vid in vote_ids[:5]]
    rows += [_row("HIGH", vid, "pour") for vid in vote_ids[:9]]
    rows.append(_row("HIGH", vote_ids[9], "contre"))
    mock_cursor.fetchall.return_value = rows

    resp = client.post("/quiz/match", json={"answers": answers})
    assert resp.status_code == 200
    body = resp.json()

    top = body["top_matches"]
    assert [m["deputy_id"] for m in top] == ["HIGH", "LOW"]

    by_id = {m["deputy_id"]: m for m in top}
    # Displayed percentages are still the raw, unadjusted ratios.
    assert by_id["LOW"]["agreement_pct"] == 100.0
    assert by_id["HIGH"]["agreement_pct"] == 90.0


def _entry(deputy_id, matches, compared, name):
    return {
        "deputy_id": deputy_id,
        "full_name": name,
        "party": None,
        "party_short": None,
        "department": None,
        "photo_url": None,
        "matches": matches,
        "compared": compared,
    }


def test_select_opposite_tiebreak_is_deterministic_by_name():
    """MON-177: equal-ratio ties break on full_name, not dict/DB row order."""
    # Z and A tie on ranking_score and compared — Z appears first in
    # `eligible`, which would win the old insertion-order tiebreak.
    eligible = [
        _entry("Z", 1, 3, "Zoé Martin"),
        _entry("A", 1, 3, "Amir Ben"),
    ]
    top_matches = [QuizDeputyMatch(deputy_id="BEST", matches=3, compared=3)]

    opposite = select_opposite(eligible, top_matches)
    assert opposite["deputy_id"] == "A"


def test_select_opposite_omitted_when_it_equals_top_match():
    """MON-177: with a single eligible deputy, opposite must not echo top_matches[0]."""
    eligible = [_entry("A", 3, 3, "Amélie Roux")]
    top_matches = [QuizDeputyMatch(deputy_id="A", matches=3, compared=3)]

    assert select_opposite(eligible, top_matches) is None


def test_select_opposite_returns_none_for_empty_eligible():
    assert select_opposite([], []) is None


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
    assert body["focus"] is None


# ---------------------------------------------------------------------------
# focus_deputy_id (MON-183 — personalized deputy-page quiz entry)
# ---------------------------------------------------------------------------
def test_match_with_focus_deputy_below_threshold_returned_anyway(client, mock_cursor):
    # C has only one comparable vote — below the ranking threshold of 2, so
    # it never appears in top_matches, but a focus request still wants it.
    mock_cursor.fetchall.return_value = [
        _row("A", V1, "pour"),
        _row("A", V2, "contre"),
        _row("A", V3, "abstention"),
        _row("C", V1, "pour", party="Groupe Y"),
    ]
    mock_cursor.fetchone.return_value = {
        "deputy_id": "C",
        "full_name": "Député C",
        "party": "Groupe Y",
        "party_short": "Y",
        "department": "Gironde",
        "photo_url": None,
    }

    resp = client.post("/quiz/match", json={"answers": ANSWERS_3, "focus_deputy_id": "C"})
    assert resp.status_code == 200
    body = resp.json()
    assert "C" not in [m["deputy_id"] for m in body["top_matches"]]
    assert body["focus"]["deputy_id"] == "C"
    assert body["focus"]["compared"] == 1
    assert body["focus"]["matches"] == 1
    assert body["focus"]["agreement_pct"] == 100.0


def test_match_with_focus_deputy_absent_from_scrutins_returns_zero_counts(client, mock_cursor):
    mock_cursor.fetchall.return_value = [
        _row("A", V1, "pour"),
        _row("A", V2, "contre"),
        _row("A", V3, "abstention"),
    ]
    mock_cursor.fetchone.return_value = {
        "deputy_id": "Z",
        "full_name": "Député Z",
        "party": "Groupe Y",
        "party_short": "Y",
        "department": "Gironde",
        "photo_url": None,
    }

    resp = client.post("/quiz/match", json={"answers": ANSWERS_3, "focus_deputy_id": "Z"})
    assert resp.status_code == 200
    focus = resp.json()["focus"]
    assert focus["deputy_id"] == "Z"
    assert focus["compared"] == 0
    assert focus["matches"] == 0
    assert focus["agreement_pct"] is None


def test_match_with_unknown_focus_deputy_returns_422(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = None
    resp = client.post("/quiz/match", json={"answers": ANSWERS_3, "focus_deputy_id": "GHOST"})
    assert resp.status_code == 422


def test_match_without_focus_deputy_id_omits_focus(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    resp = client.post("/quiz/match", json={"answers": ANSWERS_3})
    assert resp.status_code == 200
    assert resp.json()["focus"] is None
    mock_cursor.fetchone.assert_not_called()


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


# ---------------------------------------------------------------------------
# Theme summary — the share card's centre block (MON-203)
# ---------------------------------------------------------------------------
def test_theme_summary_splits_pour_and_contre_and_drops_abstentions():
    themes = {q["vote_id"]: q["theme"] for q in QUIZ_QUESTIONS}
    summary = compute_theme_summary({V1: "pour", V2: "contre", V3: "abstention"})

    assert summary.supported == [themes[V1]]
    assert summary.opposed == [themes[V2]]
    assert themes[V3] not in summary.supported + summary.opposed


def test_theme_summary_follows_question_set_order_not_answer_order():
    first, second = QUIZ_QUESTIONS[0], QUIZ_QUESTIONS[1]
    # Answered in reverse; the summary must still read in curated order.
    summary = compute_theme_summary({second["vote_id"]: "pour", first["vote_id"]: "pour"})
    assert summary.supported == [first["theme"], second["theme"]]


def test_theme_summary_empty_when_everything_abstained():
    summary = compute_theme_summary({V1: "abstention", V2: "abstention"})
    assert summary.supported == []
    assert summary.opposed == []


def test_match_returns_theme_summary(client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    resp = client.post("/quiz/match", json={"answers": ANSWERS_3})

    assert resp.status_code == 200
    themes = resp.json()["themes"]
    assert themes["supported"] == [QUIZ_QUESTIONS[0]["theme"]]
    assert themes["opposed"] == [QUIZ_QUESTIONS[1]["theme"]]


def test_share_without_opt_in_strips_themes(client, mock_cursor):
    """Naming the themes voted pour/contre re-encodes the answers 1:1 — it must
    not reach a snapshot whose author declined to publish them (ADR-028)."""
    import datetime

    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": _stored_result(),
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.post("/quiz/share", json={"answers": ANSWERS_3})
    assert resp.status_code == 200

    _, params = mock_cursor.execute.call_args_list[-1].args
    assert "themes" not in params[1].adapted


def test_share_with_opt_in_stores_themes(client, mock_cursor):
    import datetime

    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": _stored_result(),
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.post("/quiz/share", json={"answers": ANSWERS_3, "include_answers": True})
    assert resp.status_code == 200

    _, params = mock_cursor.execute.call_args_list[-1].args
    assert params[1].adapted["themes"]["supported"] == [QUIZ_QUESTIONS[0]["theme"]]


def test_get_share_tolerates_snapshot_stored_before_themes_existed(client, mock_cursor):
    """Pre-MON-203 snapshots have no "themes" key — they must still deserialize."""
    import datetime

    legacy = _stored_result()
    assert "themes" not in legacy
    mock_cursor.fetchone.return_value = {
        "id": SHARE_ID,
        "result": legacy,
        "created_at": datetime.datetime(2026, 7, 18, tzinfo=datetime.timezone.utc),
    }

    resp = client.get(f"/quiz/share/{SHARE_ID}")
    assert resp.status_code == 200
    assert resp.json()["result"]["themes"] is None
