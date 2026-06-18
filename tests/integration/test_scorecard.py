"""
Integration tests for the scorecard SQL query against analytics_marts.mart_deputy_scorecard.

The mart is a dbt artifact not available in CI. conftest.py creates a stub table
with the same columns so the SQL used by api/routers/deputies.py is tested directly.
"""

import pytest

_SCORECARD_SQL = """
SELECT
    deputy_id,
    full_name,
    total_votes_cast                          AS total_votes,
    (total_votes_cast - total_nonvotant)      AS present_votes,
    presence_rate,
    total_pour                                AS votes_for,
    total_contre                              AS votes_against,
    total_abstention                          AS abstentions,
    votes_for_pct,
    abstention_pct
FROM analytics_marts.mart_deputy_scorecard
WHERE deputy_id = %s
"""


@pytest.mark.integration
def test_scorecard_row_returned(db_conn):
    """Known deputy_id must return correct aggregated stats."""
    with db_conn.cursor() as cur:
        cur.execute(_SCORECARD_SQL, ("PA001",))
        row = cur.fetchone()

    assert row is not None
    assert row["deputy_id"] == "PA001"
    assert row["full_name"] == "Alice Martin"
    assert row["total_votes"] == 25
    assert row["present_votes"] == 25  # total_votes_cast - total_nonvotant = 25 - 0
    assert float(row["presence_rate"]) == 1.0
    assert row["votes_for"] == 25
    assert row["votes_against"] == 0


@pytest.mark.integration
def test_scorecard_unknown_deputy_returns_no_rows(db_conn):
    """Unknown deputy_id must return zero rows (router converts this to 404)."""
    with db_conn.cursor() as cur:
        cur.execute(_SCORECARD_SQL, ("PA_DOES_NOT_EXIST",))
        row = cur.fetchone()

    assert row is None


@pytest.mark.integration
def test_scorecard_present_votes_calculation(db_conn):
    """present_votes = total_votes_cast - total_nonvotant is computed in SQL, not Python."""
    with db_conn.cursor() as cur:
        # Insert a deputy with 5 nonVotant positions
        cur.execute(
            """
            INSERT INTO analytics_marts.mart_deputy_scorecard
                (deputy_id, full_name, total_votes_cast, total_nonvotant,
                 presence_rate, total_pour, total_contre, total_abstention,
                 votes_for_pct, abstention_pct)
            VALUES ('PA_TEST_NV', 'Test NonVotant', 20, 5, 0.75, 10, 5, 0, 0.5, 0.0)
            ON CONFLICT (deputy_id) DO NOTHING
            """
        )
        cur.execute(_SCORECARD_SQL, ("PA_TEST_NV",))
        row = cur.fetchone()

    assert row["present_votes"] == 15  # 20 - 5
    assert float(row["presence_rate"]) == 0.75

    # Cleanup
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM analytics_marts.mart_deputy_scorecard WHERE deputy_id = 'PA_TEST_NV'"
        )
