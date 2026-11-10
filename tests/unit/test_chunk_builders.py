"""The notable-deputy and law-summary chunk builders (#675).

Both run on every daily RAG rebuild (`index_manager.py`); these tests pin the
text they write and the ordering of the law-summary selection.
"""

from datetime import date
from unittest.mock import MagicMock, patch

from rag.pipeline import chunk_law_summaries
from rag.pipeline.chunk_law_summaries import build_law_chunk
from rag.pipeline.chunk_notable_deputies import build_chunk

DEPUTY = {
    "deputy_id": "PA1",
    "full_name": "Ada Martin",
    "party": "Écologiste",
    "department": "Nord",
    "mandate_end": None,
    "total_votes": 4,
    "pour": 1,
    "contre": 1,
    "abstention": 1,
    "presence_pct": 80.0,
}


def _vote(position, title="l'ensemble du projet de loi"):
    return {
        "vote_title": title,
        "voted_at": date(2026, 7, 1),
        "result": "adopté",
        "position": position,
    }


def test_build_chunk_lists_counts_presence_and_votes():
    content = build_chunk(DEPUTY, [_vote("pour")])
    lines = content.splitlines()
    assert lines[1] == "Sur 4 votes enregistrés : 1 pour, 1 contre, 1 abstentions."
    assert lines[2] == "Taux de présence : 80.0%."
    assert lines[-1] == "- 01/07/2026 : l'ensemble du projet de loi… → POUR (vote adopté)"


def test_build_chunk_labels_each_stored_position():
    positions = ["pour", "contre", "abstention", "nonVotant"]
    content = build_chunk(DEPUTY, [_vote(p) for p in positions])
    labels = [line.split("→ ")[1].split(" (")[0] for line in content.splitlines()[-4:]]
    # nonVotant is the stored spelling (scripts/ingest_positions.py); it must not
    # fall through to .upper() and print NONVOTANT.
    assert labels == ["POUR", "CONTRE", "ABSTENTION", "NON VOTANT"]


def test_build_chunk_truncates_long_titles():
    content = build_chunk(DEPUTY, [_vote("pour", title="x" * 200)])
    assert "x" * 80 + "…" in content
    assert "x" * 81 not in content


def test_build_law_chunk_formats_result_and_party_breakdown():
    vote = {
        "vote_title": "l'ensemble du projet de loi de finances",
        "voted_at": date(2026, 10, 21),
        "result": "rejeté",
        "votes_for": 200,
        "votes_against": 300,
        "abstentions": 10,
        "total_voters": 510,
    }
    breakdown = [
        {"party": "Rassemblement National", "pour": 0, "contre": 120, "abstention": 2},
        {"party": "Ensemble pour la République", "pour": 90, "contre": 0, "abstention": 1},
    ]
    assert build_law_chunk(vote, breakdown).splitlines() == [
        "Vote du 21/10/2026 : l'ensemble du projet de loi de finances",
        "Résultat : rejeté (200 pour, 300 contre, 10 abstentions sur 510 votants).",
        "",
        "Positions par groupe parlementaire :",
        "- Rassemblement National : 0 pour, 120 contre, 2 abstentions",
        "- Ensemble pour la République : 90 pour, 0 contre, 1 abstentions",
    ]


def test_get_top_votes_puts_missing_turnout_last():
    cur = MagicMock()
    cur.fetchall.return_value = []
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cur
    with patch.object(chunk_law_summaries.psycopg2, "connect", return_value=conn):
        assert chunk_law_summaries.get_top_votes(20) == []

    sql = " ".join(cur.execute.call_args.args[0].split())
    # total_voters is nullable and DESC sorts NULLs first in Postgres.
    assert "ORDER BY total_voters DESC NULLS LAST" in sql
    assert cur.execute.call_args.args[1] == (20,)
