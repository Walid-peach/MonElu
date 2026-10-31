"""
Amendment summaries come from the official text or do not exist (#630, ADR-043).

The titles and signatories below are real shapes from production and from
Amendements.json.zip. Matching is pinned hard because a wrong match publishes a
confident summary of a different amendment.
"""

from datetime import date
from unittest.mock import MagicMock

import pytest

from scripts._summaries import amendment_user_message, rejection_reason
from scripts.generate_vote_summaries import (
    check_duplicate_rate,
    process_batch,
    source_key,
)
from scripts.ingest_amendments import (
    MIN_VOTES_FOR_MATCH_RATE,
    check_amendment_yield,
    clean_html,
    match_amendment,
    parse_amendment,
    parse_title,
)


def amendment(number="1284", author="m. maudet", deposited="2026-10-01", decided="2026-10-05"):
    return {
        "uid": f"AM{number}{decided}",
        "number": number,
        "author": author,
        "deposited_on": deposited,
        "decided_on": decided,
    }


class TestParseTitle:
    @pytest.mark.parametrize(
        "title,number,author",
        [
            ("l'amendement n° 1284 de M. Maudet à l'article 7 du projet", "1284", "maudet"),
            ("l’amendement n° 1326 de M. Bloch à l’article 4 de la", "1326", "bloch"),
            ("le sous-amendement n° 70 de Mme Fiol à l'amendement n° 4", "70", "fiol"),
            ("l'amendement n° 248 (rect.) de M. Duplessy à l'article 3", "248", "duplessy"),
            ("l'amendement n° 993 (2e rect.) de Mme Maximi à l'article 15", "993", "maximi"),
            ("l'amendement n° 514  de Mme Fruchon à l'article 18 bis", "514", "fruchon"),
            ("l'amendement n° 14 du Gouvernement à l'article premier", "14", "gouvernement"),
            ("l'amendement n° 37 de Mme Martin (Alpes-Maritimes) et les", "37", "martin"),
            ("l'amendement n° 1 de M. Breton de suppression de l'article 7", "1", "breton"),
            ("l'amendement n° 25 Mme K/Bidi et les amendements identiques", "25", "k/bidi"),
            (
                "l'amendement n° 639 de M. Jean-Philippe Tanguy après l'article 3",
                "639",
                "jean-philippe tanguy",
            ),
        ],
    )
    def test_reads_number_and_first_author(self, title, number, author):
        assert parse_title(title) == (number, author)

    def test_not_an_amendment_title(self):
        assert parse_title("l'ensemble de la proposition de loi") is None


class TestMatchAmendment:
    def test_number_author_and_date_identify_one(self):
        wanted = amendment()
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), {"1284": [wanted]}) is wanted

    def test_same_number_on_another_author_is_no_match(self):
        index = {"1284": [amendment(author="mme sas")]}
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), index) is None

    def test_decided_on_another_day_is_no_match(self):
        index = {"1284": [amendment(decided="2026-01-05", deposited="2026-01-01")]}
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), index) is None

    def test_deposited_after_the_vote_is_no_match(self):
        index = {"1284": [amendment(deposited="2026-11-01", decided=None)]}
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), index) is None

    def test_decided_amendment_beats_an_undated_homonym(self):
        wanted = amendment()
        undated = amendment(deposited="2025-01-01", decided=None)
        index = {"1284": [undated, wanted]}
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), index) is wanted

    def test_two_certain_candidates_is_no_match(self):
        index = {"1284": [amendment(decided="2026-10-05"), amendment(decided="2026-10-06")]}
        assert match_amendment(("1284", "maudet"), date(2026, 10, 5), index) is None


class TestParseAmendment:
    def doc(self, **corps):
        return {
            "amendement": {
                "uid": "AM1",
                "identification": {"numeroLong": "I-3089 (Rect)", "prefixeOrganeExamen": "AN"},
                "signataires": {"libelle": "M.&#160;Juvin,  Mme&#160;Sas et M.&#160;Bloch"},
                "cycleDeVie": {
                    "dateDepot": "2026-10-01",
                    "dateSort": {"@xsi:nil": "true"},
                },
                "amendementParentRef": {"@xsi:nil": "true"},
                "corps": {"contenuAuteur": corps},
            }
        }

    def test_budget_prefix_and_first_signatory(self):
        parsed = parse_amendment(self.doc(dispositif="<p>Supprimer.</p>"))
        assert parsed["number"] == "3089"
        assert parsed["author"] == "m. juvin"
        assert parsed["decided_on"] is None
        assert parsed["is_sub_amendment"] is False

    def test_committee_amendment_is_skipped(self):
        doc = self.doc()
        doc["amendement"]["identification"]["prefixeOrganeExamen"] = "CION_FIN"
        assert parse_amendment(doc) is None

    def test_clean_html_keeps_words_apart(self):
        assert clean_html("<p>Un&nbsp;mot</p><p>&#x00E9;t&#x00E9;</p>") == "Un mot été"

    def test_a_nil_field_is_no_text(self):
        assert clean_html({"@xsi:nil": "true"}) is None


