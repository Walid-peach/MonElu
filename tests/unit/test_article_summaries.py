"""
Article summaries come from the official text or do not exist (#642, ADR-044).

The titles and HTML below are real shapes from production and from the AN's
published texts. Matching is pinned hard because a wrong match publishes a
confident summary of a different article.
"""

import json
import subprocess
import sys
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from rag.pipeline.chunker import _reading_aid
from scripts._summaries import article_user_message, rejection_reason
from scripts.generate_vote_summaries import SQL_PENDING, SQL_PENDING_ROWS, process_batch
from scripts.ingest_articles import (
    MIN_VOTES_FOR_YIELD,
    bill_key,
    check_article_yield,
    find_article,
    parse_articles,
    parse_document,
    parse_title,
    read_texts,
)

PAGE = """
<p class="assnat5ChapitreNum0">Chapitre II</p>
<p class="assnat9ArticleNum">Article 1<sup>er</sup> A (nouveau)</p>
<p class="assnatLoiTexte">Le code civil est complété par une disposition assez longue.</p>
<p class="assnat9ArticleNum">Article 1<span>&#xa0;er</span></p>
<p class="assnatLoiTexte"><img src="data:image/png;base64,AAAA" />I.&#xa0;– Le titre:</p>
<p class="assnatLoiTexte">1° Le délai de prescription est porté à vingt ans pour ce délit.</p>
<p class="assnat9ArticleNum">Article 3 bis (nouveau)</p>
<p class="assnatLoiTexte">(Supprimé)</p>
<p class="assnat9ArticleNum">Articles 4 et 5</p>
<p class="assnatLoiTexte">(Conformes)</p>
<p class="assnat5ChapitreNum0">Chapitre III</p>
<p class="assnatLoiTexte">Un paragraphe hors de tout article, qui ne doit jamais être rattaché.</p>
"""


class TestParseTitle:
    @pytest.mark.parametrize(
        "title,article,bill",
        [
            (
                "l'article 19 de la proposition de loi apportant une réponse (première lecture).",
                "19",
                "proposition de loi apportant une reponse",
            ),
            ("l’article premier du projet de loi sur l'eau (première lecture).", "1", None),
            ("l'article 1er AA de la proposition de loi relative au sport.", "1 AA", None),
            ("l'article 32 bis de la proposition de loi x (nouvelle lecture).", "32 bis", None),
            ("l'article 4 bis A du projet de loi x (première lecture).", "4 bis A", None),
            ("l'article 5 terdecies du projet de loi x (première lecture).", "5 terdecies", None),
            (
                "l'article 55 (examen prioritaire) du projet de loi de finances pour 2027.",
                "55",
                None,
            ),
            ("l'article 48 et État A du projet de loi de finances pour 2026.", "48", None),
            ("l'article premier et rapport annexé du projet de loi x.", "1", None),
            (
                "l'article unique de la proposition de résolution européenne visant x.",
                "unique",
                None,
            ),
        ],
    )
    def test_reads_the_article_and_the_bill(self, title, article, bill):
        parsed = parse_title(title)
        assert parsed[0] == article
        if bill:
            assert parsed[1] == bill

    def test_a_trailing_note_is_not_part_of_the_bill(self):
        title = "l'article 2 de la proposition de loi relative x (seconde délibération) (lecture)."
        assert parse_title(title)[1] == "proposition de loi relative x"

    def test_not_an_article_title(self):
        assert parse_title("l'ensemble de la proposition de loi") is None


