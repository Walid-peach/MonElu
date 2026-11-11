"""
Integration tests for the one definition of a sitting deputy (#682, migration 019).

A deputy who drops out of the AN's active-deputies export (AMO10) with no end
date in the all-mandates export (AMO20) used to keep `mandate_end` NULL and go on
counting as sitting. These run two real ingestion passes against a live Postgres
- the second without that deputy - and check the `deputy_seat_status` view, the
seat counts `GET /groups` reports, and the dbt test that fails the daily gate.
"""

import os
import re
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from scripts import ingest_deputies
from tests.integration.conftest import (
    DEPUTY_A,
    DEPUTY_B,
    DEPUTY_C,
    DEPUTY_D,
    STAMP_ROSTER_SQL,
)

pytestmark = pytest.mark.integration

GHOST = {
    **DEPUTY_A,
    "deputy_id": "PA_GHOST",
    "full_name": "Gaston Fantôme",
    "first_name": "Gaston",
    "last_name": "Fantôme",
    "circonscription": "9ème circonscription du Var",
}
DEPARTED = {
    **DEPUTY_A,
    "deputy_id": "PA_GONE",
    "full_name": "Hélène Partie",
    "first_name": "Hélène",
    "last_name": "Partie",
    "circonscription": "8ème circonscription du Var",
}
ROSTER = [DEPUTY_A, DEPUTY_B, DEPUTY_C, DEPUTY_D]

STAMPS_SQL = (
    "SELECT ingested_at, changed_at, last_listed_at FROM deputies WHERE deputy_id = 'PA002'"
)
DBT_TEST = Path(__file__).parents[2] / "transform/tests/assert_no_unconfirmed_deputy.sql"


def _amo20_acteur(deputy_id: str, end: str | None) -> dict:
    seat = {"typeOrgane": "ASSEMBLEE", "legislature": "17", "dateDebut": "2024-07-07"}
    if end:
        seat["dateFin"] = end
    return {"uid": {"#text": deputy_id}, "mandats": {"mandat": [seat]}}


def _render_dbt_test() -> str:
    """The dbt test's SQL with each `{{ source('raw', 'x') }}` read as public.x."""
    return re.sub(
        r"\{\{\s*source\('raw',\s*'(\w+)'\)\s*\}\}",
        r"public.\1",
        DBT_TEST.read_text(),
    )


def _status(cur) -> dict[str, str]:
    cur.execute("SELECT deputy_id, seat_status FROM deputy_seat_status")
    return {r["deputy_id"]: r["seat_status"] for r in cur.fetchall()}


def _rn_seats(client) -> int:
    groups = client.get("/groups").json()["items"]
    return next(g["seat_count"] for g in groups if g["name"] == "Rassemblement National")


@pytest.fixture
def two_runs(db_conn, monkeypatch):
    """Run 1 lists the ghost and the departed deputy; run 2 lists neither.

    AMO20 dates the departed deputy's end and has none for the ghost.
    """
    monkeypatch.setattr(ingest_deputies, "DATABASE_URL", os.environ["DATABASE_URL"])
    ingest_deputies._upsert_records([*ROSTER, GHOST, DEPARTED])
    ingest_deputies._upsert_records(ROSTER)
    ends = ingest_deputies.close_departed_mandates(
        [d["deputy_id"] for d in ROSTER],
        fetch_all_mandates=lambda: [
            _amo20_acteur("PA_GHOST", None),
            _amo20_acteur("PA_GONE", "2026-09-30"),
        ],
    )
    yield ends
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM deputies WHERE deputy_id IN ('PA_GHOST', 'PA_GONE')")
        cur.execute(STAMP_ROSTER_SQL)


def test_three_states_after_a_deputy_drops_out_of_amo10(db_conn, two_runs):
    assert two_runs == {"PA_GHOST": None, "PA_GONE": "2026-09-30"}
    with db_conn.cursor() as cur:
        status = _status(cur)
        cur.execute("SELECT mandate_end FROM deputies WHERE deputy_id = 'PA_GHOST'")
        assert cur.fetchone()["mandate_end"] is None, "mandate_end is never guessed"

    assert status["PA_GHOST"] == "unconfirmed"
    assert status["PA_GONE"] == "departed"
    assert {status[d["deputy_id"]] for d in ROSTER} == {"sitting"}


@pytest.fixture
def client():
    with patch("api.main._warm_sql_pool"), TestClient(app) as c:
        yield c


def test_unconfirmed_deputy_is_out_of_seat_counts_but_keeps_a_profile(client, two_runs):
    # PA001 and PA004 are the fixture's two RN deputies; the ghost and the
    # departed deputy are RN too and count for neither.
    assert _rn_seats(client) == 2

    active = client.get("/deputies", params={"active": "true", "search": "Fantôme"}).json()
    assert active["total"] == 0
    inactive = client.get("/deputies", params={"active": "false", "search": "Fantôme"}).json()
    assert inactive["total"] == 1

    assert client.get("/deputies/PA_GHOST").status_code == 200


def test_dbt_test_fails_on_the_unconfirmed_deputy_only(db_conn, two_runs):
    with db_conn.cursor() as cur:
        cur.execute(_render_dbt_test())
        assert [r["deputy_id"] for r in cur.fetchall()] == ["PA_GHOST"]


def test_dbt_test_passes_once_every_unlisted_deputy_has_an_end(db_conn, two_runs):
    with db_conn.cursor() as cur:
        cur.execute("UPDATE deputies SET mandate_end = '2026-10-01' WHERE deputy_id = 'PA_GHOST'")
        cur.execute(_render_dbt_test())
        assert cur.fetchall() == []


def test_a_deputy_listed_again_is_sitting_again(db_conn, two_runs, monkeypatch):
    """A returning deputy: the next run lists them and clears nothing by hand."""
    monkeypatch.setattr(ingest_deputies, "DATABASE_URL", os.environ["DATABASE_URL"])
    ingest_deputies._upsert_records([*ROSTER, GHOST])
    with db_conn.cursor() as cur:
        assert _status(cur)["PA_GHOST"] == "sitting"


def test_listing_moves_neither_freshness_nor_change_signal(db_conn, monkeypatch):
    """`last_listed_at` is a third signal; `ingested_at` still moves on every run
    and an unchanged deputy's `changed_at` does not (ADR-039)."""
    monkeypatch.setattr(ingest_deputies, "DATABASE_URL", os.environ["DATABASE_URL"])
    with db_conn.cursor() as cur:
        ingest_deputies._upsert_records(ROSTER)
        cur.execute(STAMPS_SQL)
        first = cur.fetchone()
        ingest_deputies._upsert_records(ROSTER)
        cur.execute(STAMPS_SQL)
        second = cur.fetchone()

    assert second["ingested_at"] > first["ingested_at"]
    assert second["last_listed_at"] > first["last_listed_at"]
    assert second["changed_at"] == first["changed_at"]
