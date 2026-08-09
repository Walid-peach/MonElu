"""
Integration tests for GET /agenda's SQL (MON-212, ADR-030).

Exercises the real query against a live Postgres — a mocked cursor can't
catch a date-vs-timestamp comparison bug or IN-clause tuple binding.
"""

from datetime import date, datetime, timedelta, timezone

import pytest

from api.routers.agenda import _AGENDA_QUERY, _CANCELLED_STATES

_AGENDA_UPSERT = """
INSERT INTO agenda_items (
    point_uid, reunion_uid, sitting_start, objet, dossier_id,
    reunion_etat, point_etat, last_seen_at
) VALUES (
    %(point_uid)s, %(reunion_uid)s, %(sitting_start)s, %(objet)s, %(dossier_id)s,
    %(reunion_etat)s, %(point_etat)s, %(last_seen_at)s
)
ON CONFLICT (point_uid) DO UPDATE SET
    sitting_start = EXCLUDED.sitting_start,
    reunion_etat  = EXCLUDED.reunion_etat,
    point_etat    = EXCLUDED.point_etat,
    last_seen_at  = EXCLUDED.last_seen_at
"""

_VOTE_UPSERT = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, dossier_id)
VALUES (%(vote_id)s, %(voted_at)s, 'Vote de test agenda', 'adopté', %(dossier_id)s)
ON CONFLICT (vote_id) DO UPDATE SET
    voted_at    = EXCLUDED.voted_at,
    dossier_id  = EXCLUDED.dossier_id
"""


def _run_query(cur, from_date: date, to_date: date) -> list[dict]:
    cur.execute(
        _AGENDA_QUERY,
        (_CANCELLED_STATES, _CANCELLED_STATES, from_date, to_date + timedelta(days=1)),
    )
    return cur.fetchall()


@pytest.fixture
def _cleanup_agenda(db_conn):
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM agenda_items WHERE point_uid LIKE 'IT-AGENDA-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-AGENDA-%'")


@pytest.mark.integration
def test_dossier_links_to_earlier_same_day_scrutin(db_conn, _cleanup_agenda):
    """A same-day scrutin still links (ADR-030 §4: 'sitting date', not sitting time)."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            _AGENDA_UPSERT,
            {
                "point_uid": "IT-AGENDA-SAMEDAY",
                "reunion_uid": "RU-AGENDA-SAMEDAY",
                "sitting_start": now.replace(hour=15, minute=0, second=0, microsecond=0),
                "objet": "Vote solennel",
                "dossier_id": "DLR-AGENDA-1",
                "reunion_etat": "Confirmé",
                "point_etat": None,
                "last_seen_at": now,
            },
        )
        cur.execute(
            _VOTE_UPSERT,
            {
                "vote_id": "VT-AGENDA-EARLIER",
                # Earlier the same day than the point's 15:00 slot.
                "voted_at": now.replace(hour=9, minute=0, second=0, microsecond=0),
                "dossier_id": "DLR-AGENDA-1",
            },
        )
        rows = _run_query(cur, now.date(), now.date())
        row = next(r for r in rows if r["point_uid"] == "IT-AGENDA-SAMEDAY")
        assert row["vote_id"] == "VT-AGENDA-EARLIER"


@pytest.mark.integration
def test_dossier_does_not_link_to_earlier_day_scrutin(db_conn, _cleanup_agenda):
    """A scrutin from a strictly earlier day must not link (an unrelated earlier reading)."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            _AGENDA_UPSERT,
            {
                "point_uid": "IT-AGENDA-PASTVOTE",
                "reunion_uid": "RU-AGENDA-PASTVOTE",
                "sitting_start": now,
                "objet": "Vote solennel",
                "dossier_id": "DLR-AGENDA-2",
                "reunion_etat": "Confirmé",
                "point_etat": None,
                "last_seen_at": now,
            },
        )
        cur.execute(
            _VOTE_UPSERT,
            {
                "vote_id": "VT-AGENDA-PAST",
                "voted_at": now - timedelta(days=5),
                "dossier_id": "DLR-AGENDA-2",
            },
        )
        rows = _run_query(cur, now.date(), now.date())
        row = next(r for r in rows if r["point_uid"] == "IT-AGENDA-PASTVOTE")
        assert row["vote_id"] is None


@pytest.mark.integration
def test_cancelled_reunion_excluded(db_conn, _cleanup_agenda):
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            _AGENDA_UPSERT,
            {
                "point_uid": "IT-AGENDA-CANCELLED",
                "reunion_uid": "RU-AGENDA-CANCELLED",
                "sitting_start": now,
                "objet": "Texte annulé",
                "dossier_id": None,
                "reunion_etat": "Annulé",
                "point_etat": None,
                "last_seen_at": now,
            },
        )
        rows = _run_query(cur, now.date(), now.date())
        assert all(r["point_uid"] != "IT-AGENDA-CANCELLED" for r in rows)


@pytest.mark.integration
def test_stale_item_excluded(db_conn, _cleanup_agenda):
    """An item not seen in the most recent run must be invisible regardless of etat (ADR-030 §2)."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        # A fresher row establishes the "most recent run" watermark.
        cur.execute(
            _AGENDA_UPSERT,
            {
                "point_uid": "IT-AGENDA-FRESH",
                "reunion_uid": "RU-AGENDA-FRESH",
                "sitting_start": now,
                "objet": "Item frais",
                "dossier_id": None,
                "reunion_etat": "Confirmé",
                "point_etat": None,
                "last_seen_at": now,
            },
        )
        cur.execute(
            _AGENDA_UPSERT,
            {
                "point_uid": "IT-AGENDA-STALE",
                "reunion_uid": "RU-AGENDA-STALE",
                "sitting_start": now,
                "objet": "Item disparu",
                "dossier_id": None,
                "reunion_etat": "Confirmé",
                "point_etat": None,
                "last_seen_at": now - timedelta(days=1),
            },
        )
        rows = _run_query(cur, now.date(), now.date())
        assert all(r["point_uid"] != "IT-AGENDA-STALE" for r in rows)
