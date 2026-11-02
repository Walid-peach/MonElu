"""Whole-text and motion summaries: official text, fixed sentence, or none (#645, ADR-046)."""

import subprocess
import sys
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scripts._summaries import motion_summary, parse_theme
from scripts.generate_vote_summaries import SQL_CLEAR_TITLE_ONLY, SQL_PENDING, process_batch
from scripts.ingest_bills import (
    MAX_BILL_CHARS,
    build_bill_text,
    check_bill_yield,
    find_bill,
    parse_title,
)

BODY = "Le délai de prescription de ce délit est porté à vingt ans après la majorité de la victime."
ROOT = Path(__file__).parents[2]


class TestParseTitle:
    @pytest.mark.parametrize(
        "title, bill",
        [
            (
                "l'ensemble de la proposition de loi visant à créer un parcours (1re lecture).",
                "proposition de loi visant a creer un parcours",
            ),
            (
                "l'ensemble du projet de loi sur la justice (texte de la CMP).",
                "projet de loi sur la justice",
            ),
            (
                "la proposition de loi organique sur le Conseil.",
                "proposition de loi organique sur le conseil",
            ),
            ("le projet de loi autorisant l'accord.", "projet de loi autorisant l accord"),
        ],
    )
    def test_reads_the_bill(self, title, bill):
        assert parse_title(title) == bill

    @pytest.mark.parametrize(
        "title",
        [
            "la demande de suspension de séance présentée par M. Pribetich (article 58).",
            "la proposition du Gouvernement de prolonger la séance en cours au-delà de minuit.",
            "la déclaration du Gouvernement portant sur la stratégie de défense nationale.",
            "la première partie du projet de loi de finances pour 2026 (première lecture).",
        ],
    )
    def test_a_vote_on_no_whole_text_has_no_bill(self, title):
        assert parse_title(title) is None


class TestBuildBillText:
    def test_keeps_only_articles_with_content(self):
        articles = {
            "1": {"label": "Article 1er", "body": [BODY]},
            "2": {"label": "Article 2", "body": ["(Supprimé)"]},
        }
        assert build_bill_text(articles) == f"Article 1er : {BODY}"

    def test_a_long_bill_is_read_past_its_first_articles(self):
        articles = {str(n): {"label": f"Article {n}", "body": ["x" * 9000]} for n in range(1, 11)}
        text = build_bill_text(articles)
        assert "Article 10 :" in text
        assert len(text) <= MAX_BILL_CHARS + 200

    def test_a_bill_with_no_content_has_no_text(self):
        assert build_bill_text({}) is None


class TestFindBill:
    index = {
        "b": [
            {"uid": "NEW", "published_on": "2026-03-01"},
            {"uid": "OLD", "published_on": "2026-01-01"},
        ]
    }
    articles = {"1": {"label": "Article 1er", "body": [BODY]}}

    def test_the_newest_text_before_the_vote_wins(self):
        found = find_bill("b", date(2026, 2, 1), self.index, lambda uid: self.articles)
        assert found[0] == "OLD"

    def test_an_unstructured_newest_text_is_not_replaced_by_an_older_reading(self):
        def load(uid):
            return self.articles if uid == "OLD" else {}

        assert find_bill("b", date(2026, 4, 1), self.index, load) is None

    def test_an_unknown_bill_has_no_source(self):
        assert find_bill("c", date(2026, 4, 1), self.index, lambda uid: {}) is None


class TestYield:
    def test_an_empty_export_fails(self):
        with pytest.raises(SystemExit):
            check_bill_yield(0, 0, 0)

    def test_no_text_for_a_full_window_fails(self):
        with pytest.raises(SystemExit):
            check_bill_yield(10, 0, 30)

    def test_a_small_window_proves_nothing(self):
        check_bill_yield(10, 0, 3)


class TestMotionSummary:
    @pytest.mark.parametrize(
        "title",
        [
            "la motion de censure déposée par Mme Le Pen et 57 députés.",
            "la motion de rejet préalable, déposée par Mme Panot, du projet de loi.",
            "la motion de rejet péalable, déposée par M. Vallaud, du projet de loi.",
            "la motion de renvoi en commission du projet de loi.",
        ],
    )
    @pytest.mark.parametrize("result", ["adopté", "rejeté"])
    def test_every_known_motion_has_a_sentence_for_each_result(self, title, result):
        assert result[:6] in motion_summary(title, result)

    def test_never_reads_the_motion_as_the_bill(self):
        title = "la motion de rejet préalable du projet de loi sur la justice."
        assert "justice" not in motion_summary(title, "rejeté")

    def test_an_unknown_type_or_result_has_no_sentence(self):
        assert motion_summary("la motion référendaire", "adopté") is None
        assert motion_summary("la motion de censure", None) is None


