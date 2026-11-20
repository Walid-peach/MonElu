"""
Unit tests for api/routers/election.py and the election block of
`GET /app/config` (#718, ADR-049) - no database.

The ranking, the majority rule and the calendar arithmetic are pure and are
pinned here; the HTTP path runs against a mocked cursor.
"""

from datetime import date, datetime, timezone

import pytest

import api.app_config_data as cfg
from api.routers import election
from api.routers.election import build_grid, kind_label, majority_position, margin_of, to_key_vote


def _vote(vote_id="V1", kind="ensemble", title="l'ensemble du projet", pour=290, contre=288):
    return {
        "vote_id": vote_id,
        "voted_at": datetime(2026, 7, 21, tzinfo=timezone.utc),
        "vote_title": title,
        "result": "adopté",
        "scrutin_kind": kind,
        "votes_for": pour,
        "votes_against": contre,
        "abstentions": 4,
    }


@pytest.mark.parametrize(
    ("counts", "expected"),
    [
        ({"pour": 100, "contre": 3}, "pour"),
        ({"contre": 50, "abstention": 10, "pour": 2}, "contre"),
        ({"abstention": 9, "pour": 1}, "abstention"),
        ({"pour": 5, "contre": 5}, "contre"),
        ({"nonVotant": 40}, None),
        ({}, None),
    ],
)
def test_majority_position(counts, expected):
    assert majority_position(counts) == expected


def test_margin_is_never_negative():
    assert margin_of(_vote(pour=100, contre=130)) == 30


def test_a_censure_motion_is_named_as_one():
    motion = _vote(
        kind="motion", title="la motion de censure déposée en application de l'article 49"
    )
    assert kind_label(motion) == "Motion de censure"
    assert kind_label(_vote(kind="motion", title="la motion de rejet préalable")) == "Motion"
    assert kind_label(_vote()) == "Texte entier"


def test_key_vote_carries_the_official_link():
    assert to_key_vote(_vote("VTANR5L17V8433")).official_url.endswith("/scrutins/8433")


def test_grid_has_one_cell_per_key_vote_in_order_and_never_counts_non_votants():
    votes = [_vote("A"), _vote("B")]
    seats = [
        {"party": "Rassemblement National", "seats": 120},
        {"party": "Droite Républicaine", "seats": 47},
    ]
    positions = [
        {"vote_id": "A", "party": "Rassemblement National", "position": "contre", "n": 100},
        {"vote_id": "A", "party": "Rassemblement National", "position": "pour", "n": 3},
        {"vote_id": "B", "party": "Droite Républicaine", "position": "pour", "n": 20},
    ]
    grid = build_grid(seats, votes, positions)
    assert [r.party_short for r in grid] == ["RN", "DR"]
    assert [c.vote_id for c in grid[0].cells] == ["A", "B"]
    assert [c.position for c in grid[0].cells] == ["contre", None]
    assert [c.position for c in grid[1].cells] == [None, "pour"]
    assert grid[0].slug == "rassemblement-national"


def test_endpoint_returns_figures_votes_and_grid(client, mock_cursor):
    mock_cursor.fetchone.side_effect = [
        {"scrutins": 2300, "adopted_texts": 120, "censure_motions": 6},
        {"median": 0.6234567},
    ]
    mock_cursor.fetchall.side_effect = [
        [_vote("A")],
        [{"party": "Rassemblement National", "seats": 120}],
        [{"vote_id": "A", "party": "Rassemblement National", "position": "contre", "n": 100}],
    ]
    body = client.get("/election/2027").json()
    assert body["legislature"]["scrutins"] == 2300
    assert body["legislature"]["median_presence_rate"] == 0.6235
    assert body["legislature"]["coverage_start"] == cfg.DATA_HORIZON
    assert body["key_votes"][0]["margin"] == 2
    assert body["grid"][0]["cells"][0]["position"] == "contre"


def test_endpoint_without_scrutins_is_empty_not_an_error(client, mock_cursor):
    mock_cursor.fetchone.side_effect = [
        {"scrutins": 0, "adopted_texts": 0, "censure_motions": 0},
        None,
    ]
    mock_cursor.fetchall.side_effect = [[], []]
    body = client.get("/election/2027").json()
    assert body["key_votes"] == [] and body["grid"] == []
    assert body["legislature"]["median_presence_rate"] is None


def test_endpoint_is_cacheable_and_has_a_manual(client):
    assert election.get_election_2027.__doc__
    schema = client.get("/openapi.json").json()["paths"]["/election/2027"]["get"]
    assert schema["operationId"] == "getElection2027"


def test_no_date_is_invented(client, monkeypatch):
    monkeypatch.delenv(cfg.ELECTION_FIRST_ROUND_ENV, raising=False)
    election_block = client.get("/app/config").json()["election"]
    assert election_block["first_round_label"] == "avril 2027"
    assert election_block["first_round_date"] is None
    assert election_block["registration_deadline"] is None


def test_dates_derive_from_the_configured_first_round(client, monkeypatch):
    monkeypatch.setenv(cfg.ELECTION_FIRST_ROUND_ENV, "2027-04-11")
    block = client.get("/app/config").json()["election"]
    assert block["first_round_date"] == "2027-04-11"
    assert block["second_round_date"] == "2027-04-25"
    # 2022: first round 10 April, registration closed Friday 4 March.
    assert block["registration_deadline"] == "2027-03-05"


def test_registration_deadline_matches_the_2022_calendar():
    assert cfg.registration_deadline(date(2022, 4, 10)) == date(2022, 3, 4)


def test_a_malformed_date_is_ignored(monkeypatch):
    monkeypatch.setenv(cfg.ELECTION_FIRST_ROUND_ENV, "avril")
    assert cfg.election_config()["first_round_date"] is None


def test_absent_marts_roll_the_connection_back_and_leave_the_median_null(client, mock_cursor):
    """An UndefinedTable must leave `get_conn()`, which rolls back before pooling."""
    import psycopg2.errors

    from api import db

    mock_cursor.fetchone.side_effect = [
        {"scrutins": 1, "adopted_texts": 0, "censure_motions": 0},
    ]
    mock_cursor.fetchall.side_effect = [[], []]
    mock_cursor.execute.side_effect = [None, None, None, psycopg2.errors.UndefinedTable()]
    body = client.get("/election/2027").json()
    assert body["legislature"]["median_presence_rate"] is None
    conn = db._pool.getconn.return_value
    conn.rollback.assert_called()
