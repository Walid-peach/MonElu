"""
Integration tests for the deputy-vs-deputy diverging-votes SQL used by
GET /deputies/{deputy_id}/diverging-votes (MON-92).

Fixtures (see conftest.py): PA001 voted 'pour' on all 25 seeded votes,
PA002 voted 'contre' on all 25 — every vote diverges between the two.
"""

import pytest

_DIVERGING_VOTES_COUNT_SQL = """
SELECT COUNT(*)
FROM vote_positions vpa
JOIN vote_positions vpb
    ON vpb.vote_id = vpa.vote_id AND vpb.deputy_id = %s
WHERE vpa.deputy_id = %s
  AND vpa.position IN ('pour', 'contre', 'abstention')
  AND vpb.position IN ('pour', 'contre', 'abstention')
  AND vpa.position != vpb.position
"""

_DIVERGING_VOTES_SQL = """
SELECT vpa.vote_id, v.voted_at, v.vote_title, v.result, v.summary_plain,
       vpa.position AS position_a, vpb.position AS position_b
FROM vote_positions vpa
JOIN vote_positions vpb
    ON vpb.vote_id = vpa.vote_id AND vpb.deputy_id = %s
JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vpa.vote_id
WHERE vpa.deputy_id = %s
  AND vpa.position IN ('pour', 'contre', 'abstention')
  AND vpb.position IN ('pour', 'contre', 'abstention')
  AND vpa.position != vpb.position
ORDER BY v.voted_at DESC
LIMIT %s
"""


@pytest.mark.integration
def test_diverging_votes_count_matches_full_split(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DIVERGING_VOTES_COUNT_SQL, ("PA002", "PA001"))
        row = cur.fetchone()

    assert row["count"] == 25


@pytest.mark.integration
def test_diverging_votes_rows_carry_both_positions(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DIVERGING_VOTES_SQL, ("PA002", "PA001", 5))
        rows = cur.fetchall()

    assert len(rows) == 5
    for row in rows:
        assert row["position_a"] == "pour"
        assert row["position_b"] == "contre"


@pytest.mark.integration
def test_diverging_votes_is_empty_for_same_deputy(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DIVERGING_VOTES_COUNT_SQL, ("PA001", "PA001"))
        row = cur.fetchone()

    assert row["count"] == 0
