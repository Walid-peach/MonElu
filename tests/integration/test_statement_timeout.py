"""
The public pool's statement timeout against a real Postgres (#720).

`get_conn()` must cancel a query that runs past the timeout through any pooler,
so the timeout is set with `SET LOCAL` at the start of each transaction rather
than as a startup option or a session `SET`. Only a live server can show the
query is really cancelled and the setting really ends with its transaction.
"""

from __future__ import annotations

import psycopg2
import psycopg2.errors
import psycopg2.extensions
import pytest

import api.db as _db

pytestmark = pytest.mark.integration


@pytest.fixture
def public_pool(monkeypatch):
    monkeypatch.setattr(_db, "_STATEMENT_TIMEOUT", "200ms")
    previous = _db._pool
    _db.init_pool(minconn=1, maxconn=1)
    try:
        yield _db._pool
    finally:
        _db.close_pool()
        _db._pool = previous


def test_query_past_the_timeout_is_cancelled(public_pool):
    with pytest.raises(psycopg2.errors.QueryCanceled):
        with _db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_sleep(2)")


def test_timeout_applies_again_after_a_rollback_and_a_commit(public_pool):
    with _db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW statement_timeout")
            assert cur.fetchone()["statement_timeout"] == "200ms"
        conn.rollback()
        with conn.cursor() as cur:
            cur.execute("SHOW statement_timeout")
            assert cur.fetchone()["statement_timeout"] == "200ms"
        conn.commit()
        with pytest.raises(psycopg2.errors.QueryCanceled):
            with conn.cursor() as cur:
                cur.execute("SELECT pg_sleep(2)")
        conn.rollback()


def test_timeout_ends_with_its_transaction(public_pool):
    with _db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_backend_pid() AS pid")
            backend = cur.fetchone()["pid"]
    with _db.get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extensions.cursor) as cur:
            cur.execute("SELECT pg_backend_pid(), current_setting('statement_timeout')")
            pid, timeout = cur.fetchone()
        conn.rollback()
    assert pid == backend
    assert timeout != "200ms"


def test_autocommit_is_refused(public_pool):
    with pytest.raises(RuntimeError):
        with _db.get_conn() as conn:
            conn.autocommit = True
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            finally:
                conn.autocommit = False


def test_named_cursor_is_timed(public_pool):
    with pytest.raises(psycopg2.errors.QueryCanceled):
        with _db.get_conn() as conn:
            with conn.cursor(name="slow") as cur:
                cur.execute("SELECT pg_sleep(2)")
                cur.fetchall()


def test_executemany_is_timed(public_pool):
    with pytest.raises(psycopg2.errors.QueryCanceled):
        with _db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.executemany("SELECT pg_sleep(%s)", [(2,)])
