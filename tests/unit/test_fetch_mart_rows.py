"""Unit tests for `api.db.fetch_mart_rows` (#723): the savepoint around a mart read."""

from unittest.mock import MagicMock

import psycopg2.errors
import pytest

from api.db import fetch_mart_rows


def _statements(cur) -> list[str]:
    return [c.args[0] for c in cur.execute.call_args_list]


def test_rows_come_back_and_the_savepoint_is_released():
    cur = MagicMock()
    cur.fetchall.return_value = [{"deputy_id": "PA1"}]
    assert fetch_mart_rows(cur, "SELECT mart", {"x": 1}) == [{"deputy_id": "PA1"}]
    assert _statements(cur) == ["SAVEPOINT mart_read", "SELECT mart", "RELEASE SAVEPOINT mart_read"]
    assert cur.execute.call_args_list[1].args[1] == {"x": 1}


def test_an_absent_mart_rolls_back_to_the_savepoint_only():
    cur = MagicMock()
    cur.execute.side_effect = [None, psycopg2.errors.UndefinedTable(), None]
    assert fetch_mart_rows(cur, "SELECT mart") is None
    assert _statements(cur) == [
        "SAVEPOINT mart_read",
        "SELECT mart",
        "ROLLBACK TO SAVEPOINT mart_read",
    ]


def test_any_other_error_propagates():
    cur = MagicMock()
    cur.execute.side_effect = [None, psycopg2.errors.QueryCanceled()]
    with pytest.raises(psycopg2.errors.QueryCanceled):
        fetch_mart_rows(cur, "SELECT mart")
