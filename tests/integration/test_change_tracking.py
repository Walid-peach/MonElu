"""The `changed_at` half of every upsert, executed rather than grepped (GH #353).

`run_ingestion_prod.py` builds the frontend cache-invalidation scope from
`changed_at >= <run start>`. Two properties have to hold for that to work, and
neither is visible in a source-text assertion:

1. A record the AN republished **unchanged** must not move `changed_at`. If it
   does, every run reports its whole table as changed and the targeted purge
   silently degrades into the blanket one - green tests, green workflow, and the
   Vercel bill back where it started.
2. `ingested_at` must keep moving on **every** write, changed or not. dbt reads
   it as its source-freshness field, and `sources.yml` documents the `deputies`
   source as the "cron silently died" detector at `error_after: 7 days`. An
   `ingested_at` that only moves on change turns the daily ingestion job red
   about a week into any quiet stretch (see `data/migrations/011_changed_at.sql`).

The comparison expressions are subtle enough to deserve a real database: the
deputies one has to mirror the SET clause's `COALESCE(EXCLUDED.party, ...)`, and
the agenda one sits next to the MON-211 summary-clearing CASE in the same
statement.
"""

import pytest

from scripts.ingest_agenda import UPSERT_SQL as AGENDA_UPSERT_SQL
from scripts.ingest_deputies import UPSERT_SQL as DEPUTY_UPSERT_SQL
from scripts.ingest_positions import UPSERT_SQL as POSITION_UPSERT_SQL
from scripts.ingest_votes import UPSERT_SQL as VOTE_UPSERT_SQL

pytestmark = pytest.mark.integration


DEPUTY = {
    "deputy_id": "PA_CHG",
    "full_name": "Camille Durand",
    "first_name": "Camille",
    "last_name": "Durand",
    # AMO10 never carries a party: update_party.py fills it afterwards, and the
    # upsert's COALESCE is what keeps a re-run from wiping it.
    "party": None,
    "party_short": None,
    "circonscription": "2e circonscription de l'Ain",
    "department": "Ain",
    "mandate_start": "2024-07-07",
    "mandate_end": None,
    "photo_url": None,
}

VOTE = {
    "vote_id": "VT_CHG",
    "voted_at": "2026-01-15",
    "vote_title": "Projet de loi de test",
    "vote_type": "SPO",
    "result": "adopté",
    "votes_for": 100,
    "votes_against": 50,
    "abstentions": 3,
    "total_voters": 153,
    "dossier_id": None,
    "scrutin_kind": "ensemble",
}

POSITION = {"vote_id": "VT_CHG", "deputy_id": "PA_CHG", "position": "pour"}

AGENDA = {
    "point_uid": "PT_CHG",
    "reunion_uid": "RU_CHG",
    "sitting_start": "2026-01-15 09:00+00",
    "sitting_end": None,
    "objet": "Discussion générale sur un texte de test suffisamment long",
    "point_type": "Discussion",
    "travaux_nature": None,
    "procedure_label": None,
    "dossier_id": None,
    "reunion_etat": "Confirmé",
    "point_etat": "Confirmé",
    "published_at": None,
    "cancelled_at": None,
    "objet_hash": "hash-a",
}


def _stamps(cur, table: str, id_column: str, id_value: str):
    cur.execute(
        f"SELECT ingested_at, changed_at FROM {table} WHERE {id_column} = %s",  # noqa: S608
        (id_value,),
    )
    row = cur.fetchone()
    return row["ingested_at"], row["changed_at"]


@pytest.fixture
def cur(db_conn):
    with db_conn.cursor() as cursor:
        yield cursor
        for table, column, value in (
            ("vote_positions", "vote_id", "VT_CHG"),
            ("votes", "vote_id", "VT_CHG"),
            ("deputies", "deputy_id", "PA_CHG"),
            ("agenda_items", "point_uid", "PT_CHG"),
        ):
            cursor.execute(f"DELETE FROM {table} WHERE {column} = %s", (value,))  # noqa: S608
        db_conn.commit()


def test_unchanged_vote_keeps_changed_at_and_still_moves_ingested_at(cur):
    cur.execute(VOTE_UPSERT_SQL, VOTE)
    ingested_1, changed_1 = _stamps(cur, "votes", "vote_id", "VT_CHG")

    cur.execute(VOTE_UPSERT_SQL, VOTE)
    ingested_2, changed_2 = _stamps(cur, "votes", "vote_id", "VT_CHG")

    assert changed_2 == changed_1, "an unchanged scrutin must not report as changed"
    assert ingested_2 > ingested_1, "dbt's source-freshness field must move on every run"