class TestBills:
    @pytest.mark.parametrize(
        "denomination,title,expected",
        [
            ("Projet de loi", "de finances pour 2026", "projet de loi de finances pour 2026"),
            (
                "Projet de loi",
                "Projet de loi de finances de finances pour 2026",
                "projet de loi de finances pour 2026",
            ),
            (
                "Projet de loi",
                "de financement de la sécurité sociale de financement de la sécurité sociale",
                "projet de loi de financement de la securite sociale",
            ),
        ],
    )
    def test_a_document_names_its_bill_as_a_scrutin_does(self, denomination, title, expected):
        assert bill_key(denomination, title) == expected

    @pytest.mark.parametrize(
        "uid,kept",
        [
            ("PIONANR5L17BTC3190", True),
            ("PRJLANR5L17B1906", True),
            ("PIONANR5L17BTA0180", False),
            ("PRJLANR5L17TAP0227", False),
            ("PIONSNR5S499B0045", False),
        ],
    )
    def test_keeps_only_the_texts_the_assembly_examined(self, uid, kept):
        doc = {
            "uid": uid,
            "denominationStructurelle": "Proposition de loi",
            "titres": {"titrePrincipal": "visant x"},
            "cycleDeVie": {"chrono": {"dateDepot": "2026-09-23T00:00:00.000+02:00"}},
        }
        assert (parse_document(doc) is not None) is kept

    def test_reads_the_export_newest_first(self):
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for uid, day in (
                ("PIONANR5L17B0001", "2026-01-01"),
                ("PIONANR5L17BTC0002", "2026-02-01"),
            ):
                doc = {
                    "document": {
                        "uid": uid,
                        "denominationStructurelle": "Proposition de loi",
                        "titres": {"titrePrincipal": "visant x"},
                        "cycleDeVie": {"chrono": {"dateDepot": f"{day}T00:00:00.000+02:00"}},
                    }
                }
                archive.writestr(f"json/document/{uid}.json", json.dumps(doc))
            archive.writestr("json/dossierParlementaire/DLR.json", "{}")
        index = read_texts(buffer.getvalue())
        assert [t["uid"] for t in index["proposition de loi visant x"]] == [
            "PIONANR5L17BTC0002",
            "PIONANR5L17B0001",
        ]


class TestParseArticles:
    def test_finds_each_article_under_one_spelling(self):
        articles = parse_articles(PAGE)
        assert set(articles) == {"1 A", "1", "3 bis"}
        assert "délai de prescription" in " ".join(articles["1"]["body"])

    def test_stops_at_the_next_heading_and_drops_images(self):
        body = " ".join(parse_articles(PAGE)["1"]["body"])
        assert "base64" not in body
        assert "hors de tout article" not in body

    def test_an_unstructured_bill_has_no_articles(self):
        assert parse_articles('<p class="assnatFPFprojetloiartexte">Texte</p>') == {}


class TestFindArticle:
    INDEX = {
        "bill": [
            {"uid": "NEW", "published_on": "2026-06-01"},
            {"uid": "COM", "published_on": "2026-03-01"},
            {"uid": "OLD", "published_on": "2026-01-01"},
        ]
    }
    LONG = {"label": "Article 1", "body": ["x" * 80]}

    def find(self, pages, voted_on=date(2026, 4, 1), article="1"):
        return find_article(article, "bill", voted_on, self.INDEX, lambda uid: pages.get(uid, {}))

    def test_a_text_published_after_the_vote_was_not_the_one_voted(self):
        found = self.find({"NEW": {"1": self.LONG}, "COM": {"1": self.LONG}})
        assert found[0] == "COM"

    def test_an_article_absent_from_a_text_is_looked_for_in_the_previous_one(self):
        assert self.find({"COM": {"2": self.LONG}, "OLD": {"1": self.LONG}})[0] == "OLD"

    def test_a_deleted_article_gets_no_source_from_an_older_reading(self):
        deleted = {"label": "Article 1", "body": ["(Supprimé)"]}
        assert self.find({"COM": {"1": deleted}, "OLD": {"1": self.LONG}}) is None

    def test_an_unknown_bill_has_no_source(self):
        assert find_article("1", "other", date(2026, 4, 1), self.INDEX, lambda uid: {}) is None


class TestYield:
    def test_an_empty_export_fails(self):
        with pytest.raises(SystemExit):
            check_article_yield(0, 0, 0)

    def test_no_text_for_a_full_window_fails(self):
        with pytest.raises(SystemExit):
            check_article_yield(10, 0, MIN_VOTES_FOR_YIELD)

    def test_a_window_of_mostly_budget_votes_passes(self):
        check_article_yield(10, 1, 100)

    def test_a_small_window_proves_nothing(self):
        check_article_yield(10, 0, MIN_VOTES_FOR_YIELD - 1)


