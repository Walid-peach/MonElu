"""
Integration test for GET /election/2027 (#718, ADR-049) against a live Postgres.

The unit tests mock the cursor, so none of the four SQL statements has run. This
runs them for real over whatever the base fixtures hold, and checks the
invariants the app relies on rather than particular numbers.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def api(db_conn):
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


@pytest.mark.integration
def test_the_endpoint_runs_its_queries_and_keeps_its_invariants(api):
    response = api.get("/election/2027")
    assert response.status_code == 200
    body = response.json()

    figures = body["legislature"]
    assert figures["scrutins"] >= len(body["key_votes"])
    assert figures["adopted_texts"] <= figures["scrutins"]
    rate = figures["median_presence_rate"]
    assert rate is None or 0 <= rate <= 1

    margins = [v["margin"] for v in body["key_votes"]]
    assert margins == sorted(margins), "closest first"
    assert all(m >= 0 for m in margins)

    vote_ids = [v["vote_id"] for v in body["key_votes"]]
    for row in body["grid"]:
        assert [c["vote_id"] for c in row["cells"]] == vote_ids
        assert all(c["position"] in {None, "pour", "contre", "abstention"} for c in row["cells"])
    assert "Non inscrit" not in [row["label"] for row in body["grid"]]