def test_corrected_vote_moves_changed_at(cur):
    cur.execute(VOTE_UPSERT_SQL, VOTE)
    _, changed_1 = _stamps(cur, "votes", "vote_id", "VT_CHG")

    cur.execute(VOTE_UPSERT_SQL, {**VOTE, "result": "rejeté", "votes_for": 40})
    _, changed_2 = _stamps(cur, "votes", "vote_id", "VT_CHG")

    assert changed_2 > changed_1
    cur.execute("SELECT result FROM votes WHERE vote_id = 'VT_CHG'")
    assert cur.fetchone()["result"] == "rejeté"


def test_amo10_rerun_neither_marks_nor_wipes_a_resolved_party(cur):
    """The COALESCE comparison, which is the easiest one to get wrong.

    `update_party.py` writes the party after `ingest_deputies.py`, and AMO10
    always supplies NULL for it. Comparing against raw EXCLUDED would mark all
    577 deputies changed on every single run; not mirroring the SET clause's
    COALESCE would wipe the resolved label.
    """
    cur.execute(DEPUTY_UPSERT_SQL, DEPUTY)
    cur.execute(
        "UPDATE deputies SET party = 'Renaissance', party_short = 'RE' WHERE deputy_id = 'PA_CHG'"
    )
    _, changed_1 = _stamps(cur, "deputies", "deputy_id", "PA_CHG")

    cur.execute(DEPUTY_UPSERT_SQL, DEPUTY)
    ingested_2, changed_2 = _stamps(cur, "deputies", "deputy_id", "PA_CHG")

    assert changed_2 == changed_1, "an unchanged deputy must not report as changed"
    cur.execute("SELECT party FROM deputies WHERE deputy_id = 'PA_CHG'")
    assert cur.fetchone()["party"] == "Renaissance", "the resolved party was wiped"
    # The whole reason this table keeps writing ingested_at unconditionally.
    assert ingested_2 is not None


def test_changed_deputy_field_moves_changed_at(cur):
    cur.execute(DEPUTY_UPSERT_SQL, DEPUTY)
    _, changed_1 = _stamps(cur, "deputies", "deputy_id", "PA_CHG")

    cur.execute(DEPUTY_UPSERT_SQL, {**DEPUTY, "department": "Aisne"})
    _, changed_2 = _stamps(cur, "deputies", "deputy_id", "PA_CHG")

    assert changed_2 > changed_1


def test_position_change_tracking(cur):
    cur.execute(DEPUTY_UPSERT_SQL, DEPUTY)
    cur.execute(VOTE_UPSERT_SQL, VOTE)
    cur.execute(POSITION_UPSERT_SQL, POSITION)
    ingested_1, changed_1 = _stamps(cur, "vote_positions", "vote_id", "VT_CHG")

    cur.execute(POSITION_UPSERT_SQL, POSITION)
    ingested_2, changed_2 = _stamps(cur, "vote_positions", "vote_id", "VT_CHG")
    assert changed_2 == changed_1
    assert ingested_2 > ingested_1

    cur.execute(POSITION_UPSERT_SQL, {**POSITION, "position": "contre"})
    _, changed_3 = _stamps(cur, "vote_positions", "vote_id", "VT_CHG")
    assert changed_3 > changed_1


def test_agenda_change_tracking_keeps_last_seen_at_and_the_mon_211_clearing(cur):
    """The agenda statement carries three behaviours that must not interfere.

    `last_seen_at` is stamped on every run (visibility depends on it, ADR-030),
    `summary_plain` is cleared only when `objet_hash` moves (MON-211), and
    `changed_at` moves only on a real change (GH #353).
    """
    cur.execute(AGENDA_UPSERT_SQL, AGENDA)
    cur.execute(
        "UPDATE agenda_items SET summary_plain = 'résumé', theme = 'Économie' "
        "WHERE point_uid = 'PT_CHG'"
    )
    cur.execute("SELECT last_seen_at, changed_at FROM agenda_items WHERE point_uid = 'PT_CHG'")
    row = cur.fetchone()
    seen_1, changed_1 = row["last_seen_at"], row["changed_at"]

    cur.execute(AGENDA_UPSERT_SQL, AGENDA)
    cur.execute(
        "SELECT last_seen_at, changed_at, summary_plain FROM agenda_items "
        "WHERE point_uid = 'PT_CHG'"
    )
    row = cur.fetchone()
    assert row["changed_at"] == changed_1, "an unchanged ODJ point must not report as changed"
    assert row["last_seen_at"] > seen_1, "last_seen_at drives visibility and must always move"
    assert row["summary_plain"] == "résumé", "MON-211 cleared a summary that was still current"

    cur.execute(
        AGENDA_UPSERT_SQL,
        {**AGENDA, "objet": "Un tout autre objet, réécrit en amont", "objet_hash": "hash-b"},
    )
    cur.execute("SELECT changed_at, summary_plain FROM agenda_items WHERE point_uid = 'PT_CHG'")
    row = cur.fetchone()
    assert row["changed_at"] > changed_1
    assert row["summary_plain"] is None, "MON-211 failed to clear a stale summary"
