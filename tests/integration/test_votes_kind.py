"""
Integration test for GET /votes?kind= (#481), through the real app against a
live Postgres: the mart carries no scrutin_kind, so the filter's subquery on
the raw votes table is exactly what a mocked cursor cannot check.

The fixture votes share a theme no other fixture uses, so every request is
scoped to them with `theme=`.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

THEME = "IT-Kind"
KINDS = {
    "VT-KIND-ENSEMBLE": "ensemble",
    "VT-KIND-MOTION": "motion",
    "VT-KIND-AMDT": "amendement",
    "VT-KIND-ARTICLE": "article",
    "VT-KIND-AUTRE": "autre",
    # Not yet classified: counts as `autre`, as on the bill page.
    "VT-KIND-NULL": None,
}

_VOTE_SQL = """
INSERT INTO votes (vote_id, voted_at, vote_title, result, votes_for, votes_against,
                   abstentions, total_voters, scrutin_kind, theme)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_id)s, 'adopté', 10, 5, 1, 16,
        %(scrutin_kind)s, %(theme)s)
ON CONFLICT (vote_id) DO UPDATE SET scrutin_kind = EXCLUDED.scrutin_kind
"""

_MART_SQL = """
INSERT INTO analytics_marts.mart_vote_summary
    (vote_id, voted_at, vote_title, result, votes_for, votes_against, abstentions,
     total_voters, theme)
VALUES (%(vote_id)s, %(voted_at)s, %(vote_id)s, 'adopté', 10, 5, 1, 16, %(theme)s)
ON CONFLICT (vote_id) DO NOTHING
"""


@pytest.fixture(scope="module")
def api(db_conn):
    with db_conn.cursor() as cur:
        for i, (vote_id, kind) in enumerate(KINDS.items()):
            row = {
                "vote_id": vote_id,
                "voted_at": datetime(2026, 6, 1 + i, tzinfo=timezone.utc),
                "scrutin_kind": kind,
                "theme": THEME,
            }
            cur.execute(_VOTE_SQL, row)
            cur.execute(_MART_SQL, row)
    with patch("api.main._warm_sql_pool"), TestClient(app) as client:
        yield client
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM analytics_marts.mart_vote_summary WHERE vote_id LIKE 'VT-KIND-%'")
        cur.execute("DELETE FROM votes WHERE vote_id LIKE 'VT-KIND-%'")


def _ids(api, query: str) -> tuple[int, set[str]]:
    resp = api.get(f"/votes/?theme={THEME}{query}")
    assert resp.status_code == 200
    body = resp.json()
    return body["total"], {item["vote_id"] for item in body["items"]}


@pytest.mark.integration
def test_without_kind_every_scrutin_is_listed(api):
    assert _ids(api, "") == (len(KINDS), set(KINDS))


@pytest.mark.integration
def test_kind_ensemble_keeps_only_whole_texts(api):
    assert _ids(api, "&kind=ensemble") == (1, {"VT-KIND-ENSEMBLE"})


@pytest.mark.integration
def test_several_kinds_combine(api):
    assert _ids(api, "&kind=amendement,article&kind=motion") == (
        3,
        {"VT-KIND-AMDT", "VT-KIND-ARTICLE", "VT-KIND-MOTION"},
    )


@pytest.mark.integration
def test_an_unclassified_scrutin_counts_as_autre(api):
    assert _ids(api, "&kind=autre") == (2, {"VT-KIND-AUTRE", "VT-KIND-NULL"})