def run_batch(row, reply=None):
    client = MagicMock()
    client.chat.completions.create.return_value.choices[0].message.content = reply
    conn = MagicMock()
    stats = {"generated": 0, "errors": 0}
    written = []
    with patch("psycopg2.extras.execute_batch", lambda cur, sql, rows: written.extend(rows)):
        process_batch(client, [row], False, conn, stats)
    return client, written, stats


def vote(**overrides):
    base = {
        "vote_id": "V1",
        "vote_title": "l'ensemble du projet de loi relatif à la justice (première lecture).",
        "result": "adopté",
        "scrutin_kind": "ensemble",
        "theme": None,
        "summary_basis": None,
        "bill_text": None,
    }
    return {**base, **overrides}


class TestGeneration:
    def test_the_model_reads_the_articles_not_the_title(self):
        reply = '{"summary": "Allonger à vingt ans la prescription.", "theme": "Autre"}'
        client, written, stats = run_batch(vote(bill_text=BODY), reply)
        user = client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        assert user == BODY
        assert written[0][:3] == ("Allonger à vingt ans la prescription.", "Autre", "official_text")
        assert stats["generated"] == 1

    def test_a_refused_bill_summary_stays_empty(self):
        reply = '{"summary": "Le texte renforce probablement la justice.", "theme": "Autre"}'
        _, written, _ = run_batch(vote(bill_text=BODY), reply)
        assert written[0][0] is None and written[0][2] == "rejected"

    def test_no_source_asks_only_for_a_theme(self):
        client, written, _ = run_batch(vote(), '{"theme": "Justice & Sécurité"}')
        system = client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        assert "N'écris aucun résumé" in system
        assert written[0] == (None, "Justice & Sécurité", None, "V1")

    def test_a_refused_bill_still_gets_a_theme_without_a_retry(self):
        row = vote(bill_text=BODY, summary_basis="rejected")
        client, written, _ = run_batch(row, '{"theme": "Autre"}')
        system = client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
        assert "N'écris aucun résumé" in system
        assert written[0] == (None, "Autre", "rejected", "V1")

    def test_a_motion_needs_no_llm_call_once_it_has_a_theme(self):
        title = "la motion de censure déposée par Mme Le Pen."
        row = vote(vote_title=title, scrutin_kind="motion", result="rejeté", theme="Institutions")
        client, written, _ = run_batch(row)
        client.chat.completions.create.assert_not_called()
        assert written[0][2] == "procedure"
        assert "reste en place" in written[0][0]

    def test_an_unknown_motion_is_not_retried_forever(self):
        row = vote(vote_title="la motion référendaire", scrutin_kind="motion", theme="Autre")
        client, written, _ = run_batch(row)
        client.chat.completions.create.assert_not_called()
        assert written[0][0] is None and written[0][2] == "rejected"

    def test_a_failed_theme_call_is_an_error_and_writes_nothing(self):
        _, written, stats = run_batch(vote(), "pas de json")
        assert written == [] and stats["errors"] == 1


class TestSql:
    def test_a_whole_text_vote_with_no_source_is_pending_only_for_its_theme(self):
        assert "b.vote_id IS NOT NULL" in SQL_PENDING
        assert "v.theme IS NULL" in SQL_PENDING
        assert "AND v.summary_plain IS NULL)" not in SQL_PENDING

    def test_clearing_keeps_themes_checked_summaries_and_other_kinds(self):
        assert "SET summary_plain = NULL\n" in SQL_CLEAR_TITLE_ONLY
        assert "summary_basis IS NULL" in SQL_CLEAR_TITLE_ONLY
        assert "'amendement'" in SQL_CLEAR_TITLE_ONLY and "'article'" in SQL_CLEAR_TITLE_ONLY


def test_parse_theme():
    assert parse_theme('{"theme": "Agriculture"}') == "Agriculture"
    assert parse_theme('{"theme": "Cuisine"}') == "Autre"
    assert parse_theme("rien") is None


def test_the_script_runs_as_a_plain_file():
    done = subprocess.run(
        [sys.executable, "scripts/ingest_bills.py", "--help"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert done.returncode == 0, done.stderr
