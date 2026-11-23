"""
Integration tests for the routes that degrade without the dbt marts (#723, #722).

The marts are absent on every fresh deploy until `dbt run` finishes. These tests
hide the `analytics_marts` schema for real, so the mart read raises the same
`UndefinedTable` it raises in production, and check each page still answers 200
on one connection with only its mart fields null. They also check that
`GET /groups/{slug}` reads no more vote rows than it returns, and returns what
the former full scan sorted in Python returned.
"""

from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api import db
from api.main import app
from api.routers.groups import SQL_GROUP_VOTES
from scripts.ingest_dossiers import UPSERT_DOSSIER_SQL

GROUP = "/groups/rassemblement-national"
DEPARTMENT = "/departments/83"
LOI = "IT-MARTS-ABSENT"
LOI_VOTE = "VT-MARTS-ABSENT"


@pytest.fixture(scope="module")
def seeded(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            UPSERT_DOSSIER_SQL,
            {
                "dossier_uid": LOI,
                "legislature": "17",
                "titre": "Loi de test sans marts",
                "titre_chemin": None,
                "procedure_code": "2",
                "procedure_label": "Proposition de loi ordinaire",
                "initiateur": "PA001",
                "status": "en_commission",
                "status_label": None,
                "current_stage": "AN1",
                "parcours_start": "2026-04-01",
                "parcours_end": "2026-06-01",
            },
        )
        cur.execute("UPDATE dossiers SET has_scrutins = TRUE WHERE dossier_uid = %s", (LOI,))
        cur.execute(
            """
            INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for,
                               votes_against, abstentions, total_voters, dossier_id,
                               scrutin_kind)
            VALUES (%s, '2026-05-01T12:00:00Z', 'Ensemble de la loi de test', 'adopté',
                    10, 5, 1, 16, %s, 'ensemble')
            ON CONFLICT (vote_id) DO NOTHING
            """,
            (LOI_VOTE, LOI),
        )
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM votes WHERE vote_id = %s", (LOI_VOTE,))
        cur.execute("DELETE FROM dossiers WHERE dossier_uid = %s", (LOI,))


@pytest.fixture(scope="module")
def api(seeded):
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


@contextmanager
def marts_hidden(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("ALTER SCHEMA analytics_marts RENAME TO analytics_marts_hidden")
    try:
        yield
    finally:
        with db_conn.cursor() as cur:
            cur.execute("ALTER SCHEMA analytics_marts_hidden RENAME TO analytics_marts")


@contextmanager
def counting_connections():
    real = db._pool.getconn
    calls = []

    def getconn(*args, **kwargs):
        calls.append(1)
        return real(*args, **kwargs)

    with patch.object(db._pool, "getconn", side_effect=getconn):
        yield calls


@pytest.mark.integration
def test_group_reads_the_marts_when_present(api):
    member = next(m for m in api.get(GROUP).json()["members"] if m["deputy_id"] == "PA001")
    assert member["presence_rate"] == 1.0


@pytest.mark.integration
def test_every_degrading_page_answers_without_the_marts(api, db_conn):
    with marts_hidden(db_conn), counting_connections() as connections:
        group = api.get(GROUP)
        department = api.get(DEPARTMENT)
        loi = api.get(f"/lois/{LOI}")
        election = api.get("/election/2027")

    assert [r.status_code for r in (group, department, loi, election)] == [200] * 4
    assert len(connections) == 4, "one connection per request, none for the mart alone"

    body = group.json()
    assert body["avg_presence_rate"] is None and body["avg_dissident_rate"] is None
    assert all(m["presence_rate"] is None for m in body["members"])
    assert body["most_dissident_members"] == []
    assert body["recent_scrutins"], "the raw-table lists still load after the mart read"

    body = department.json()
    assert body["deputy_count"] == 2
    assert body["avg_presence_rate"] is None and body["most_dissident"] is None
    assert all(d["presence_rate"] is None for d in body["deputies"])

    scrutins = loi.json()["unattached_scrutins"]
    assert [s["vote_id"] for s in scrutins] == [LOI_VOTE]

    assert election.json()["legislature"]["median_presence_rate"] is None


def _full_scan(db_conn, deputy_ids, divided_limit, recent_limit):
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT v.vote_id, v.voted_at,
                   COUNT(*) FILTER (WHERE vp.position = 'pour')   AS pour,
                   COUNT(*) FILTER (WHERE vp.position = 'contre') AS contre
            FROM vote_positions vp
            JOIN votes v ON v.vote_id = vp.vote_id
            WHERE vp.deputy_id = ANY(%s)
              AND vp.position IN ('pour', 'contre', 'abstention')
            GROUP BY v.vote_id, v.voted_at
            ORDER BY v.voted_at DESC NULLS LAST, v.vote_id DESC
            """,
            (deputy_ids,),
        )
        rows = cur.fetchall()
    divided = sorted(
        (r for r in rows if r["pour"] > 0 and r["contre"] > 0),
        key=lambda r: min(r["pour"], r["contre"]),
        reverse=True,
    )[:divided_limit]
    return [r["vote_id"] for r in divided], [r["vote_id"] for r in rows[:recent_limit]]


@pytest.mark.integration
@pytest.mark.parametrize("divided_limit,recent_limit", [(2, 3), (10, 10), (50, 1)])
def test_group_vote_lists_match_the_full_scan(api, db_conn, divided_limit, recent_limit):
    body = api.get(
        GROUP,
        params={"divided_votes_limit": divided_limit, "recent_scrutins_limit": recent_limit},
    ).json()
    deputy_ids = [m["deputy_id"] for m in body["members"]]
    divided, recent = _full_scan(db_conn, deputy_ids, divided_limit, recent_limit)
    assert [v["vote_id"] for v in body["divided_votes"]] == divided
    assert [v["vote_id"] for v in body["recent_scrutins"]] == recent

    with db_conn.cursor() as cur:
        cur.execute(
            SQL_GROUP_VOTES,
            {
                "deputy_ids": deputy_ids,
                "divided_limit": divided_limit,
                "recent_limit": recent_limit,
            },
        )
        assert len(cur.fetchall()) == len(set(divided) | set(recent))
