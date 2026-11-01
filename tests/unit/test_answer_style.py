"""Chat answers keep no model formatting habits, on any client (#632)."""

import pytest

from rag.chain.rag_chain import clean_answer_style, style_violations


class TestCleanAnswerStyle:
    def test_citation_marker_becomes_plain_parentheses(self):
        answer = "La loi crée ce droit 【Vote du 27/06/2026 – article 10】."
        assert (
            clean_answer_style(answer) == "La loi crée ce droit (Vote du 27/06/2026 – article 10)."
        )

    def test_stray_marker_is_removed(self):
        assert clean_answer_style("Un texte】 coupé") == "Un texte coupé"

    def test_bold_is_removed(self):
        assert clean_answer_style("Un **droit à l'aide** et __volontaire__") == (
            "Un droit à l'aide et volontaire"
        )

    def test_plain_answer_is_untouched(self):
        answer = "Adopté par 120 voix (vote du 29 octobre 2026)."
        assert clean_answer_style(answer) == answer


class TestStyleViolations:
    def test_clean_answer_breaks_nothing(self):
        assert style_violations("Adopté par 120 voix (vote du 29 octobre 2026).") == []

    @pytest.mark.parametrize(
        "answer,rule",
        [
            ("Un droit 【Vote】", "citation_marker"),
            ("Un **droit**", "bold"),
            ("En résumé, la loi crée un cadre.", "recap"),
            ("Toutes ces dispositions sont contenues dans les résumés.", "closing_note"),
            ("Je ne dispose pas de cette information dans les sources fournies.", "closing_note"),
        ],
    )
    def test_each_habit_is_named(self, answer, rule):
        assert rule in style_violations(answer)