class TestGuards:
    @pytest.mark.parametrize(
        "summary",
        [
            "Le texte vise à renforcer la prévention des violences.",
            "Ce texte vise à réformer les bourses sur critères sociaux.",
            "La proposition de loi renforce la protection des victimes.",
            "Ce projet de loi modifie le code pénal en profondeur.",
        ],
    )
    def test_refuses_a_summary_of_the_whole_bill(self, summary):
        assert rejection_reason(summary, "l'article 19 du projet") == "text_subject"

    def test_refuses_a_guess(self):
        assert rejection_reason("Modifier probablement le délai.", "titre") == "guess"

    def test_accepts_what_the_article_does(self):
        summary = "Allonger à vingt ans le délai de prescription de ce délit."
        assert rejection_reason(summary, "l'article 19 du projet de loi") is None


def article_vote(**overrides):
    vote = {
        "vote_id": "V1",
        "vote_title": "l'article 19 du projet de loi",
        "result": "adopté",
        "scrutin_kind": "article",
        "article_label": "Article 19",
        "article_text": "Le délai de prescription est porté à vingt ans pour ce délit.",
    }
    return {**vote, **overrides}


def run_batch(reply: str, vote: dict):
    client = MagicMock()
    client.chat.completions.create.return_value.choices[0].message.content = reply
    conn = MagicMock()
    stats = {"generated": 0, "errors": 0}
    process_batch(client, [vote], False, conn, stats)
    return client, conn.cursor.return_value.__enter__.return_value, stats


class TestGeneration:
    def test_the_model_reads_the_article_not_the_title(self, monkeypatch):
        written = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda cur, sql, rows: written.extend(rows)
        )
        reply = '{"summary": "Allonger à vingt ans la prescription.", "theme": "Autre"}'
        client, _, stats = run_batch(reply, article_vote())
        user = client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        assert user == article_user_message(article_vote())
        assert "projet de loi" not in user
        assert written[0][2] == "official_text"
        assert stats["generated"] == 1

    def test_a_refused_summary_stays_empty_and_is_not_retried(self, monkeypatch):
        written = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda cur, sql, rows: written.extend(rows)
        )
        reply = '{"summary": "Le texte renforce la prévention.", "theme": "Autre"}'
        _, _, stats = run_batch(reply, article_vote())
        assert written[0][0] is None and written[0][2] == "rejected"
        assert stats["rejected"] == {"text_subject": 1}

    def test_a_declined_summary_is_not_an_error_retried_every_day(self, monkeypatch):
        written = []
        monkeypatch.setattr(
            "psycopg2.extras.execute_batch", lambda cur, sql, rows: written.extend(rows)
        )
        _, _, stats = run_batch('{"summary": "", "theme": "Autre"}', article_vote())
        assert stats["errors"] == 0
        assert stats["rejected"] == {"declined": 1}
        assert written[0][0] is None and written[0][2] == "rejected"

    def test_a_vote_with_no_source_row_is_never_pending(self):
        assert "v.scrutin_kind = 'article' AND art.vote_id IS NOT NULL" in SQL_PENDING

    def test_articles_go_before_the_amendment_backlog(self):
        assert SQL_PENDING_ROWS.index("'article' DESC") < SQL_PENDING_ROWS.index("v.voted_at DESC")


class TestChunker:
    def test_a_title_only_article_summary_stays_out_of_the_index(self):
        row = {"scrutin_kind": "article", "summary_plain": "Ancien.", "summary_basis": None}
        assert _reading_aid(row) is None

    def test_a_checked_article_summary_is_indexed(self):
        row = {
            "scrutin_kind": "article",
            "summary_plain": "Vérifié.",
            "summary_basis": "official_text",
        }
        assert _reading_aid(row) == "Vérifié."


def test_the_script_runs_as_a_plain_file():
    """The workflows run it by path, where only the fallback import applies (#630)."""
    probe = "import ingest_articles as m; m.download_with_retry, m.connect_with_retry"
    scripts = Path(__file__).parents[2] / "scripts"
    subprocess.run([sys.executable, "-c", probe], cwd=scripts, check=True, capture_output=True)
