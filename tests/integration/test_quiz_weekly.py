"""
Integration test for GET /quiz/weekly (#724) against a live Postgres.

The quiz-curation thresholds run in SQL, so a mocked cursor cannot check them.
Every fixture scrutin is dated in 1999-2000, before any other fixture, and the
week's cutoff is pinned to 2000-01-10, so only these rows are candidates.
"""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import api.routers.quiz as quiz_module
from api.main import app
from api.quiz_data import QUIZ_QUESTIONS

CUTOFF = date(2000, 1, 10)
PREFIX = "VT-WEEKLY-"
QUIZ_ID = QUIZ_QUESTIONS[0]["vote_id"]
WHOLE_TEXT = "l'ensemble du projet de loi relatif à un sujet"

_VOTE_SQL = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for, votes_against,
                   abstentions, total_voters)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_title)s, 'adopté', %(votes_for)s,
        %(votes_against)s, 0, %(total_voters)s)
"""


def _vote(vote_id, voted_at, vote_title=WHOLE_TEXT, votes_for=300, votes_against=200, voters=500):
    return {
        "vote_id": vote_id,
        "voted_at": voted_at,
        "vote_title": vote_title,
        "votes_for": votes_for,
        "votes_against": votes_against,
        "total_voters": voters,
    }


def _non_qualifying(i, voted_at):
    reason = i % 4
    if reason == 0:
        return _vote(f"{PREFIX}{i:04d}", voted_at, vote_title="l'amendement n°12 à l'article 3")
    if reason == 1:
        return _vote(f"{PREFIX}{i:04d}", voted_at, voters=399)
    if reason == 2:
        return _vote(f"{PREFIX}{i:04d}", voted_at, votes_for=70, votes_against=30)
    return _vote(f"{PREFIX}{i:04d}", voted_at, votes_for=500, votes_against=0)


@pytest.fixture(autouse=True)
def _pinned_week():
    quiz_module._weekly_cache_key = None
    quiz_module._weekly_cache_value = None
    with patch.object(quiz_module, "week_start", return_value=CUTOFF):
        yield
    quiz_module._weekly_cache_key = None
    quiz_module._weekly_cache_value = None


@pytest.fixture
def seed(db_conn):
    inserted_quiz_id = False

    def insert(rows):
        nonlocal inserted_quiz_id
        with db_conn.cursor() as cur:
            for row in rows:
                if row["vote_id"] == QUIZ_ID:
                    cur.execute("SELECT 1 FROM votes WHERE vote_id = %s", (QUIZ_ID,))
                    assert cur.fetchone() is None, "the quiz id must not be a base fixture"
                    inserted_quiz_id = True
                cur.execute(_VOTE_SQL, row)

    yield insert
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM votes WHERE vote_id LIKE %s", (PREFIX + "%",))
        if inserted_quiz_id:
            cur.execute("DELETE FROM votes WHERE vote_id = %s", (QUIZ_ID,))


@pytest.fixture(scope="module")
def api(db_conn):
    with patch("api.main._warm_sql_pool"), TestClient(app) as client:
        yield client


@pytest.mark.integration
def test_an_older_qualifying_scrutin_behind_500_recent_ones_is_found(api, seed):
    newest = datetime(2000, 1, 9, tzinfo=timezone.utc)
    recent = [_non_qualifying(i, newest - timedelta(hours=i)) for i in range(500)]
    older = _vote(f"{PREFIX}OLDER", datetime(1999, 3, 1, tzinfo=timezone.utc))
    seed([*recent, older])

    response = api.get("/quiz/weekly")

    assert response.status_code == 200
    assert response.json()["vote_id"] == older["vote_id"]


@pytest.mark.integration
def test_each_threshold_is_applied_and_the_latest_qualifying_wins(api, seed):
    day = datetime(2000, 1, 9, tzinfo=timezone.utc)
    seed(
        [
            _vote(f"{PREFIX}AFTER", datetime(2000, 1, 10, 9, tzinfo=timezone.utc)),
            _vote(QUIZ_ID, day),
            _vote(f"{PREFIX}AMDT", day - timedelta(hours=1), vote_title="l'article 3"),
            _vote(f"{PREFIX}TURNOUT", day - timedelta(hours=2), voters=399),
            _vote(f"{PREFIX}LOPSIDED", day - timedelta(hours=3), votes_for=66, votes_against=34),
            _vote(
                f"{PREFIX}CURLY",
                day - timedelta(hours=4),
                vote_title="L’ensemble de la proposition de loi",
                votes_for=65,
                votes_against=35,
                voters=400,
            ),
            _vote(f"{PREFIX}OLDER", day - timedelta(days=1)),
        ]
    )

    response = api.get("/quiz/weekly")

    assert response.status_code == 200
    assert response.json()["vote_id"] == f"{PREFIX}CURLY"


@pytest.mark.integration
def test_no_qualifying_scrutin_before_the_cutoff_is_a_404(api, seed):
    seed([_vote(f"{PREFIX}AMDT", datetime(2000, 1, 9, tzinfo=timezone.utc), voters=10)])

    assert api.get("/quiz/weekly").status_code == 404
