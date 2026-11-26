"""
Integration test for GET /deputies's name search (#739), through the real app
against a live Postgres with the migration chain applied.

People type names on a phone without accents, so `search` must ignore accents
as well as case. Whether it does depends on the `unaccent` extension and the
`public.f_unaccent` wrapper migration 021 creates, which a mocked cursor cannot
show.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

DEPUTIES = {
    "IT-SRCH-1": ("Nadège", "Testrecherche-Abomangoli"),
    "IT-SRCH-2": ("Éric", "Testrecherche"),
    "IT-SRCH-3": ("Anne", "Testrecherche d'Ornano"),
}

_INSERT = """
INSERT INTO deputies (deputy_id, full_name, first_name, last_name, ingested_at)
VALUES (%s, %s, %s, %s, NOW())
ON CONFLICT (deputy_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name
"""


@pytest.fixture(scope="module")
def api(db_conn):
    with db_conn.cursor() as cur:
        for deputy_id, (first, last) in DEPUTIES.items():
            cur.execute(_INSERT, (deputy_id, f"{first} {last}", first, last))
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM deputies WHERE deputy_id LIKE 'IT-SRCH-%'")


def _found(api, search: str) -> set[str]:
    resp = api.get("/deputies/", params={"search": search})
    assert resp.status_code == 200
    body = resp.json()
    ids = {d["deputy_id"] for d in body["items"] if d["deputy_id"].startswith("IT-SRCH-")}
    assert body["total"] >= len(ids)
    return ids


@pytest.mark.integration
@pytest.mark.parametrize("search", ["nadege", "NADEGE", "Nadège", "NADÈGE", "nadège test"])
def test_accents_and_case_do_not_matter(api, search):
    assert _found(api, search) == {"IT-SRCH-1"}


@pytest.mark.integration
def test_an_accented_initial_is_found_unaccented(api):
    assert _found(api, "eric testrecherche") == {"IT-SRCH-2"}


@pytest.mark.integration
def test_hyphens_and_apostrophes_still_match_as_typed(api):
    assert _found(api, "testrecherche-abomangoli") == {"IT-SRCH-1"}
    assert _found(api, "testrecherche abomangoli") == set()
    assert _found(api, "d'ornano") == {"IT-SRCH-3"}
    assert _found(api, "d ornano") == set()


@pytest.mark.integration
def test_the_wrapper_is_immutable(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT provolatile FROM pg_proc WHERE oid = 'public.f_unaccent(text)'::regprocedure"
        )
        assert cur.fetchone()["provolatile"] == "i"
