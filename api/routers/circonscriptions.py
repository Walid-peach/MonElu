"""
api/routers/circonscriptions.py

Which circonscription a point is in, and who sits for it (ADR-047, #662).

The client geocodes the visitor's address itself (Base Adresse Nationale) and
sends only the point. The point is matched in memory against
data/geo/circonscriptions.geojson; it is never stored, never logged and never
put in a URL, which is why the endpoint is a POST.

The boundary file is simplified and not official, so a point within
BOUNDARY_TOLERANCE_M of a second seat is answered with every such seat and
`uncertain: true`, never with a guess.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

from fastapi import APIRouter, HTTPException
from shapely import STRtree
from shapely.geometry import Point, shape
from shapely.ops import nearest_points
from starlette.requests import Request

from api.circonscriptions_data import (
    ABROAD_DEPARTMENT,
    ABROAD_SEAT_REGIONS,
    BOUNDARY_FILE,
    BOUNDARY_TOLERANCE_M,
    iter_features,
)
from api.db import get_conn
from api.departments_data import DEPT_NAMES, db_department_values
from api.limiter import limiter, tiered_limit
from api.schemas import AbroadSeat, DeputySummary, LocateRequest, LocateResponse, Seat

router = APIRouter()

EARTH_RADIUS_M = 6_371_000
METRES_PER_DEGREE = 111_320
# Beyond this latitude a degree of longitude is too short for the degree-based
# pre-filter to be cheap; no seat is anywhere near it.
MAX_SEAT_LATITUDE = 60.0


@dataclass(frozen=True)
class _Index:
    keys: list[tuple[str, int]]
    geoms: list
    tree: STRtree


@lru_cache(maxsize=1)
def _index() -> _Index:
    """The boundary file, loaded once on first use (ADR-047 §2)."""
    keys, geoms = [], []
    for feature in iter_features(BOUNDARY_FILE):
        props = feature["properties"]
        keys.append((props["department"], int(props["circonscription"])))
        geoms.append(shape(feature["geometry"]))
    return _Index(keys=keys, geoms=geoms, tree=STRtree(geoms))


def _distance_m(a: Point, b: Point) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a.x, a.y, b.x, b.y))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def locate_point(lat: float, lon: float) -> list[tuple[str, int]]:
    """Every seat the point may be in, the containing one first, then by distance.

    One seat means a sure answer. Several mean the point is within the tolerance of
    a boundary. None means it is in no seat and not near one (at sea, abroad).
    """
    if abs(lat) > MAX_SEAT_LATITUDE:
        return []
    index = _index()
    point = Point(lon, lat)
    containing = [int(i) for i in index.tree.query(point, predicate="intersects")]
    # A degree of longitude is shorter than a degree of latitude, so size the query
    # by longitude: it may return seats slightly too far, never miss a close one.
    degrees = BOUNDARY_TOLERANCE_M / (METRES_PER_DEGREE * math.cos(math.radians(lat)))
    nearby = [int(i) for i in index.tree.query(point, predicate="dwithin", distance=degrees)]

    distances: dict[int, float] = {i: 0.0 for i in containing}
    for i in nearby:
        if i in distances:
            continue
        nearest = nearest_points(point, index.geoms[i])[1]
        distance = _distance_m(point, nearest)
        if distance <= BOUNDARY_TOLERANCE_M:
            distances[i] = distance
    ordered = sorted(distances, key=lambda i: (distances[i], index.keys[i]))
    return [index.keys[i] for i in ordered]


def seat_label(department_code: str, circonscription: int) -> str:
    ordinal = "1re" if circonscription == 1 else f"{circonscription}e"
    return f"{DEPT_NAMES[department_code]}, {ordinal} circonscription"


SQL_SITTING_DEPUTY = """
    SELECT deputy_id, full_name, party, party_short, department, circonscription, photo_url
    FROM deputies
    WHERE department = ANY(%(departments)s)
      AND NULLIF(regexp_replace(circonscription, '[^0-9]', '', 'g'), '')::int
          = %(circonscription)s
      AND deputy_id IN (SELECT deputy_id FROM sitting_deputies)
    ORDER BY mandate_start DESC NULLS LAST
    LIMIT 1
