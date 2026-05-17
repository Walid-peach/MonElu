"""Unit tests for the connection pool helpers in api/db.py."""

from unittest.mock import MagicMock, patch

import pytest

import api.db as _db
from api.db import get_conn


def test_get_conn_raises_when_pool_uninitialized():
    with patch.object(_db, "_pool", None):
        with pytest.raises(RuntimeError, match="not initialized"):
            with get_conn():
                pass


def test_get_conn_yields_connection_and_returns_it():
    conn = MagicMock()
    pool = MagicMock()
    pool.getconn.return_value = conn
    pool.closed = False

    with patch.object(_db, "_pool", pool):
        with get_conn() as c:
            assert c is conn

    pool.putconn.assert_called_once_with(conn, close=False)


def test_get_conn_rollback_and_return_on_exception():
    conn = MagicMock()
    pool = MagicMock()
    pool.getconn.return_value = conn
    pool.closed = False

    with patch.object(_db, "_pool", pool):
        with pytest.raises(ValueError):
            with get_conn():
                raise ValueError("boom")

    conn.rollback.assert_called_once()
    pool.putconn.assert_called_once_with(conn, close=False)


def test_get_conn_marks_connection_broken_when_rollback_fails():
    conn = MagicMock()
    conn.rollback.side_effect = Exception("rollback failed")
    pool = MagicMock()
    pool.getconn.return_value = conn
    pool.closed = False

    with patch.object(_db, "_pool", pool):
        with pytest.raises(ValueError):
            with get_conn():
                raise ValueError("query failed")

    # close=True signals the pool to discard the broken connection
    pool.putconn.assert_called_once_with(conn, close=True)
