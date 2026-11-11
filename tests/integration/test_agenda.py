"""
Integration tests for GET /agenda's SQL (MON-212, ADR-030).

Exercises the real query against a live Postgres — a mocked cursor can't
catch a date-vs-timestamp comparison bug or IN-clause tuple binding.
"""

import os
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers.agenda import _AGENDA_QUERY
from scripts.ingest_agenda import upsert_agenda_items

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
        (from_date, to_date + timedelta(days=1)),
    )
    return cur.fetchall()


@pytest.fixture
def _cleanup_agenda(db_conn):
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM agenda_items WHERE point_uid LIKE 'IT-AGENDA-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-AGENDA-%'")
        cur.execute("DELETE FROM dossiers WHERE dossier_uid LIKE 'DLR-AGENDA-%'")


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


@pytest.mark.integration
def test_item_carries_its_dossier_title(db_conn, _cleanup_agenda):
    """The bill's short title comes from `dossiers` (#525); no dossier row, no title."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO dossiers (dossier_uid, titre, status, last_seen_at) "
            "VALUES ('DLR-AGENDA-TITLE', 'Fraudes sociales et fiscales', 'en_cours', %s)",
            (now,),
        )
        for uid, dossier in (
            ("IT-AGENDA-TITLED", "DLR-AGENDA-TITLE"),
            ("IT-AGENDA-NOTITLE", "DLR-AGENDA-NONE"),
        ):
            cur.execute(
                _AGENDA_UPSERT,
                {
                    "point_uid": uid,
                    "reunion_uid": f"RU-{uid}",
                    "sitting_start": now,
                    "objet": "Discussion générale",
                    "dossier_id": dossier,
                    "reunion_etat": "Confirmé",
                    "point_etat": None,
                    "last_seen_at": now,
                },
            )
        rows = {r["point_uid"]: r for r in _run_query(cur, now.date(), now.date())}
        assert rows["IT-AGENDA-TITLED"]["dossier_title"] == "Fraudes sociales et fiscales"
        assert rows["IT-AGENDA-NOTITLE"]["dossier_title"] is None


# --- The single-transaction rule (#684) ------------------------------------
#
# Visibility is "last_seen_at equals the table's max", and ingest_agenda.py
# stamps last_seen_at with NOW(), the transaction's start time. The rule
# therefore holds only while one run's upsert is one transaction. These two
# tests run the real upsert through the real endpoint, once as it is and once
# split in two commits, so that dependency is pinned rather than implied.


def _agenda_record(point_uid: str, sitting_start: datetime) -> dict:
    return {
        "point_uid": point_uid,
        "reunion_uid": f"RU-{point_uid}",
        "sitting_start": sitting_start,
        "sitting_end": None,
        "objet": f"Discussion du texte de test {point_uid}",
        "point_type": "Discussion",
        "travaux_nature": None,
        "procedure_label": None,
        "dossier_id": None,
        "reunion_etat": "Confirmé",
        "point_etat": None,
        "published_at": None,
        "cancelled_at": None,
        "objet_hash": f"hash-{point_uid}",
    }


@pytest.fixture
def agenda_api(db_conn, _cleanup_agenda):
    with (
        patch("scripts.ingest_agenda.DATABASE_URL", os.environ["DATABASE_URL"]),
        patch("api.main._warm_sql_pool"),
        TestClient(app) as client,
    ):
        yield client


def _shown(client, day: date) -> set[str]:
    resp = client.get("/agenda", params={"from": day.isoformat(), "to": day.isoformat()})
    assert resp.status_code == 200
    return {i["point_uid"] for d in resp.json()["days"] for i in d["items"]}


_BATCH_A = ("IT-AGENDA-BATCH-A1", "IT-AGENDA-BATCH-A2")
_BATCH_B = ("IT-AGENDA-BATCH-B1",)


@pytest.mark.integration
def test_one_transaction_run_shows_every_item(agenda_api):
    """Both halves of a run written in one upsert are all on the feed."""
    sitting = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    upsert_agenda_items([_agenda_record(uid, sitting) for uid in _BATCH_A + _BATCH_B])

    assert set(_BATCH_A + _BATCH_B) <= _shown(agenda_api, sitting.date())


@pytest.mark.integration
def test_a_run_committed_in_two_transactions_hides_its_first_batch(agenda_api):
    """Why ingest_agenda.py must never commit in batches.

    Each commit stamps its own NOW(), so only the last batch carries the
    table's latest last_seen_at and every earlier batch of the same run
    disappears from GET /agenda. If this test ever fails, visibility no longer
    hangs on one transaction and api/agenda_visibility.py's docstring is stale.
    """
    sitting = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    upsert_agenda_items([_agenda_record(uid, sitting) for uid in _BATCH_A])
    upsert_agenda_items([_agenda_record(uid, sitting) for uid in _BATCH_B])

    shown = _shown(agenda_api, sitting.date())
    assert set(_BATCH_B) <= shown
    assert shown.isdisjoint(_BATCH_A)
