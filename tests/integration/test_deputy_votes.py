"""
Integration test for GET /deputies/{id}/votes, through the real app against a
live Postgres.

The query walks the scrutins newest first and probes each for the deputy's
position, so LIMIT stops early instead of reading every position the deputy
ever cast. What a mocked cursor cannot check is that this returns the same rows
as before: the newest scrutins the deputy has a position on, in date order,
with `since` narrowing the items and never `total`.
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
