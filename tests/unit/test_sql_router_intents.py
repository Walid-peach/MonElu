"""
Routing tests for the Phase 3 SQL router intents (rankings, temporal,
comparisons). Pure regex/extraction logic — no DB.

These encode the diagnostic battery's failures: every question below was
previously either answered wrong by RAG (extrapolating from 5 retrieved
chunks) or refused, although the answer is deterministic SQL.
"""

import datetime

from rag.chain.sql_router import detect_intent, extract_period, extract_top_n

# ---------------------------------------------------------------------------
# detect_intent — battery questions route to the right intent
# ---------------------------------------------------------------------------


def test_top_presence():
    q = "Quels sont les 5 députés avec le meilleur taux de présence ?"
    assert detect_intent(q) == "deputy_top_presence"


def test_bottom_presence():
    q = "Quels sont les 5 députés avec le pire taux de présence ?"
    assert detect_intent(q) == "deputy_bottom_presence"


def test_deputy_abstention_ranking_not_party_rate():
    q = "Quels sont les 3 députés qui s'abstiennent le plus ?"
    assert detect_intent(q) == "deputy_top_abstention"


def test_party_abstention_still_routes_to_party_rate():
    q = "Quel groupe s'abstient le plus ?"
    assert detect_intent(q) == "party_abstention_rate"


def test_most_contre():
    q = "Quel député a voté contre le plus souvent ?"
    assert detect_intent(q) == "deputy_most_contre"


def test_dissidents():
    q = "Quels députés du même parti votent différemment de leur groupe ?"
    assert detect_intent(q) == "deputy_dissidents"


def test_vote_latest():
    assert detect_intent("Quel est le dernier vote à l'Assemblée ?") == "vote_latest"


def test_vote_latest_yields_to_named_deputy():
    assert detect_intent("Quel est le dernier vote de Marine Le Pen ?") is None


def test_vote_first():
    assert detect_intent("Quel est le premier vote enregistré ?") == "vote_first"


def test_top_participation():
    q = "Quels sont les 5 votes avec le plus de participation ?"
    assert detect_intent(q) == "vote_top_participation"


def test_closest_vote():
    assert detect_intent("Quel est le vote le plus serré ?") == "vote_closest"


def test_votes_by_month():
    assert detect_intent("Combien de votes ont eu lieu en juin 2026 ?") == "votes_by_period"


def test_votes_this_week_not_latest():
    # "cette semaine" must win over any recency wording
    assert detect_intent("Quels votes ont été adoptés cette semaine ?") == "votes_by_period"


def test_party_position_totals():
    q = "Le RN vote-t-il plus souvent pour ou contre ?"
    assert detect_intent(q) == "party_position_totals"


def test_presence_comparison_routes_to_party_presence():
    q = "Quelle est la différence de présence entre le RN et LFI ?"
    assert detect_intent(q) == "party_presence_rate"


def test_recency_result_question_stays_rag():
    # recency+result questions are RAG's job (recency-sorted retrieval)
    assert detect_intent("Quels votes ont été rejetés récemment ?") is None


# ---------------------------------------------------------------------------
# extract_top_n
# ---------------------------------------------------------------------------


def test_top_n_from_les():
    assert extract_top_n("Quels sont les 3 députés qui s'abstiennent le plus ?") == 3


def test_top_n_default():
    assert extract_top_n("Quel député a voté contre le plus souvent ?") == 5


def test_top_n_capped():
    assert extract_top_n("les 99 députés les plus présents") == 20
    assert extract_top_n("top 15 des votes") == 15


# ---------------------------------------------------------------------------
# extract_period
# ---------------------------------------------------------------------------


def test_month_with_year():
    p = extract_period("Combien de votes ont eu lieu en juin 2026 ?")
    assert p["start"] == datetime.date(2026, 6, 1)
    assert p["end"] == datetime.date(2026, 7, 1)


def test_december_rolls_year():
    p = extract_period("Combien de votes en décembre 2025 ?")
    assert p["end"] == datetime.date(2026, 1, 1)


def test_this_week():
    p = extract_period("Quels votes ont été adoptés cette semaine ?")
    assert p["start"].weekday() == 0  # Monday
    assert p["label"] == "cette semaine"


def test_no_period_returns_none():
    assert extract_period("Combien de votes au total ?") is None


# ---------------------------------------------------------------------------
# detect_circonscription
# ---------------------------------------------------------------------------


def test_circonscription_detected():
    from rag.chain.sql_router import detect_circonscription

    q = "Qui est le député de la 1ère circonscription des Yvelines ?"
    assert detect_circonscription(q) == "1"
    assert detect_circonscription("le député de la 12e circonscription du Nord") == "12"


def test_circonscription_absent():
    from rag.chain.sql_router import detect_circonscription

    assert detect_circonscription("Qui sont les députés des Yvelines ?") is None
