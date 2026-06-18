"""
Shared fixtures for integration tests.

Requires a live Postgres 15 + pgvector instance reachable via DATABASE_URL.
In CI this is provided by the `services: postgres` block in ci.yml.
Locally: `make start && make migrate` then run tests.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
import psycopg2.extras
import pytest

MIGRATIONS = [
    Path(__file__).parents[2] / "data" / "migrations" / "001_init.sql",
    Path(__file__).parents[2] / "data" / "migrations" / "002_vote_summaries.sql",
    Path(__file__).parents[2] / "data" / "migrations" / "003_schema_cleanup.sql",
]

# Minimal mart stub DDL — mirrors the columns read by api/routers/deputies.py
# and api/routers/votes.py without running dbt.
_MART_DDL = """
CREATE SCHEMA IF NOT EXISTS analytics_marts;

CREATE TABLE IF NOT EXISTS analytics_marts.mart_deputy_scorecard (
    deputy_id        TEXT PRIMARY KEY,
    full_name        TEXT,
    total_votes_cast INTEGER,
    total_nonvotant  INTEGER,
    presence_rate    NUMERIC,
    total_pour       INTEGER,
    total_contre     INTEGER,
    total_abstention INTEGER,
    votes_for_pct    NUMERIC,
    abstention_pct   NUMERIC
);

