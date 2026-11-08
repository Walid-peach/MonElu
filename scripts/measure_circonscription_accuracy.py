"""Measure how often a circonscription boundary file puts an address in the right seat (ADR-047).

No official, precise boundary file exists, so before the locator answers "your deputy"
we check it against something independent: the polling-station list, which says which
circonscription each polling station (and so each commune) belongs to.

A commune whose polling stations all sit in one circonscription is wholly inside it,
so every Base Adresse Nationale address in that commune has a known right answer.
Communes split between seats (Paris, Marseille, Lyon, Toulouse...) are left out: the
address data does not say which polling station an address votes in.

For several boundary tolerances T, the script answers each address the way the locator
would (every seat within T of the point, ADR-047 §5) and reports how often that answer
is one right seat, one wrong seat, several seats, or none. The chosen tolerance is the
one that keeps "one wrong seat" negligible without making "several seats" common.

Usage:
    python scripts/measure_circonscription_accuracy.py \\
        --boundaries data/reference/circonscriptions.geojson \\
        --bureaux bureaux-de-vote-circonscriptions.csv \\
        adresses-59.csv.gz adresses-33.csv.gz ...

The address files are the per-département CSV exports from
https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/ and the polling-station list
is https://www.data.gouv.fr/datasets/liste-des-bureaux-de-vote-associes-a-leur-circonscription-legislative
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

from shapely import STRtree
from shapely.geometry import Point, shape
from shapely.ops import nearest_points

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.circonscriptions_data import seat_key_from_source  # noqa: E402

EARTH_RADIUS_M = 6_371_000


def haversine_m(a: Point, b: Point) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a.x, a.y, b.x, b.y))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def load_boundaries(path: Path) -> tuple[list[tuple[str, int]], list]:
    data = json.loads(path.read_text(encoding="utf-8"))
    keys, geoms = [], []
    for feature in data["features"]:
        props = feature["properties"]
        keys.append((props["department"], int(props["circonscription"])))
        geoms.append(shape(feature["geometry"]))
    return keys, geoms


def whole_communes(bureaux_csv: Path) -> dict[str, tuple[str, int]]:
    """INSEE commune code -> its seat, for communes whose polling stations share one seat."""
    seats: dict[str, set[tuple[str, int]]] = defaultdict(set)
    with bureaux_csv.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seat = seat_key_from_source(row["codeDepartement"], row["codeCirconscription"])
            seats[row["codeCommune"]].add(seat)
    return {commune: next(iter(s)) for commune, s in seats.items() if len(s) == 1}


def addresses(path: Path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            try:
                yield row["code_insee"], float(row["lon"]), float(row["lat"])
            except (KeyError, ValueError):
                continue


TOLERANCES_M = (0, 50, 100, 250, 500, 1000)
METRES_PER_DEGREE = 111_320


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--bureaux", type=Path, required=True)
    parser.add_argument("addresses", type=Path, nargs="+")
    args = parser.parse_args()

    keys, geoms = load_boundaries(args.boundaries)
    index_of = {key: i for i, key in enumerate(keys)}
    tree = STRtree(geoms)
    expected_by_commune = whole_communes(args.bureaux)

    points: list[Point] = []
    expected: list[int] = []
    for path in args.addresses:
        for commune, lon, lat in addresses(path):
            seat = expected_by_commune.get(commune)
            if seat is not None and seat in index_of:
                points.append(Point(lon, lat))
                expected.append(index_of[seat])
    total = len(points)
    print(f"boundaries: {args.boundaries}")
    print(f"addresses in communes wholly inside one seat: {total}")

    # For each tolerance T the locator answers with every seat within T of the point
    # (ADR-047 §5): one seat is a sure answer, several an "uncertain" one.
    for tolerance in TOLERANCES_M:
        candidates: list[set[int]] = [set() for _ in range(total)]
        if tolerance == 0:
            pairs = tree.query(points, predicate="intersects")
        else:
            # A degree of longitude shrinks with latitude; use the largest degree span
            # so the query never misses a seat (distances are checked exactly below).
            max_lat = max(abs(p.y) for p in points)
            degrees = tolerance / (METRES_PER_DEGREE * math.cos(math.radians(max_lat)))
            pairs = tree.query(points, predicate="dwithin", distance=degrees)
        for point_i, geom_i in zip(*pairs, strict=True):
            candidates[point_i].add(int(geom_i))
        if tolerance:
            for i, seats in enumerate(candidates):
                if len(seats) > 1 or expected[i] not in seats:
                    point = points[i]
                    candidates[i] = {
                        g
                        for g in seats
                        if haversine_m(point, nearest_points(point, geoms[g])[1]) <= tolerance
                    }
        sure_right = sum(1 for i, c in enumerate(candidates) if c == {expected[i]})
        sure_wrong = sum(
            1 for i, c in enumerate(candidates) if len(c) == 1 and expected[i] not in c
        )
        uncertain = sum(1 for c in candidates if len(c) > 1)
        uncertain_right = sum(
            1 for i, c in enumerate(candidates) if len(c) > 1 and expected[i] in c
        )
        nothing = sum(1 for c in candidates if not c)
        print(
            f"  tolerance {tolerance:>4} m: sure and right {100 * sure_right / total:.3f} %, "
            f"sure and wrong {100 * sure_wrong / total:.3f} % ({sure_wrong}), "
            f"uncertain {100 * uncertain / total:.3f} % "
            f"(right seat listed in {uncertain_right}/{uncertain}), "
            f"no seat {100 * nothing / total:.3f} %"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
