"""
Integration tests for POST /install-events' SQL (#598).

Runs the real increment against a live Postgres: the ON CONFLICT counter, the
Paris-date day and the event CHECK are invisible to a mocked cursor.
"""

import psycopg2
import pytest

from api.routers.install_events import INSTALL_EVENTS, PLATFORMS, SQL_INCREMENT


@pytest.fixture
def _clean_counts(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM install_event_counts")
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM install_event_counts")


def _counts(cur) -> list[dict]:
    cur.execute(
        "SELECT day, event, platform, count, "
        "(now() AT TIME ZONE 'Europe/Paris')::date AS paris_today "
        "FROM install_event_counts ORDER BY event, platform"
    )
    return cur.fetchall()


@pytest.mark.integration
def test_each_call_adds_one_to_todays_row(db_conn, _clean_counts):
    with db_conn.cursor() as cur:
        for _ in range(3):
            cur.execute(SQL_INCREMENT, {"event": "standalone_visit", "platform": "android"})
        cur.execute(SQL_INCREMENT, {"event": "standalone_visit", "platform": "ios"})
        cur.execute(SQL_INCREMENT, {"event": "app_installed", "platform": "android"})
        rows = _counts(cur)

    assert [(r["event"], r["platform"], r["count"]) for r in rows] == [
        ("app_installed", "android", 1),
        ("standalone_visit", "android", 3),
        ("standalone_visit", "ios", 1),
    ]
    assert all(r["day"] == r["paris_today"] for r in rows)


@pytest.mark.integration
def test_every_api_event_is_allowed_by_the_table(db_conn, _clean_counts):
    with db_conn.cursor() as cur:
        for event in INSTALL_EVENTS:
            for platform in PLATFORMS:
                cur.execute(SQL_INCREMENT, {"event": event, "platform": platform})
        assert {r["event"] for r in _counts(cur)} == set(INSTALL_EVENTS)


@pytest.mark.integration
def test_the_table_rejects_an_unknown_event(db_conn, _clean_counts):
    with db_conn.cursor() as cur, pytest.raises(psycopg2.errors.CheckViolation):
        cur.execute(SQL_INCREMENT, {"event": "deputy_viewed", "platform": "android"})


@pytest.mark.integration
def test_the_table_rejects_an_unknown_platform(db_conn, _clean_counts):
    with db_conn.cursor() as cur, pytest.raises(psycopg2.errors.CheckViolation):
        cur.execute(SQL_INCREMENT, {"event": "app_installed", "platform": "Pixel 9"})


@pytest.mark.integration
def test_the_table_holds_no_visitor_data(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'install_event_counts' "
            "ORDER BY ordinal_position"
        )
        assert [r["column_name"] for r in cur.fetchall()] == ["day", "event", "platform", "count"]
        cur.execute(
            "SELECT relrowsecurity FROM pg_class "
            "WHERE oid = 'public.install_event_counts'::regclass"
        )
        assert cur.fetchone()["relrowsecurity"] is True