class TestRejectionReason:
    TITLE = "l'amendement n° 1403 de M. Sansu à l'article 8 du projet de loi de finances"

    def test_real_guess_is_refused(self):
        summary = "Modifier les recettes, probablement en changeant les dépenses de santé."
        assert rejection_reason(summary, self.TITLE) == "guess"

    def test_certaines_dispositions_is_refused(self):
        summary = "Introduire un examen prioritaire de certaines dispositions budgétaires."
        assert rejection_reason(summary, self.TITLE) == "guess"

    def test_text_as_subject_is_refused(self):
        summary = "Le texte propose une prise en charge intégrale des victimes de violences."
        assert rejection_reason(summary, self.TITLE) == "text_subject"

    def test_bare_paragraph_reference_is_refused(self):
        assert rejection_reason("Supprimer les alinéas 31 à 35.", self.TITLE) == "bare_reference"

    def test_restated_title_is_refused(self):
        summary = "L'amendement à l'article du projet de loi de finances."
        assert rejection_reason(summary, self.TITLE) == "restates_title"

    @pytest.mark.parametrize(
        "summary",
        [
            "Rendre obligatoire l'affichage du Nutri-Score sur les produits alimentaires.",
            "Soumettre les revenus de la participation aux cotisations sociales patronales.",
            "Supprimer l'extension de la déduction de cotisations patronales aux RTT rachetés.",
        ],
    )
    def test_the_target_summaries_pass(self, summary):
        assert rejection_reason(summary, self.TITLE) is None


class TestProcessBatch:
    def vote(self, vote_id="V1", dispositif="Rendre obligatoire le Nutri-Score."):
        return {
            "vote_id": vote_id,
            "vote_title": "l'amendement n° 1403 de M. Sansu à l'article 8",
            "result": "rejeté",
            "scrutin_kind": "amendement",
            "is_sub_amendment": False,
            "dispositif": dispositif,
            "expose_sommaire": "Cadeaux au patronat.",
        }

    def run(self, reply: str, votes: list[dict], stats: dict | None = None):
        client, conn = MagicMock(), MagicMock()
        message = client.chat.completions.create.return_value.choices[0].message
        message.content = reply
        stats = stats or {"generated": 0, "errors": 0}
        process_batch(client, votes, False, conn, stats)
        cursor = conn.cursor.return_value.__enter__.return_value
        return client, cursor, stats

    def test_the_model_reads_the_official_text(self, monkeypatch):
        monkeypatch.setattr("psycopg2.extras.execute_batch", lambda *_: None)
        client, _, _ = self.run(
            '{"summary": "Rendre le Nutri-Score obligatoire.", "theme": "Santé & Social"}',
            [self.vote()],
        )
        sent = client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        assert "Dispositif : Rendre obligatoire le Nutri-Score." in sent
        assert "l'amendement n° 1403" not in sent

    def test_a_guess_leaves_the_summary_empty(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda _c, _s, rows: calls.extend(rows)
        )
        _, _, stats = self.run(
            '{"summary": "Agir probablement sur les recettes de santé.", "theme": "Autre"}',
            [self.vote()],
        )
        assert calls == [(None, "Autre", "rejected", "V1")]
        assert stats["rejected"] == {"guess": 1}
        assert stats["generated"] == 0

    def test_two_texts_cannot_share_a_sentence(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda _c, _s, rows: calls.extend(rows)
        )
        reply = '{"summary": "Étendre la protection aux jeunes majeurs.", "theme": "Autre"}'
        self.run(reply, [self.vote("V1", "Texte A."), self.vote("V2", "Texte B.")])
        assert calls[0][0] is not None and calls[0][2] == "official_text"
        assert calls[1] == (None, "Autre", "rejected", "V2")

    def test_identical_texts_may_share_a_sentence(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda _c, _s, rows: calls.extend(rows)
        )
        reply = '{"summary": "Étendre la protection aux jeunes majeurs.", "theme": "Autre"}'
        self.run(reply, [self.vote("V1"), self.vote("V2")])
        assert [row[2] for row in calls] == ["official_text", "official_text"]

    def test_a_stored_sentence_counts_as_seen(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda _c, _s, rows: calls.extend(rows)
        )
        stats = {
            "generated": 0,
            "errors": 0,
            "seen_summaries": {"Étendre la protection des majeurs.": source_key("Autre texte.")},
        }
        reply = '{"summary": "Étendre la protection des majeurs.", "theme": "Autre"}'
        self.run(reply, [self.vote()], stats)
        assert calls[0][0] is None


def test_user_message_names_a_sub_amendment():
    message = amendment_user_message(
        {"is_sub_amendment": True, "dispositif": "Substituer.", "expose_sommaire": None}
    )
    assert message == "Type : Sous-amendement\nDispositif : Substituer."


class TestRunGuards:
    def test_many_duplicates_fail_the_run(self):
        with pytest.raises(SystemExit):
            check_duplicate_rate({"generated": 10, "rejected": {"duplicate": 5}})

    def test_a_few_duplicates_stay_green(self):
        check_duplicate_rate({"generated": 100, "rejected": {"duplicate": 5}})

    def test_empty_export_fails(self):
        with pytest.raises(SystemExit):
            check_amendment_yield(0, 0, 0, 0)

    def test_skip_rate_fails(self):
        with pytest.raises(SystemExit):
            check_amendment_yield(100, 6, 100, 100)

    def test_collapsed_match_rate_fails(self):
        with pytest.raises(SystemExit):
            check_amendment_yield(100, 0, 10, 100)

    def test_normal_unmatched_share_stays_green(self):
        check_amendment_yield(100, 0, 96, 100)

    def test_small_window_cannot_fail_on_match_rate(self):
        check_amendment_yield(100, 0, 0, MIN_VOTES_FOR_MATCH_RATE - 1)
