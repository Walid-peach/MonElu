"""
Integration test for GET /deputies's surname order (#514), through the real app
against a live Postgres.

The app heads each run of one surname initial with a letter, in the order this
endpoint returns. An accented or lowercase-particle surname that sorts apart
from its base letter makes that letter appear twice, and whether it does depends
on the database's collation - which a mocked cursor cannot show.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

# Every seeded deputy shares this first name, so `search` isolates them from the
# conftest fixtures and the namesakes below differ only by deputy_id.
FIRST = "Testordre"

SURNAMES = {
    "IT-ORD-1": "Zola",
    "IT-ORD-2": "Écrivain",
    "IT-ORD-3": "de Courson",
    "IT-ORD-4": "Dabo",
    "IT-ORD-5": "Erodi",
    "IT-ORD-6": "Abadie",
    "IT-ORD-7": "Martin",
    "IT-ORD-8": "Martin",
}

EXPECTED = ["Abadie", "Dabo", "de Courson", "Écrivain", "Erodi", "Martin", "Martin", "Zola"]

_INSERT = """
INSERT INTO deputies (deputy_id, full_name, first_name, last_name, ingested_at)
VALUES (%s, %s, %s, %s, NOW())
ON CONFLICT (deputy_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name
"""


@pytest.fixture(scope="module")
def seeded(db_conn):
    with db_conn.cursor() as cur:
        for deputy_id, last_name in SURNAMES.items():
            cur.execute(_INSERT, (deputy_id, f"{FIRST} {last_name}", FIRST, last_name))
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM deputies WHERE deputy_id LIKE 'IT-ORD-%'")


@pytest.fixture(scope="module")
def api(seeded):
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


def _roster(api, **params) -> list[dict]:
    resp = api.get("/deputies/", params={"search": FIRST, **params})
    assert resp.status_code == 200
    return resp.json()["items"]


@pytest.mark.integration
def test_fixture_sorts_apart_under_a_byte_collation(db_conn, seeded):
    """Under "C" these surnames do split their letters, so the test below can fail."""
    with db_conn.cursor() as cur:
        cur.execute(
            """SELECT last_name FROM deputies WHERE deputy_id LIKE 'IT-ORD-%%'
               ORDER BY last_name COLLATE "C", deputy_id"""
        )
        byte_order = [r["last_name"] for r in cur.fetchall()]
    assert byte_order.index("Zola") < byte_order.index("de Courson")
    assert byte_order.index("Zola") < byte_order.index("Écrivain")


@pytest.mark.integration
def test_accented_and_particle_surnames_sort_with_their_letter(api):
    assert [d["last_name"] for d in _roster(api)] == EXPECTED


@pytest.mark.integration
def test_offset_paging_walks_namesakes_once_each(api):
    walked = [_roster(api, limit=1, offset=i)[0]["deputy_id"] for i in range(len(SURNAMES))]
    assert sorted(walked) == sorted(SURNAMES)
    assert walked.index("IT-ORD-7") < walked.index("IT-ORD-8")
