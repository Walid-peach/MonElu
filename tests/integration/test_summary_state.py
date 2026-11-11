"""
The vote summary lifecycle against a real Postgres (#681).

Two halves. Migration 018 derives every vote's `summary_state` from the columns
that encoded it before, so it is applied here to a database built up to 017 and
seeded with each old combination. Then the transition statements run on the
migrated schema, where its CHECK constraints refuse an inconsistent row.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse, urlunparse

import psycopg2
import psycopg2.errors
import psycopg2.extras
import pytest

from scripts import migrate
from scripts._summaries import SQL_QUEUE_MOTIONS, queue_sourced_votes
from scripts.generate_vote_summaries import (
    FAIL,
    PUBLISH,
    REJECT,
    SQL_RETRY_REJECTED,
    SQL_TRANSITIONS,
)

pytestmark = pytest.mark.integration

SCRATCH_DB = "monelu_it_summary_state"
MIGRATION = "018_summary_state.sql"

# (vote_id, scrutin_kind, summary_plain, summary_basis, source table) -> state after 018
LEGACY_ROWS = [
    ("V-PUB-TEXT", "amendement", "Rendre obligatoire.", "official_text", "vote_amendments"),
    ("V-PUB-MOTION", "motion", "Le Gouvernement reste en place.", "procedure", None),
    ("V-REJ", "article", None, "rejected", "vote_articles"),
    ("V-Q-AMDT", "amendement", None, None, "vote_amendments"),
    ("V-Q-ART", "article", None, None, "vote_articles"),
    ("V-Q-BILL", "ensemble", None, None, "vote_bills"),
    ("V-Q-AUTRE", "autre", None, None, "vote_bills"),
    ("V-Q-MOTION", "motion", None, None, None),
    ("V-NS-AMDT", "amendement", None, None, None),
    ("V-NS-ART", "article", None, None, None),
    ("V-NS-BILL", "ensemble", None, None, None),
    ("V-NS-TITLE-ONLY", "ensemble", "Résumé écrit d'après le titre.", None, None),
    ("V-NS-NULL-KIND", None, None, None, None),
    # A text row of another kind's table does not queue a vote.
    ("V-NS-WRONG-TABLE", "amendement", None, None, "vote_bills"),
]
EXPECTED = {
    "V-PUB-TEXT": ("published", "official_text", None),
    "V-PUB-MOTION": ("published", "procedure", None),
    "V-REJ": ("rejected", None, "unrecorded"),
    "V-Q-AMDT": ("queued", None, None),
    "V-Q-ART": ("queued", None, None),
    "V-Q-BILL": ("queued", None, None),
    "V-Q-AUTRE": ("queued", None, None),
    "V-Q-MOTION": ("queued", None, None),
    "V-NS-AMDT": ("no_source", None, None),
    "V-NS-ART": ("no_source", None, None),
    "V-NS-BILL": ("no_source", None, None),
    "V-NS-TITLE-ONLY": ("no_source", None, None),
    "V-NS-NULL-KIND": ("no_source", None, None),
    "V-NS-WRONG-TABLE": ("no_source", None, None),
}

SOURCE_INSERTS = {
    "vote_amendments": (
        "INSERT INTO vote_amendments (vote_id, amendment_uid, dispositif) VALUES (%s, 'AMD', 'x')"
    ),
    "vote_articles": (
        "INSERT INTO vote_articles (vote_id, text_uid, article_label, article_text) "
        "VALUES (%s, 'TXT', 'Article 1', 'x')"
    ),
    "vote_bills": "INSERT INTO vote_bills (vote_id, text_uid, bill_text) VALUES (%s, 'TXT', 'x')",
}


def _insert_vote(cur, vote_id, kind, summary=None, basis=None):
    cur.execute(
        "INSERT INTO votes (vote_id, voted_at, vote_title, result, scrutin_kind, "
        "summary_plain, summary_basis) VALUES (%s, NOW(), %s, 'adopté', %s, %s, %s)",
        (vote_id, vote_id, kind, summary, basis),
    )


def _states(cur, prefix: str) -> dict[str, tuple]:
    cur.execute(
        "SELECT vote_id, summary_state, summary_basis, summary_rejection_reason "
        "FROM votes WHERE vote_id LIKE %s",
        (f"{prefix}%",),
    )
    return {
        r["vote_id"]: (r["summary_state"], r["summary_basis"], r["summary_rejection_reason"])
        for r in cur.fetchall()
    }


@pytest.fixture(scope="module")
def scratch_url(db_conn):
    """A database of its own, so 001-017 can be applied without 018."""
    base = os.environ["DATABASE_URL"]
    with db_conn.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB}")
        cur.execute(f"CREATE DATABASE {SCRATCH_DB}")
    yield urlunparse(urlparse(base)._replace(path=f"/{SCRATCH_DB}"))
    with db_conn.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB} WITH (FORCE)")


def test_the_migration_gives_every_old_combination_its_state(scratch_url):
    files = migrate.migration_files()
    index = [os.path.basename(f) for f in files].index(MIGRATION)
    conn = psycopg2.connect(scratch_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        migrate.apply_migrations(conn, files[:index])
        with conn, conn.cursor() as cur:
            for vote_id, kind, summary, basis, table in LEGACY_ROWS:
                _insert_vote(cur, vote_id, kind, summary, basis)
                if table:
                    cur.execute(SOURCE_INSERTS[table], (vote_id,))
        migrate.apply_migrations(conn, files[index : index + 1])
        with conn, conn.cursor() as cur:
            assert _states(cur, "V-") == EXPECTED
            cur.execute("SELECT COUNT(*) AS n FROM votes WHERE summary_state IS NULL")
            assert cur.fetchone()["n"] == 0
            cur.execute("SELECT summary_plain FROM votes WHERE vote_id = 'V-NS-TITLE-ONLY'")
            assert cur.fetchone()["summary_plain"] == "Résumé écrit d'après le titre."
    finally:
        conn.close()


@pytest.fixture()
def tx(db_conn):
    """A connection whose writes are rolled back: the queue statements are table-wide."""
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor
    )
    try:
        with conn.cursor() as cur:
            yield cur
    finally:
        conn.rollback()
        conn.close()


class TestTransitions:
    def test_a_text_row_queues_only_votes_of_its_kind(self, tx):
        _insert_vote(tx, "ST-AMDT", "amendement")
        _insert_vote(tx, "ST-BILL", "amendement")
        tx.execute(SOURCE_INSERTS["vote_amendments"], ("ST-AMDT",))
        tx.execute(SOURCE_INSERTS["vote_bills"], ("ST-BILL",))
        queue_sourced_votes(tx, "vote_amendments")
        queue_sourced_votes(tx, "vote_bills")
        states = _states(tx, "ST-")
        assert states["ST-AMDT"][0] == "queued"
        assert states["ST-BILL"][0] == "no_source"

    def test_a_motion_is_queued_without_a_source(self, tx):
        _insert_vote(tx, "ST-MOTION", "motion")
        _insert_vote(tx, "ST-ENSEMBLE", "ensemble")
        tx.execute(SQL_QUEUE_MOTIONS)
        states = _states(tx, "ST-")
        assert (states["ST-MOTION"][0], states["ST-ENSEMBLE"][0]) == ("queued", "no_source")

    def test_queueing_never_reopens_a_published_or_rejected_summary(self, tx):
        _insert_vote(tx, "ST-PUB", "motion")
        _insert_vote(tx, "ST-REJ", "motion")
        tx.execute(SQL_QUEUE_MOTIONS)
        tx.execute(
            SQL_TRANSITIONS[PUBLISH],
            {"vote_id": "ST-PUB", "summary": "S.", "theme": None, "basis": "procedure"},
        )
        tx.execute(
            SQL_TRANSITIONS[REJECT],
            {"vote_id": "ST-REJ", "theme": None, "reason": "unknown_motion"},
        )
        tx.execute(SQL_QUEUE_MOTIONS)
        assert _states(tx, "ST-") == {
            "ST-PUB": ("published", "procedure", None),
            "ST-REJ": ("rejected", None, "unknown_motion"),
        }

    def test_a_failure_counts_an_attempt_and_stays_queued(self, tx):
        _insert_vote(tx, "ST-FAIL", "motion")
        tx.execute(SQL_QUEUE_MOTIONS)
        tx.execute(SQL_TRANSITIONS[FAIL], {"vote_id": "ST-FAIL"})
        tx.execute(SQL_TRANSITIONS[FAIL], {"vote_id": "ST-FAIL"})
        tx.execute("SELECT summary_state, summary_attempts FROM votes WHERE vote_id = 'ST-FAIL'")
        assert dict(tx.fetchone()) == {"summary_state": "queued", "summary_attempts": 2}

    def test_retry_rejected_queues_a_refusal_again(self, tx):
        _insert_vote(tx, "ST-RETRY", "motion")
        tx.execute(SQL_QUEUE_MOTIONS)
        tx.execute(SQL_TRANSITIONS[FAIL], {"vote_id": "ST-RETRY"})
        tx.execute(
            SQL_TRANSITIONS[REJECT], {"vote_id": "ST-RETRY", "theme": None, "reason": "guess"}
        )
        tx.execute(SQL_RETRY_REJECTED)
        tx.execute(
            "SELECT summary_state, summary_rejection_reason, summary_attempts "
            "FROM votes WHERE vote_id = 'ST-RETRY'"
        )
        assert dict(tx.fetchone()) == {
            "summary_state": "queued",
            "summary_rejection_reason": None,
            "summary_attempts": 0,
        }

    @pytest.mark.parametrize(
        "update",
        [
            "summary_state = 'published'",  # published with no basis
            "summary_basis = 'official_text'",  # a basis on a summary not published
            "summary_state = 'rejected'",  # rejected with no reason
            "summary_basis = 'rejected'",  # the retired basis value
            "summary_state = 'failed'",
        ],
    )
    def test_the_schema_refuses_an_inconsistent_row(self, tx, update):
        _insert_vote(tx, "ST-BAD", "ensemble")
        tx.execute("SAVEPOINT bad")
        with pytest.raises(psycopg2.errors.CheckViolation):
            tx.execute(f"UPDATE votes SET {update} WHERE vote_id = 'ST-BAD'")
        tx.execute("ROLLBACK TO SAVEPOINT bad")