CREATE TABLE IF NOT EXISTS analytics_marts.mart_vote_summary (
    vote_id       TEXT PRIMARY KEY,
    voted_at      TIMESTAMPTZ,
    vote_title    TEXT,
    vote_type     TEXT,
    result        TEXT,
    votes_for     INTEGER,
    votes_against INTEGER,
    abstentions   INTEGER,
    total_voters  INTEGER,
    summary_plain TEXT,
    theme         TEXT
);
"""

# Fixture data ---------------------------------------------------------------

DEPUTY_A = {
    "deputy_id": "PA001",
    "full_name": "Alice Martin",
    "first_name": "Alice",
    "last_name": "Martin",
    "party": "Rassemblement National",
    "party_short": "RN",
    "circonscription": "1ère circonscription du Var",
    "department": "Var",
    "mandate_start": "2024-07-07",
    "mandate_end": None,
    "photo_url": None,
}

DEPUTY_B = {
    "deputy_id": "PA002",
    "full_name": "Bernard Dupont",
    "first_name": "Bernard",
    "last_name": "Dupont",
    "party": "La France Insoumise",
    "party_short": "LFI",
    "circonscription": "2ème circonscription du Nord",
    "department": "Nord",
    "mandate_start": "2024-07-07",
    "mandate_end": None,
    "photo_url": None,
}

DEPUTY_C = {
    "deputy_id": "PA003",
    "full_name": "Claire Dubois",
    "first_name": "Claire",
    "last_name": "Dubois",
    "party": "Renaissance",
    "party_short": "RE",
    "circonscription": "3ème circonscription de Paris",
    "department": "Paris",
    "mandate_start": "2024-07-07",
    "mandate_end": None,
    "photo_url": None,
}

_DEPUTY_UPSERT = """
INSERT INTO deputies (
    deputy_id, full_name, first_name, last_name,
    party, party_short, circonscription, department,
    mandate_start, mandate_end, photo_url, ingested_at
) VALUES (
    %(deputy_id)s, %(full_name)s, %(first_name)s, %(last_name)s,
    %(party)s, %(party_short)s, %(circonscription)s, %(department)s,
    %(mandate_start)s, %(mandate_end)s, %(photo_url)s, NOW()
)
ON CONFLICT (deputy_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    party     = EXCLUDED.party
"""


def _make_vote(i: int, result: str = "adopté") -> dict:
    from datetime import datetime, timezone

    ts = datetime(2026, 1, i + 1, 12, 0, 0, tzinfo=timezone.utc)
    return {
        "vote_id": f"VTANR5L17V{i:04d}",
        "voted_at": ts,
        "vote_title": f"Vote de test numéro {i}",
        "vote_type": "SPO",
        "result": result,
        "votes_for": 300 if result == "adopté" else 100,
        "votes_against": 100 if result == "adopté" else 300,
        "abstentions": 50,
        "total_voters": 450,
        "dossier_id": None,
    }


_VOTE_UPSERT = """
INSERT INTO votes (
    vote_id, voted_at, vote_title, vote_type, result,
    votes_for, votes_against, abstentions, total_voters,
    dossier_id, ingested_at
) VALUES (
    %(vote_id)s, %(voted_at)s, %(vote_title)s, %(vote_type)s, %(result)s,
    %(votes_for)s, %(votes_against)s, %(abstentions)s, %(total_voters)s,
    %(dossier_id)s, NOW()
)
ON CONFLICT (vote_id) DO UPDATE SET
    result      = EXCLUDED.result,
    ingested_at = NOW()
"""

_POSITION_UPSERT = """
INSERT INTO vote_positions (vote_id, deputy_id, position, ingested_at)
VALUES (%(vote_id)s, %(deputy_id)s, %(position)s, NOW())
ON CONFLICT (vote_id, deputy_id) DO UPDATE SET
    position    = EXCLUDED.position,
    ingested_at = NOW()
"""


@pytest.fixture(scope="session")
def db_conn():
    """Session-scoped raw psycopg2 connection to the test database."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set — skipping integration tests")

    conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True

    # Apply all migrations (idempotent — IF NOT EXISTS throughout)
    with conn.cursor() as cur:
        for migration in MIGRATIONS:
            cur.execute(migration.read_text())

    # Create mart stubs (dbt not available in CI integration tier)
    with conn.cursor() as cur:
        cur.execute(_MART_DDL)

    # Seed base fixtures used by most tests
    with conn.cursor() as cur:
        for deputy in (DEPUTY_A, DEPUTY_B, DEPUTY_C):
            cur.execute(_DEPUTY_UPSERT, deputy)

        votes = [_make_vote(i, "adopté" if i % 3 != 0 else "rejeté") for i in range(1, 26)]
        for v in votes:
            cur.execute(_VOTE_UPSERT, v)

        # Seed positions: PA001 voted pour on every vote, PA002 voted contre
        for v in votes:
            cur.execute(
                _POSITION_UPSERT,
                {"vote_id": v["vote_id"], "deputy_id": "PA001", "position": "pour"},
            )
            cur.execute(
                _POSITION_UPSERT,
                {"vote_id": v["vote_id"], "deputy_id": "PA002", "position": "contre"},
            )

        # Seed mart_vote_summary mirror for pagination / scorecard tests
        for v in votes:
            cur.execute(
                """
                INSERT INTO analytics_marts.mart_vote_summary
                    (vote_id, voted_at, vote_title, vote_type, result,
                     votes_for, votes_against, abstentions, total_voters)
                VALUES (%(vote_id)s, %(voted_at)s, %(vote_title)s, %(vote_type)s,
                        %(result)s, %(votes_for)s, %(votes_against)s,
                        %(abstentions)s, %(total_voters)s)
                ON CONFLICT (vote_id) DO UPDATE SET result = EXCLUDED.result
                """,
                v,
            )

        # Seed mart_deputy_scorecard for scorecard tests
        cur.execute(
            """
            INSERT INTO analytics_marts.mart_deputy_scorecard
                (deputy_id, full_name, total_votes_cast, total_nonvotant,
                 presence_rate, total_pour, total_contre, total_abstention,
                 votes_for_pct, abstention_pct)
            VALUES ('PA001', 'Alice Martin', 25, 0, 1.0, 25, 0, 0, 1.0, 0.0)
            ON CONFLICT (deputy_id) DO NOTHING
            """
        )

    yield conn

    # Teardown — truncate all data so the schema can be reused by other test runs
    with conn.cursor() as cur:
        cur.execute("TRUNCATE analytics_marts.mart_vote_summary CASCADE")
        cur.execute("TRUNCATE analytics_marts.mart_deputy_scorecard CASCADE")
        cur.execute("TRUNCATE vote_positions CASCADE")
        cur.execute("TRUNCATE votes CASCADE")
        cur.execute("TRUNCATE deputies CASCADE")

    conn.close()
