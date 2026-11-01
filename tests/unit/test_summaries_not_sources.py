"""Generated summaries help retrieval and never count as evidence (#631)."""

import inspect
from unittest.mock import patch

from rag.chain.prompts import RAG_TEMPLATE
from rag.chain.verify import _fetch_candidates, _format_candidates
from rag.pipeline.chunker import READING_AID_LABEL, _reading_aid, chunk_votes


def vote(**fields):
    row = {
        "vote_id": "V1",
        "vote_title": "l'amendement n° 1 de M. Bloch",
        "result": "rejeté",
        "voted_at": None,
        "votes_for": 1,
        "votes_against": 2,
        "abstentions": 0,
        "total_voters": 3,
        "summary_plain": "Rendre le Nutri-Score obligatoire.",
        "summary_basis": "official_text",
        "scrutin_kind": "amendement",
        "theme": "Autre",
    }
    return {**row, **fields}


class TestChunks:
    def test_checked_amendment_summary_stays(self):
        assert _reading_aid(vote()) == "Rendre le Nutri-Score obligatoire."

    def test_title_only_amendment_summary_is_dropped(self):
        assert _reading_aid(vote(summary_basis=None)) is None

    def test_other_vote_kinds_keep_their_summary(self):
        row = vote(scrutin_kind="ensemble", summary_basis=None)
        assert _reading_aid(row) == "Rendre le Nutri-Score obligatoire."

    def test_summary_is_labelled_in_the_chunk(self):
        with patch("rag.pipeline.chunker._get_conn") as get_conn:
            cursor = get_conn.return_value.cursor.return_value.__enter__.return_value
            cursor.fetchall.return_value = [vote()]
            chunk = chunk_votes()[0]
        assert f"{READING_AID_LABEL} : Rendre" in chunk["content"]
        assert "\nRésumé :" not in chunk["content"]


def test_chat_is_told_the_label_is_no_source():
    assert "Aide à la lecture" in READING_AID_LABEL
    assert "« Aide à la lecture »" in RAG_TEMPLATE
    assert "n'est pas une source" in RAG_TEMPLATE


class TestVerify:
    """A verdict cannot rest on a summary: the model never receives one."""

    def test_candidate_text_holds_no_summary(self):
        candidate = {
            "vote_id": "V1",
            "title": "Titre officiel",
            "voted_at": "2026-10-29",
            "result": "adopté",
            "summary_plain": "Résumé généré.",
            "deputy_position": None,
        }
        assert "Résumé généré" not in _format_candidates([candidate], None)

    def test_candidate_query_reads_no_summary(self):
        assert "summary_plain" not in inspect.getsource(_fetch_candidates)
