"""
Integration tests for the party alignment / dissident-votes SQL used by
api/routers/deputies.py.

Fixtures (see conftest.py): PA001 (Rassemblement National) is dissident on
the first 5 seeded votes and aligned on the remaining 20, via a tied RN
majority that resolves to 'contre' by the alphabetical tie-break used in
transform/models/intermediate/int_party_vote_majority.sql.
"""

import pytest

from rag.chain.sql_router import SQL_QUERIES

_ALIGNMENT_SQL = """
SELECT
    deputy_id,
    full_name,
    party,
    total_votes,
    aligned_votes,
    dissident_votes,
    party_alignment_rate,
    dissident_rate,
    updated_at
FROM analytics_marts.mart_party_alignment
WHERE deputy_id = %s
"""

_DISSIDENT_VOTES_SQL = """
SELECT vp.vote_id, v.voted_at, v.vote_title, v.result,
       vp.position, m.majority_position
FROM vote_positions vp
JOIN deputies d ON d.deputy_id = vp.deputy_id
JOIN analytics_intermediate.int_party_vote_majority m
    ON m.vote_id = vp.vote_id AND m.party = d.party
JOIN analytics_marts.mart_vote_summary v ON v.vote_id = vp.vote_id
WHERE vp.deputy_id = %s
  AND vp.position IN ('pour', 'contre', 'abstention')
  AND vp.position != m.majority_position
ORDER BY v.voted_at DESC
LIMIT %s
"""

_DISSIDENT_VOTES_COUNT_SQL = """
SELECT COUNT(*)
FROM vote_positions vp
JOIN deputies d ON d.deputy_id = vp.deputy_id
JOIN analytics_intermediate.int_party_vote_majority m
    ON m.vote_id = vp.vote_id AND m.party = d.party
WHERE vp.deputy_id = %s
  AND vp.position IN ('pour', 'contre', 'abstention')
  AND vp.position != m.majority_position
"""


@pytest.mark.integration
def test_alignment_row_returned(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_ALIGNMENT_SQL, ("PA001",))
        row = cur.fetchone()

    assert row is not None
    assert row["deputy_id"] == "PA001"
    assert row["total_votes"] == 25
    assert row["aligned_votes"] == 20
    assert row["dissident_votes"] == 5
    assert float(row["party_alignment_rate"]) == 0.8
    assert float(row["dissident_rate"]) == 0.2


@pytest.mark.integration
def test_alignment_unknown_deputy_returns_no_rows(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_ALIGNMENT_SQL, ("PA_DOES_NOT_EXIST",))
        row = cur.fetchone()

    assert row is None


@pytest.mark.integration
def test_dissident_votes_count_matches_mart(db_conn):
    """Vote-level dissident count must agree with the mart's aggregate."""
    with db_conn.cursor() as cur:
        cur.execute(_DISSIDENT_VOTES_COUNT_SQL, ("PA001",))
        count_row = cur.fetchone()

    assert count_row["count"] == 5


@pytest.mark.integration
def test_dissident_votes_items(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DISSIDENT_VOTES_SQL, ("PA001", 10))
        rows = cur.fetchall()

    assert len(rows) == 5
    for row in rows:
        assert row["position"] == "pour"
        assert row["majority_position"] == "contre"


@pytest.mark.integration
def test_dissident_votes_respects_limit(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(_DISSIDENT_VOTES_SQL, ("PA001", 2))
        rows = cur.fetchall()

    assert len(rows) == 2


@pytest.mark.integration
def test_party_alignment_reads_mart(db_conn):
    """rag.chain.sql_router's party_alignment intent (MON-234) must read
    analytics_marts.mart_party_alignment, not re-derive it via a live join."""
    with db_conn.cursor() as cur:
        cur.execute(SQL_QUERIES["party_alignment"])
        rows = cur.fetchall()

    assert len(rows) == 1
    row = rows[0]
    assert row["party"] == "Rassemblement National"
    assert row["total_votes"] == 25
    assert float(row["alignment_pct"]) == 80.0