"""


def _seat(cur, department_code: str, circonscription: int) -> Seat:
    cur.execute(
        SQL_SITTING_DEPUTY,
        {
            "departments": db_department_values(department_code),
            "circonscription": circonscription,
        },
    )
    row = cur.fetchone()
    return Seat(
        department_code=department_code,
        department_name=DEPT_NAMES[department_code],
        circonscription=circonscription,
        label=seat_label(department_code, circonscription),
        vacant=row is None,
        deputy=DeputySummary(**row) if row else None,
    )


@router.post(
    "/locate",
    response_model=LocateResponse,
    response_model_exclude_none=True,
    summary="The circonscription a point is in, and its sitting deputy",
)
@limiter.limit(tiered_limit(30))
def locate_circonscription(request: Request, body: LocateRequest):
    """Which circonscription a point (WGS84 `lat`/`lon`) is in, and who sits for it.

    Send coordinates, never an address: geocode the address on the device, for
    example with the Base Adresse Nationale (https://api-adresse.data.gouv.fr).
    The point is not stored or logged, and this is a POST so it never appears in
    a URL.

    The boundaries are a simplified, unofficial file (data.gouv.fr, Licence
    Ouverte 2.0, built from polling-station contours), so near an edge it can be
    wrong. When the point is within 50 metres of a second seat, `uncertain` is
    true and `seats` lists every seat it may be in, nearest first: ask the
    visitor to choose (the circonscription is printed on the voter card) rather
    than picking one. Measured over 3.8 million addresses in communes wholly
    inside one seat, 98.8 % get one sure seat, 1.1 % get several, and 0.011 %
    get one wrong seat. In communes split between seats, measured against the
    electoral register, 8.3 % get several and 0.010 % one wrong seat in Paris,
    Marseille and Lyon, and 4.1 % and 0.065 % in the others.

    `vacant` is true, with no `deputy`, while a seat waits for a by-election.

    Not covered: the 11 seats for French people abroad (see
    `GET /circonscriptions/abroad`) and Saint-Barthélemy et Saint-Martin,
    Wallis-et-Futuna, Polynésie française and Nouvelle-Calédonie (use
    `GET /departments/{code}`). A point in no seat and not within 50 metres of
    one (at sea, outside France) is a 404.
    """
    keys = locate_point(body.lat, body.lon)
    if not keys:
        raise HTTPException(
            status_code=404,
            detail="This point is in no circonscription the boundary file covers",
        )
    with get_conn() as conn:
        with conn.cursor() as cur:
            seats = [_seat(cur, department, number) for department, number in keys]
    return LocateResponse(uncertain=len(seats) > 1, seats=seats)


@router.get(
    "/abroad",
    response_model=list[AbroadSeat],
    response_model_exclude_none=True,
    summary="The 11 seats for French people abroad, by region",
)
@limiter.limit(tiered_limit(30))
def list_abroad_circonscriptions(request: Request):
    """The 11 circonscriptions of Français établis hors de France, in order, each
    with its region in words and its sitting deputy.

    They cannot be found from an address. The region labels are the usual
    descriptions of each seat ("Benelux", "Canada et États-Unis"), not the legal
    list of countries, which is tableau n° 1 ter of the Code électoral: a visitor
    unsure of their seat should check it with their consulate.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            seats = [
                _seat(cur, ABROAD_DEPARTMENT, number) for number in sorted(ABROAD_SEAT_REGIONS)
            ]
    return [
        AbroadSeat(**seat.model_dump(), region=ABROAD_SEAT_REGIONS[seat.circonscription])
        for seat in seats
    ]
