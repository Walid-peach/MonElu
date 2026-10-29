"""
Integration test for GET /votes/{vote_id}'s turnout (#627), through the real
app against a live Postgres: the median over mart_vote_summary and the group
members whose mandate covered the vote's date are SQL a mocked cursor cannot
check.

The fixture uses its own vote type and group label, so rows other tests seed
never enter the median or the member counts.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from tests.integration.conftest import (
    _DEPUTY_UPSERT,
    _POSITION_UPSERT,
    _VOTE_UPSERT,
    DEPUTY_A,
    _make_vote,
)

VOTE_TYPE = "it-turnout"
GROUP = "IT-TURN"

_MART_SQL = """
INSERT INTO analytics_marts.mart_vote_summary
    (vote_id, voted_at, vote_title, vote_type, result,
     votes_for, votes_against, abstentions, total_voters, deputies_with_position)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_title)s, %(vote_type)s, %(result)s,
        %(votes_for)s, %(votes_against)s, %(abstentions)s, %(total_voters)s,
        %(deputies_with_position)s)
"""


def _deputy(i: int, mandate_start: str, mandate_end=None) -> dict:
    return {
        **DEPUTY_A,
        "deputy_id": f"PA-TURN-{i}",
        "full_name": f"Député Turnout {i}",
        "party_short": GROUP,
        "mandate_start": mandate_start,
        "mandate_end": mandate_end,
    }


@pytest.fixture(scope="module")
def api(db_conn):
    # Four members on the vote's date, plus one elected after it and one who
    # had already left: neither counts as a member then.
    deputies = [_deputy(i, "2024-07-07") for i in range(4)] + [
        _deputy(4, "2026-03-01"),
        _deputy(5, "2024-07-07", "2025-12-31"),
    ]
    vote = {
        **_make_vote(1),
        "vote_id": "VT-TURN-1",
        "voted_at": datetime(2026, 2, 2, 12, tzinfo=timezone.utc),
        "vote_type": VOTE_TYPE,
        "votes_for": 2,
        "votes_against": 1,
        "abstentions": 0,
        "total_voters": 3,
    }
    others = [
        {**vote, "vote_id": f"VT-TURN-{n}", "deputies_with_position": n * 10} for n in (2, 3, 4)
    ]
    with db_conn.cursor() as cur:
        for d in deputies:
            cur.execute(_DEPUTY_UPSERT, d)
        cur.execute(_VOTE_UPSERT, vote)
        for deputy_id, position in [
            ("PA-TURN-0", "pour"),
            ("PA-TURN-1", "pour"),
            ("PA-TURN-2", "contre"),
            ("PA-TURN-3", "nonVotant"),
        ]:
            cur.execute(
                _POSITION_UPSERT,
                {"vote_id": "VT-TURN-1", "deputy_id": deputy_id, "position": position},
            )
        cur.execute(_MART_SQL, {**vote, "deputies_with_position": 4})
        for row in others:
            cur.execute(_MART_SQL, row)
    with patch("api.main._warm_sql_pool"), TestClient(app) as client:
        yield client
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM analytics_marts.mart_vote_summary WHERE vote_id LIKE 'VT-TURN-%'")
        cur.execute("DELETE FROM vote_positions WHERE vote_id LIKE 'VT-TURN-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-TURN-%'")
        cur.execute("DELETE FROM deputies WHERE deputy_id LIKE 'PA-TURN-%'")


@pytest.mark.integration
def test_vote_participation(api):
    data = api.get("/votes/VT-TURN-1").json()
    part = data["participation"]
    assert part["participants"] == 4
    assert part["non_voting"] == 1
    assert part["seats"] == 577
    assert part["rate"] == round(4 / 577, 4)
    # Median of 4, 20, 30 and 40 positions over the same vote type.
    assert part["typical_rate"] == round(25 / 577, 4)
    assert part["comparison"] == "below"
    # Every group of the chamber is listed, those that cast nothing included;
    # the other fixtures' groups sit alongside this one.
    ours = [g for g in part["groups"] if g["party_short"] == GROUP]
    assert ours == [{"party_short": GROUP, "participants": 4, "members": 4, "rate": 1.0}]
    assert data["majority_required"] == 2
    assert (data["pct_pour"], data["pct_contre"], data["pct_abstention"]) == (
        round(2 / 3, 4),
        round(1 / 3, 4),
        0.0,
    )
