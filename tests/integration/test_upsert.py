"""
Integration tests for ADR-8: ON CONFLICT DO UPDATE idempotency.

Verifies that re-inserting a row updates the existing record rather than
raising a duplicate-key error, and that repeated runs leave exactly one row.
"""

import pytest

from scripts.ingest_deputies import UPSERT_SQL as DEPUTY_UPSERT_SQL
from scripts.ingest_positions import UPSERT_SQL as POSITION_UPSERT_SQL
from scripts.ingest_votes import UPSERT_SQL as VOTE_UPSERT_SQL


@pytest.mark.integration
def test_deputy_upsert_creates_row(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM deputies WHERE deputy_id = 'PA001'")
        assert cur.fetchone()["count"] == 1


@pytest.mark.integration
def test_deputy_upsert_updates_row(db_conn):
    """Re-inserting with a different party must update the existing row, not error."""
    updated = {
        "deputy_id": "PA001",
        "full_name": "Alice Martin",
        "first_name": "Alice",
        "last_name": "Martin",
        "party": "Horizons",  # changed
        "party_short": "HOR",
        "circonscription": "1ère circonscription du Var",
        "department": "Var",
        "mandate_start": "2024-07-07",
        "mandate_end": None,
        "photo_url": None,
    }
    with db_conn.cursor() as cur:
        cur.execute(DEPUTY_UPSERT_SQL, updated)
        cur.execute("SELECT party FROM deputies WHERE deputy_id = 'PA001'")
        assert cur.fetchone()["party"] == "Horizons"

        # Restore original value so other tests aren't affected
        cur.execute(
            DEPUTY_UPSERT_SQL, {**updated, "party": "Rassemblement National", "party_short": "RN"}
        )


@pytest.mark.integration
def test_deputy_upsert_preserves_party_short_when_omitted(db_conn):
    """A re-ingest with party_short=NULL (AMO10 has no inline label) must not
    wipe a previously-resolved value — the COALESCE guard added for MON-119."""
    resolved = {
        "deputy_id": "PA001",
        "full_name": "Alice Martin",
        "first_name": "Alice",
        "last_name": "Martin",
        "party": "Horizons & Indépendants",
        "party_short": "HOR",
        "circonscription": "1ère circonscription du Var",
        "department": "Var",
        "mandate_start": "2024-07-07",
        "mandate_end": None,
        "photo_url": None,
    }
    with db_conn.cursor() as cur:
        cur.execute(DEPUTY_UPSERT_SQL, resolved)

        # Simulate a daily ingest run, which never has a resolved party_short
        reingested = {**resolved, "party_short": None}
        cur.execute(DEPUTY_UPSERT_SQL, reingested)

        cur.execute("SELECT party_short FROM deputies WHERE deputy_id = 'PA001'")
        assert cur.fetchone()["party_short"] == "HOR"

        # Restore original fixture value
        cur.execute(
            DEPUTY_UPSERT_SQL, {**resolved, "party": "Rassemblement National", "party_short": "RN"}
        )


@pytest.mark.integration
def test_deputy_upsert_single_row(db_conn):
    """Three upserts of the same deputy_id must leave exactly one row."""
    row = {
        "deputy_id": "PA099",
        "full_name": "Test Deputy",
        "first_name": "Test",
        "last_name": "Deputy",
        "party": "Party A",
        "party_short": "PA",
        "circonscription": "circ",
        "department": "dept",
        "mandate_start": "2024-07-07",
        "mandate_end": None,
        "photo_url": None,
    }
    with db_conn.cursor() as cur:
        for party in ("Party A", "Party B", "Party C"):
            cur.execute(DEPUTY_UPSERT_SQL, {**row, "party": party})

        cur.execute("SELECT COUNT(*), party FROM deputies WHERE deputy_id = 'PA099' GROUP BY party")
        rows = cur.fetchall()
        assert len(rows) == 1
        assert rows[0]["party"] == "Party C"

        # Cleanup
        cur.execute("DELETE FROM deputies WHERE deputy_id = 'PA099'")


@pytest.mark.integration
def test_vote_upsert_creates_row(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM votes WHERE vote_id = 'VTANR5L17V0001'")
        assert cur.fetchone()["count"] == 1


@pytest.mark.integration
def test_vote_upsert_updates_result(db_conn):
    """Re-inserting a vote with a different result must update, not duplicate."""
    from tests.integration.conftest import _make_vote

    original = _make_vote(1)  # VTANR5L17V0001, voted_at derived from formula
    vote = {**original, "result": "rejeté", "votes_for": 100, "votes_against": 300}
    with db_conn.cursor() as cur:
        cur.execute(VOTE_UPSERT_SQL, vote)
        cur.execute("SELECT result FROM votes WHERE vote_id = 'VTANR5L17V0001'")
        assert cur.fetchone()["result"] == "rejeté"

        # Restore using the original values so the fixture state is unchanged
        cur.execute(VOTE_UPSERT_SQL, original)


@pytest.mark.integration
def test_position_upsert_idempotency(db_conn):
    """Inserting the same (vote_id, deputy_id) twice must yield exactly one row."""
    pos = {"vote_id": "VTANR5L17V0001", "deputy_id": "PA001", "position": "pour"}
    with db_conn.cursor() as cur:
        cur.execute(POSITION_UPSERT_SQL, pos)
        cur.execute(POSITION_UPSERT_SQL, pos)
        cur.execute(
            "SELECT COUNT(*) FROM vote_positions WHERE vote_id = %s AND deputy_id = %s",
            ("VTANR5L17V0001", "PA001"),
        )
        assert cur.fetchone()["count"] == 1


@pytest.mark.integration
def test_position_upsert_updates_position(db_conn):
    """A position change (pour → abstention) on the same (vote_id, deputy_id) must update."""
    with db_conn.cursor() as cur:
        cur.execute(
            POSITION_UPSERT_SQL,
            {"vote_id": "VTANR5L17V0001", "deputy_id": "PA001", "position": "abstention"},
        )
        cur.execute(
            "SELECT position FROM vote_positions WHERE vote_id = %s AND deputy_id = %s",
            ("VTANR5L17V0001", "PA001"),
        )
        assert cur.fetchone()["position"] == "abstention"

        # Restore
        cur.execute(
            POSITION_UPSERT_SQL,
            {"vote_id": "VTANR5L17V0001", "deputy_id": "PA001", "position": "pour"},
        )
