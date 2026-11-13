"""
Integration test for GET /deputies/{id}/votes, through the real app against a
live Postgres.

What a mocked cursor cannot check is what the query returns: the newest
scrutins the deputy has a position on, in date order, with `since` narrowing the
items and never `total`. The last test holds the index the query depends on.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

pytestmark = pytest.mark.integration

DEPUTY = "PA-DV-1"
ABSENT = "PA-DV-2"
# Dated after every other fixture, so "newest first" is about these alone.
VOTES = [f"VT-DV-{i:02d}" for i in range(1, 13)]
# The deputy has no position on these two, the newest and one in the middle.
WITHOUT_POSITION = {"VT-DV-12", "VT-DV-07"}

_DEPUTY_SQL = """
INSERT INTO deputies (deputy_id, full_name, first_name, last_name)
VALUES (%s, %s, 'Test', %s)
ON CONFLICT (deputy_id) DO NOTHING
"""

_VOTE_SQL = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for, votes_against,
                   abstentions, total_voters, scrutin_kind)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_id)s, 'adopté', 10, 5, 1, 16, 'ensemble')
ON CONFLICT (vote_id) DO NOTHING
"""

_MART_SQL = """
INSERT INTO analytics_marts.mart_vote_summary
    (vote_id, voted_at, vote_title, result, votes_for, votes_against, abstentions,
     total_voters)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_id)s, 'adopté', 10, 5, 1, 16)
ON CONFLICT (vote_id) DO NOTHING
"""

_POSITION_SQL = """
INSERT INTO vote_positions (vote_id, deputy_id, position)
VALUES (%s, %s, %s)
ON CONFLICT (vote_id, deputy_id) DO NOTHING
"""


def _day(i: int) -> datetime:
    return datetime(2031, 3, i, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def api(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DEPUTY_SQL, (DEPUTY, "Test Votes", "Votes"))
        cur.execute(_DEPUTY_SQL, (ABSENT, "Test Absent", "Absent"))
        for i, vote_id in enumerate(VOTES, start=1):
            row = {"vote_id": vote_id, "voted_at": _day(i)}
            cur.execute(_VOTE_SQL, row)
            cur.execute(_MART_SQL, row)
            if vote_id not in WITHOUT_POSITION:
                cur.execute(_POSITION_SQL, (vote_id, DEPUTY, "pour" if i % 2 else "contre"))
    with patch("api.main._warm_sql_pool"), TestClient(app) as client:
        yield client
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM vote_positions WHERE deputy_id IN (%s, %s)", (DEPUTY, ABSENT))
        cur.execute(
            "DELETE FROM analytics_marts.mart_vote_summary WHERE vote_id = ANY(%s)", (VOTES,)
        )
        cur.execute("DELETE FROM votes WHERE vote_id = ANY(%s)", (VOTES,))
        cur.execute("DELETE FROM deputies WHERE deputy_id IN (%s, %s)", (DEPUTY, ABSENT))


def _ids(body: dict) -> list[str]:
    return [item["vote_id"] for item in body["items"]]


def test_newest_first_skipping_scrutins_without_a_position(api):
    body = api.get(f"/deputies/{DEPUTY}/votes", params={"limit": 5}).json()
    assert _ids(body) == ["VT-DV-11", "VT-DV-10", "VT-DV-09", "VT-DV-08", "VT-DV-06"]
    assert body["total"] == 10


def test_each_item_carries_the_deputys_position_and_the_scrutin(api):
    body = api.get(f"/deputies/{DEPUTY}/votes", params={"limit": 2}).json()
    first, second = body["items"]
    assert (first["position"], second["position"]) == ("pour", "contre")
    assert first["result"] == "adopté"
    assert first["scrutin_kind"] == "ensemble"
    assert first["vote_title"] == "VT-DV-11"


def test_limit_larger_than_the_record_returns_all_of_it(api):
    body = api.get(f"/deputies/{DEPUTY}/votes", params={"limit": 50}).json()
    assert len(body["items"]) == 10
    assert _ids(body) == sorted(_ids(body), reverse=True)


def test_since_narrows_the_items_and_not_the_total(api):
    body = api.get(
        f"/deputies/{DEPUTY}/votes", params={"limit": 50, "since": _day(8).isoformat()}
    ).json()
    # Strictly after the 8th: the 9th, 10th and 11th (the 12th has no position).
    assert _ids(body) == ["VT-DV-11", "VT-DV-10", "VT-DV-09"]
    assert body["total"] == 10


def test_a_deputy_with_no_position_gets_an_empty_list(api):
    body = api.get(f"/deputies/{ABSENT}/votes").json()
    assert body["items"] == []
    assert body["total"] == 0


def test_the_total_is_the_scorecards_and_the_items_are_live(api, db_conn):
    # A stored total that differs from the live count shows which one is served.
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO analytics_marts.mart_deputy_scorecard (deputy_id, total_votes_cast) "
            "VALUES (%s, 9)",
            (DEPUTY,),
        )
    try:
        body = api.get(f"/deputies/{DEPUTY}/votes", params={"limit": 50}).json()
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM analytics_marts.mart_deputy_scorecard WHERE deputy_id = %s",
                (DEPUTY,),
            )
    assert body["total"] == 9
    assert len(body["items"]) == 10


def test_a_scorecard_reporting_no_position_is_checked_against_the_record(api, db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO analytics_marts.mart_deputy_scorecard (deputy_id, total_votes_cast) "
            "VALUES (%s, 0)",
            (DEPUTY,),
        )
    try:
        body = api.get(f"/deputies/{DEPUTY}/votes", params={"limit": 50}).json()
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM analytics_marts.mart_deputy_scorecard WHERE deputy_id = %s",
                (DEPUTY,),
            )
    assert body["total"] == 10
    assert len(body["items"]) == 10


def test_a_deputys_positions_are_readable_from_the_index_alone(db_conn):
    # Migration 020: without `position` in the index, every row costs a visit
    # to the table, which is what made a deputy's first open take over a second.
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE schemaname = 'public' AND tablename = 'vote_positions'"
        )
        indexes = {row["indexname"]: row["indexdef"] for row in cur.fetchall()}
    covering = indexes["idx_positions_deputy_covering"]
    assert "(deputy_id, vote_id) INCLUDE" in covering
    assert "position" in covering.split("INCLUDE")[1]
    assert "idx_positions_deputy" not in indexes
