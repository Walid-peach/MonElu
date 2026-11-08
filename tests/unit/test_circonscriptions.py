"""Unit tests for POST /circonscriptions/locate and GET /circonscriptions/abroad (#662)."""

import logging
from unittest.mock import patch

import pytest
from shapely import STRtree
from shapely.geometry import box

import api.routers.circonscriptions as circ
from api.circonscriptions_data import ABROAD_SEAT_REGIONS, BOUNDARY_TOLERANCE_M
from api.main import _drop_private_request_bodies

DEPUTY = {
    "deputy_id": "PA1",
    "full_name": "Une Députée",
    "party": "Groupe",
    "party_short": "G",
    "department": "Nord",
    "circonscription": "1",
    "photo_url": "https://example.org/p.jpg",
}

# Two neighbouring seats in the Nord split at longitude 3.0: west is 59-1, east 59-2.
WEST = ("59", 1)
EAST = ("59", 2)
METRES_PER_DEGREE_AT_50N = 111_320 * 0.6428  # cos(50°)


@pytest.fixture
def two_seats():
    geoms = [box(2.9, 49.9, 3.0, 50.1), box(3.0, 49.9, 3.1, 50.1)]
    index = circ._Index(keys=[WEST, EAST], geoms=geoms, tree=STRtree(geoms))
    with patch.object(circ, "_index", return_value=index):
        yield


def lon_east_of_boundary(metres: float) -> float:
    return 3.0 + metres / METRES_PER_DEGREE_AT_50N


# --- locate_point -----------------------------------------------------------


def test_a_point_well_inside_one_seat_is_sure(two_seats):
    assert circ.locate_point(50.0, 3.05) == [EAST]


def test_a_point_near_the_boundary_lists_both_seats_containing_first(two_seats):
    near = lon_east_of_boundary(BOUNDARY_TOLERANCE_M / 2)
    assert circ.locate_point(50.0, near) == [EAST, WEST]


def test_just_beyond_the_tolerance_is_sure_again(two_seats):
    far = lon_east_of_boundary(BOUNDARY_TOLERANCE_M * 1.5)
    assert circ.locate_point(50.0, far) == [EAST]


def test_a_point_in_no_seat_but_near_one_gets_that_seat(two_seats):
    outside = 3.1 + (BOUNDARY_TOLERANCE_M / 2) / METRES_PER_DEGREE_AT_50N
    assert circ.locate_point(50.0, outside) == [EAST]


def test_a_point_far_from_every_seat_gets_none(two_seats):
    assert circ.locate_point(50.0, 4.0) == []


def test_real_file_places_known_points():
    assert circ.locate_point(50.6292, 3.0573) == [("59", 1)]  # Lille, city centre
    assert circ.locate_point(48.8566, 2.3522) == [("75", 7)]  # Paris, Hôtel de Ville
    assert circ.locate_point(46.0, -5.0) == []  # Atlantic
    assert circ.locate_point(80.0, 10.0) == []


def test_seat_labels():
    assert circ.seat_label("59", 1) == "Nord, 1re circonscription"
    assert circ.seat_label("2A", 2) == "Corse-du-Sud, 2e circonscription"


# --- POST /circonscriptions/locate --------------------------------------------


def test_locate_returns_the_seat_and_its_deputy(client, mock_cursor, two_seats):
    mock_cursor.fetchone.return_value = DEPUTY
    resp = client.post("/circonscriptions/locate", json={"lat": 50.0, "lon": 2.95})
    assert resp.status_code == 200
    body = resp.json()
    assert body["uncertain"] is False
    assert body["seats"] == [
        {
            "department_code": "59",
            "department_name": "Nord",
            "circonscription": 1,
            "label": "Nord, 1re circonscription",
            "vacant": False,
            "deputy": DEPUTY,
        }
    ]
    params = mock_cursor.execute.call_args.args[1]
    assert params["circonscription"] == 1
    assert "Nord" in params["departments"]


def test_locate_near_a_boundary_is_uncertain(client, mock_cursor, two_seats):
    mock_cursor.fetchone.return_value = DEPUTY
    near = lon_east_of_boundary(BOUNDARY_TOLERANCE_M / 2)
    body = client.post("/circonscriptions/locate", json={"lat": 50.0, "lon": near}).json()
    assert body["uncertain"] is True
    assert [s["circonscription"] for s in body["seats"]] == [2, 1]


def test_locate_reports_a_vacant_seat(client, mock_cursor, two_seats):
    mock_cursor.fetchone.return_value = None
    body = client.post("/circonscriptions/locate", json={"lat": 50.0, "lon": 3.05}).json()
    assert body["seats"][0]["vacant"] is True
    assert "deputy" not in body["seats"][0]


def test_locate_outside_every_seat_is_404(client, mock_cursor, two_seats):
    resp = client.post("/circonscriptions/locate", json={"lat": 50.0, "lon": 4.0})
    assert resp.status_code == 404
    mock_cursor.execute.assert_not_called()


@pytest.mark.parametrize(
    "body",
    [{}, {"lat": 50.0}, {"lat": 91, "lon": 3}, {"lat": 50, "lon": 181}, {"lat": "x", "lon": 3}],
)
def test_locate_rejects_an_invalid_body(client, mock_cursor, body):
    assert client.post("/circonscriptions/locate", json=body).status_code == 422


def test_locate_is_not_a_get(client):
    assert client.get("/circonscriptions/locate?lat=50&lon=3").status_code == 405


def test_locate_logs_no_coordinates(client, mock_cursor, two_seats, caplog):
    mock_cursor.fetchone.return_value = DEPUTY
    with caplog.at_level(logging.DEBUG):
        client.post("/circonscriptions/locate", json={"lat": 50.0123, "lon": 2.9456})
        with (
            patch.object(circ, "get_conn", side_effect=RuntimeError("db down")),
            pytest.raises(RuntimeError),
        ):
            # The test client re-raises; in production the global handler answers 500
            # and logs the method, the path and the traceback, which holds no body.
            client.post("/circonscriptions/locate", json={"lat": 50.0123, "lon": 2.9456})
    assert "50.0123" not in caplog.text
    assert "2.9456" not in caplog.text


def test_locate_response_is_not_cached(client, mock_cursor, two_seats):
    mock_cursor.fetchone.return_value = DEPUTY
    resp = client.post("/circonscriptions/locate", json={"lat": 50.0, "lon": 2.95})
    assert "public" not in resp.headers.get("cache-control", "")


def test_sentry_events_for_locate_carry_no_body():
    event = {
        "request": {
            "url": "https://monelu-production.up.railway.app/circonscriptions/locate",
            "data": {"lat": 50.0, "lon": 3.0},
        }
    }
    assert "data" not in _drop_private_request_bodies(event, None)["request"]
    other = {"request": {"url": "https://x/search/", "data": {"question": "q"}}}
    assert _drop_private_request_bodies(other, None)["request"]["data"] == {"question": "q"}


# --- GET /circonscriptions/abroad --------------------------------------------


def test_abroad_lists_the_eleven_seats_with_their_region(client, mock_cursor):
    mock_cursor.fetchone.return_value = {**DEPUTY, "department": "99"}
    resp = client.get("/circonscriptions/abroad")
    assert resp.status_code == 200
    seats = resp.json()
    assert [s["circonscription"] for s in seats] == list(range(1, 12))
    assert all(s["department_code"] == "99" for s in seats)
    assert seats[3]["region"] == ABROAD_SEAT_REGIONS[4]
    assert seats[0]["label"] == "Français établis hors de France, 1re circonscription"
