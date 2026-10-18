"""
Integration tests for GET /feed's SQL (#562, ADR-042).

A mocked cursor cannot catch a time-zone slip at a week boundary or a join
that drops the deputy's position, so the week query and the recess fallback
run here against a live Postgres. The weeks used (March 2020) sit far from the
January 2026 votes the shared fixtures seed.
"""

from datetime import date, datetime, timezone

import pytest

from api.routers.feed import (
    SQL_LATEST_BEFORE,
    _week_rows,
    build_items,
    paris_midnight,
)

_VOTE = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for, votes_against,
                   scrutin_kind, dossier_id)
VALUES (%(vote_id)s, %(voted_at)s, 'Vote de test feed', 'adopté', 300, 100,
        %(kind)s, %(dossier_id)s)
ON CONFLICT (vote_id) DO UPDATE SET
    voted_at = EXCLUDED.voted_at, scrutin_kind = EXCLUDED.scrutin_kind,
    dossier_id = EXCLUDED.dossier_id
"""

# Paris is UTC+1 throughout these dates (summer time starts on 2020-03-29).
VOTES = [
    # 00:30 on Monday 2020-03-09 in Paris: the first minutes of the week.
    ("VT-FEED-MONDAY", datetime(2020, 3, 8, 23, 30, tzinfo=timezone.utc), "ensemble", "DLR-FEED"),
    # 23:30 on Sunday 2020-03-15 in Paris: the last minutes of the same week.
    ("VT-FEED-SUNDAY", datetime(2020, 3, 15, 22, 30, tzinfo=timezone.utc), "motion", None),
    # 00:30 on Monday 2020-03-16 in Paris: already the next week.
    ("VT-FEED-NEXT", datetime(2020, 3, 15, 23, 30, tzinfo=timezone.utc), "ensemble", None),
]


@pytest.fixture
def _feed_votes(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO dossiers (dossier_uid, titre, status, has_scrutins, last_seen_at) "
            "VALUES ('DLR-FEED', 'Texte de test', 'en_cours', TRUE, NOW()) "
            "ON CONFLICT (dossier_uid) DO UPDATE SET has_scrutins = TRUE"
        )
        for vote_id, voted_at, kind, dossier in VOTES:
            cur.execute(
                _VOTE,
                {"vote_id": vote_id, "voted_at": voted_at, "kind": kind, "dossier_id": dossier},
            )
        cur.execute(
            "INSERT INTO vote_positions (vote_id, deputy_id, position) "
            "VALUES ('VT-FEED-SUNDAY', 'PA001', 'abstention') "
            "ON CONFLICT (vote_id, deputy_id) DO UPDATE SET position = EXCLUDED.position"
        )
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM vote_positions WHERE vote_id LIKE 'VT-FEED-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-FEED-%'")
        cur.execute("DELETE FROM dossiers WHERE dossier_uid = 'DLR-FEED'")


@pytest.mark.integration
def test_week_runs_monday_to_sunday_in_paris(db_conn, _feed_votes):
    with db_conn.cursor() as cur:
        rows = _week_rows(cur, date(2020, 3, 9), None)
    assert [r["vote_id"] for r in rows] == ["VT-FEED-SUNDAY", "VT-FEED-MONDAY"]


@pytest.mark.integration
def test_deputy_position_and_bill_page_are_joined(db_conn, _feed_votes):
    with db_conn.cursor() as cur:
        rows = _week_rows(cur, date(2020, 3, 9), "PA001")
    by_id = {r["vote_id"]: r for r in rows}
    assert by_id["VT-FEED-SUNDAY"]["position"] == "abstention"
    assert by_id["VT-FEED-MONDAY"]["position"] is None
    assert by_id["VT-FEED-MONDAY"]["has_scrutins"] is True

    items = build_items("pour_vous", rows, [], has_deputy=True, theme_names=set())
    assert [i.scrutin.vote_id for i in items if i.type == "scrutin"] == ["VT-FEED-SUNDAY"]


@pytest.mark.integration
def test_recess_fallback_finds_the_last_week_that_sat(db_conn, _feed_votes):
    with db_conn.cursor() as cur:
        assert _week_rows(cur, date(2020, 3, 23), None) == []
        cur.execute(SQL_LATEST_BEFORE, {"end": paris_midnight(date(2020, 3, 23))})
        latest = cur.fetchone()["latest"]
    assert latest == datetime(2020, 3, 15, 23, 30, tzinfo=timezone.utc)
