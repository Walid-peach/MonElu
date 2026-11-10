import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from rag.pipeline.chunker import dept_preposition


def test_dept_preposition_plural():
    assert dept_preposition("Yvelines") == "des"
    assert dept_preposition("Bouches-du-Rhône") == "des"


def test_dept_preposition_vowel():
    assert dept_preposition("Essonne") == "de l'"
    assert dept_preposition("Aisne") == "de l'"


def test_dept_preposition_default():
    assert dept_preposition("Nord") == "du"
    assert dept_preposition("Gard") == "du"


def test_dept_preposition_empty():
    assert dept_preposition("") == "de"
    assert dept_preposition(None) == "de"


# --- #674: a departed deputy is never described as sitting -------------------

from datetime import date  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

from rag.pipeline import chunker  # noqa: E402
from rag.pipeline.chunk_notable_deputies import build_chunk  # noqa: E402
from rag.pipeline.chunker import deputy_identity  # noqa: E402


def test_deputy_identity_sitting():
    assert deputy_identity("Ada Martin", "Nord", "Écologiste") == (
        "Ada Martin est député(e) du Nord, membre du parti Écologiste."
    )


def test_deputy_identity_departed_uses_past_tense_and_end_date():
    sentence = deputy_identity("Ada Martin", "Essonne", "Écologiste", date(2026, 9, 30))
    assert sentence == (
        "Ada Martin a été député(e) de l'Essonne jusqu'au 30/09/2026, membre du parti Écologiste."
    )
    assert "est député" not in sentence


def _fake_conn(rows):
    cur = MagicMock()
    cur.fetchall.return_value = rows
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    return conn, cur


def _deputy_row(deputy_id, mandate_end):
    return {
        "deputy_id": deputy_id,
        "full_name": f"Député {deputy_id}",
        "party": "Écologiste",
        "department": "Nord",
        "mandate_end": mandate_end,
        "total_votes": 10,
        "pour_count": 6,
        "contre_count": 3,
        "abstention_count": 1,
        "presence_rate": 0.5,
    }


def test_chunk_deputies_writes_each_tense_and_end_date_metadata():
    conn, cur = _fake_conn([_deputy_row("PA1", None), _deputy_row("PA2", date(2026, 8, 4))])
    with patch.object(chunker, "_get_conn", return_value=conn):
        sitting, departed = chunker.chunk_deputies()

    assert "d.mandate_end" in cur.execute.call_args.args[0]
    assert sitting["content"].startswith("Député PA1 est député(e) du Nord,")
    assert sitting["metadata"]["mandate_end"] is None
    assert departed["content"].startswith("Député PA2 a été député(e) du Nord jusqu'au 04/08/2026,")
    assert departed["metadata"]["mandate_end"] == "2026-08-04"


def test_chunk_notable_deputies_writes_past_tense_for_closed_mandate():
    deputy_id = next(iter(chunker.NOTABLE_DEPUTIES))
    row = {
        "deputy_id": deputy_id,
        "full_name": "Ada Martin",
        "party": "Écologiste",
        "department": "Nord",
        "mandate_end": date(2026, 8, 4),
        "vote_id": "VTANR5L17V1",
        "vote_title": "l'ensemble du projet de loi",
        "voted_at": date(2026, 7, 1),
        "result": "adopté",
        "position": "pour",
        "key_category": None,
        "recent_rn": 1,
        "cat_rn": 1,
    }
    conn, cur = _fake_conn([row])
    with patch.object(chunker, "_get_conn", return_value=conn):
        chunks = chunker.chunk_notable_deputies()

    assert "d.mandate_end" in cur.execute.call_args.args[0]
    (chunk,) = chunks
    assert chunk["content"].startswith("Ada Martin a été député(e) du Nord jusqu'au 04/08/2026,")
    assert chunk["metadata"]["mandate_end"] == "2026-08-04"


def _notable(mandate_end):
    return {
        "deputy_id": "PA1",
        "full_name": "Ada Martin",
        "party": "Écologiste",
        "department": "Nord",
        "mandate_end": mandate_end,
        "total_votes": 10,
        "pour": 6,
        "contre": 3,
        "abstention": 1,
        "presence_pct": 50.0,
    }


def test_build_chunk_sitting_deputy_unchanged():
    content = build_chunk(_notable(None), [])
    first_line = content.splitlines()[0]
    assert first_line == "Ada Martin est député(e) du Nord, membre du parti Écologiste."


def test_build_chunk_departed_deputy_past_tense():
    content = build_chunk(_notable(date(2026, 9, 30)), [])
    assert content.splitlines()[0] == (
        "Ada Martin a été député(e) du Nord jusqu'au 30/09/2026, membre du parti Écologiste."
    )
