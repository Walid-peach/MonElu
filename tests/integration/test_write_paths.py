"""
The API's write paths against a real Postgres (#673).

Until the integration database was built by scripts/migrate.py, the tables these
statements write to never existed in this tier, so their SQL had only ever run
against a mocked cursor. A wrong column, a JSON value Postgres refuses or a
broken ON CONFLICT target is invisible to a mock; here each statement runs on
the real schema and is read back.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.auth import record_usage
from api.main import app
from api.quiz_data import QUIZ_QUESTIONS

QUIZ_VOTE_IDS = [q["vote_id"] for q in QUIZ_QUESTIONS[:3]]

_LLM_KEYS = {
    "GROQ_API_KEY": "gsk_test_not_a_real_key",  # pragma: allowlist secret
    "OPENAI_API_KEY": "sk-test-not-a-real-key",  # pragma: allowlist secret
}


@pytest.fixture(scope="module")
def client(db_conn):
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


def _one(db_conn, sql: str, params=()) -> dict:
    with db_conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


@pytest.mark.integration
def test_chat_share_is_stored_and_read_back(client, db_conn):
    body = {
        "question": "Qui a voté contre la loi de test ?",
        "answer": "Réponse de test.",
        "sources": [
            {"content": "Vote de test.", "metadata": {"vote_id": "VT-TEST-1"}, "similarity": 0.81}
        ],
        "confidence": "ÉLEVÉ",
        "data_source": "rag",
        "caveat": None,
    }
    resp = client.post("/search/share", json=body)
    assert resp.status_code == 200, resp.text
    share_id = resp.json()["id"]

    row = _one(db_conn, "SELECT * FROM chat_shares WHERE id = %s", (share_id,))
    assert row["question"] == body["question"]
    assert row["sources"][0]["metadata"]["vote_id"] == "VT-TEST-1"

    read = client.get(f"/search/share/{share_id}")
    assert read.status_code == 200
    assert read.json()["answer"] == body["answer"]


@pytest.mark.integration
def test_verification_is_stored_and_read_back(client, db_conn):
    chain_result = {
        "claim": "Ada Martin a voté contre la loi de test",
        "verdict": "faux",
        "explanation": "Le scrutin cité montre un vote pour.",
        "deputy": {"deputy_id": "PA001", "name": "Ada Martin", "party": "Test"},
        "citations": [
            {
                "vote_id": "VT-TEST-1",
                "title": "Vote de test",
                "voted_at": "2026-01-05",
                "result": "adopté",
                "deputy_position": "pour",
            }
        ],
        "confidence": "ÉLEVÉ",
        "data_horizon": "2025-07-01",
    }
    with (
        patch("api.routers.verify.verify_claim", return_value=dict(chain_result)),
        patch.dict("os.environ", _LLM_KEYS),
    ):
        resp = client.post("/verify/", json={"claim": chain_result["claim"]})
    assert resp.status_code == 200, resp.text
    verification_id = resp.json()["id"]

    row = _one(db_conn, "SELECT * FROM verifications WHERE id = %s", (verification_id,))
    assert row["verdict"] == "faux"
    assert row["deputy"]["deputy_id"] == "PA001"
    assert row["citations"][0]["deputy_position"] == "pour"

    read = client.get(f"/verify/{verification_id}")
    assert read.status_code == 200
    assert read.json()["citations"][0]["vote_id"] == "VT-TEST-1"


@pytest.fixture
def quiz_votes(db_conn):
    """The first three curated quiz scrutins, with one deputy's positions on them."""
    with db_conn.cursor() as cur:
        for vote_id, position in zip(QUIZ_VOTE_IDS, ("pour", "contre", "abstention"), strict=True):
            cur.execute(
                "INSERT INTO votes (vote_id, voted_at, vote_title, result) "
                "VALUES (%s, '2026-01-05', 'Vote de test quiz', 'adopté') "
                "ON CONFLICT (vote_id) DO NOTHING",
                (vote_id,),
            )
            cur.execute(
                "INSERT INTO vote_positions (vote_id, deputy_id, position) "
                "VALUES (%s, 'PA001', %s) ON CONFLICT (vote_id, deputy_id) DO NOTHING",
                (vote_id, position),
            )
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM vote_positions WHERE vote_id = ANY(%s)", (QUIZ_VOTE_IDS,))
        cur.execute(
            "DELETE FROM votes WHERE vote_id = ANY(%s) AND vote_title = 'Vote de test quiz'",
            (QUIZ_VOTE_IDS,),
        )


@pytest.mark.integration
def test_quiz_share_is_stored_and_read_back(client, db_conn, quiz_votes):
    answers = [
        {"vote_id": vote_id, "position": position}
        for vote_id, position in zip(QUIZ_VOTE_IDS, ("pour", "contre", "abstention"), strict=True)
    ]
    resp = client.post("/quiz/share", json={"answers": answers})
    assert resp.status_code == 200, resp.text
    share_id = resp.json()["id"]

    row = _one(db_conn, "SELECT * FROM quiz_shares WHERE id = %s", (share_id,))
    top = row["result"]["top_matches"][0]
    assert top["deputy_id"] == "PA001"
    assert top["agreement_pct"] == 100.0
    # No opt-in, so the stored snapshot carries neither answers nor themes (ADR-028).
    assert "answers" not in row["result"]
    assert "themes" not in row["result"]

    read = client.get(f"/quiz/share/{share_id}")
    assert read.status_code == 200
    assert read.json()["result"]["top_matches"][0]["deputy_id"] == "PA001"


@pytest.fixture
def marker(db_conn):
    """A text unique to this run, so rows left by an earlier run never match."""
    value = f"Test feedback #673 {uuid.uuid4()}"
    yield value
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM feedback WHERE payload->>'answer' = %s OR payload->>'message' = %s",
            (value, value),
        )


@pytest.mark.integration
def test_chat_feedback_and_error_report_are_stored(client, db_conn, marker):
    resp = client.post(
        "/feedback/chat",
        json={"vote": "down", "question": "Question de test", "answer": marker, "sources": []},
    )
    assert resp.status_code == 200, resp.text
    resp = client.post(
        "/feedback/report",
        json={"entity_type": "vote", "entity_id": "VT-TEST-1", "message": marker},
    )
    assert resp.status_code == 200, resp.text

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT type, payload FROM feedback "
            "WHERE payload->>'answer' = %s OR payload->>'message' = %s ORDER BY id",
            (marker, marker),
        )
        rows = cur.fetchall()
    assert [r["type"] for r in rows] == ["chat", "report"]
    assert rows[0]["payload"]["vote"] == "down"
    assert rows[1]["payload"]["entity_id"] == "VT-TEST-1"


@pytest.fixture
def api_key_id(db_conn):
    row = _one(
        db_conn,
        "INSERT INTO api_keys (key_hash, label) VALUES ('test-hash-673', 'test #673') RETURNING id",
    )
    yield row["id"]
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM api_key_usage WHERE api_key_id = %s", (row["id"],))
        cur.execute("DELETE FROM api_keys WHERE id = %s", (row["id"],))


@pytest.mark.integration
def test_record_usage_counts_each_request_per_key_endpoint_and_day(client, db_conn, api_key_id):
    # record_usage swallows every error into a warning, so a broken statement would
    # simply stop counting: the count read back is the only proof it works.
    with patch("api.auth.logger") as logger:
        record_usage(api_key_id, "/votes")
        record_usage(api_key_id, "/votes")
        record_usage(api_key_id, "/deputies")
    logger.warning.assert_not_called()

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT endpoint, day = CURRENT_DATE AS today, request_count "
            "FROM api_key_usage WHERE api_key_id = %s ORDER BY endpoint",
            (api_key_id,),
        )
        rows = cur.fetchall()
    assert [(r["endpoint"], r["today"], r["request_count"]) for r in rows] == [
        ("/deputies", True, 1),
        ("/votes", True, 2),
    ]


@pytest.mark.integration
def test_every_migration_is_in_the_ledger(db_conn):
    """The integration database is built from the whole chain, so nothing is skipped."""
    from scripts.migrate import migration_files

    with db_conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations")
        applied = {r["filename"] for r in cur.fetchall()}
    assert {f.rsplit("/", 1)[-1] for f in migration_files()} <= applied
