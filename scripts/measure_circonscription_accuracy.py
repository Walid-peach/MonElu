"""Measure how often a circonscription boundary file puts an address in the right seat (ADR-047).

No official, precise boundary file exists, so before the locator answers "your deputy"
we check it against something independent: the polling-station list, which says which
circonscription each polling station belongs to. An address needs a known right answer,
and there are two sources of one.

Base Adresse Nationale files (positional arguments) give every address in France, but
not where it votes. Only communes whose polling stations all sit in one circonscription
can be used: every address there belongs to that seat. Communes split between seats
(Paris, Marseille, Lyon, Toulouse...) are left out. This is the #661 measurement.

Insee's "Bureaux de vote et adresses de leurs électeurs" (`--reu-addresses` and
`--reu-bureaux`, #670) gives the polling station of every address in the electoral
register, extracted in September 2022. Each address takes the seat of its polling
station, so communes split between seats are measured too. Insee's polling-station
table carries the Ministry's code for each station (`id_brut_miom`), which is the key
of the polling-station list; for the overseas départements that code starts with the
Ministry's letter code (ZD401_0010), so the commune code replaces it. A station with no
match (renumbered or created since 2022, for instance) is counted and reported, never
guessed, and a commune the list does not know at all is counted apart.
Only `housenumber` and `locality` addresses are kept, the result types the locator
accepts (ADR-047 §5), and only those Insee geocoded with a `geo_score` of at least
`--min-score` (default 0.9). The register's addresses are typed by town halls and
geocoded after the fact, and a low score often means a point in the wrong street: in
split communes the share of addresses put more than 250 m inside another seat falls from
5.5 % under a score of 0.6 to 0.025 % at 0.9 and above. Those are errors in the test
data, not in the boundaries, and a visitor's own point never has them, since they pick
their address from the geocoder's suggestions. Pass `--min-score 0` to see them.

For several boundary tolerances T, the script answers each address the way the locator
would (every seat within T of the point, ADR-047 §5) and reports how often that answer
is one right seat, one wrong seat, several seats, or none, for each group of communes.
With the register, each figure is also given weighted by `nb_adresses` (register entries
at that address and polling station) so a block of flats counts for more than a house.
The chosen tolerance is the one that keeps "one wrong seat" negligible without making
"several seats" common.

Usage:
    python scripts/measure_circonscription_accuracy.py \\
        --boundaries data/geo/circonscriptions.geojson \\
        --bureaux bureaux-de-vote-circonscriptions.csv \\
        adresses-59.csv.gz adresses-33.csv.gz ...

    python scripts/measure_circonscription_accuracy.py \\
        --boundaries data/geo/circonscriptions.geojson \\
        --bureaux bureaux-de-vote-circonscriptions.csv \\
        --reu-addresses table-adresses-reu.csv --reu-bureaux table-bv-reu.csv

The address files are the per-département CSV exports from
https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/, the polling-station list is
https://www.data.gouv.fr/datasets/liste-des-bureaux-de-vote-associes-a-leur-circonscription-legislative
and the register files are the two CSV tables of
https://www.data.gouv.fr/datasets/bureaux-de-vote-et-adresses-de-leurs-electeurs
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import sys
from array import array
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely import STRtree
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.circonscriptions_data import seat_key_from_source  # noqa: E402
from api.routers.circonscriptions import MAX_SEAT_LATITUDE  # noqa: E402

EARTH_RADIUS_M = 6_371_000
TOLERANCES_M = (0, 50, 100, 250, 500, 1000)
METRES_PER_DEGREE = 111_320

# The three communes that vote by arrondissement, reported on their own (#670).
PLM_COMMUNES = {"75056": "Paris", "13055": "Marseille", "69123": "Lyon"}
GROUP_WHOLE = "communes wholly inside one seat"
GROUP_PLM = "Paris, Marseille, Lyon"
GROUP_SPLIT = "other communes split between seats"
GROUPS = (GROUP_WHOLE, GROUP_PLM, GROUP_SPLIT)

# The locator's precise result types (ADR-047 §5): a street's or a town's point is its
# middle, which the locator never matches.
PRECISE_TYPES = {"housenumber", "locality"}
# Unjoined register addresses whose commune is not in the polling-station list at all.
UNJOINED_UNKNOWN_COMMUNE = "communes missing from the polling-station list"
# Insee geocoding score below which a register address is too often misplaced (#670).
MIN_GEO_SCORE = 0.9


def load_boundaries(path: Path) -> tuple[list[tuple[str, int]], list]:
    keys, geoms = [], []
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    for feature in data["features"]:
        props = feature["properties"]
        keys.append((props["department"], int(props["circonscription"])))
        geoms.append(shape(feature["geometry"]))
    return keys, geoms


def load_bureaux(bureaux_csv: Path) -> tuple[dict[str, tuple[str, int]], dict[str, set]]:
    """Polling-station code -> its seat, and commune code -> every seat of its stations."""
    seat_of_bureau: dict[str, tuple[str, int]] = {}
    seats_of_commune: dict[str, set[tuple[str, int]]] = defaultdict(set)
    with bureaux_csv.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            seat = seat_key_from_source(row["codeDepartement"], row["codeCirconscription"])
            seat_of_bureau[row["codeBureauVote"]] = seat
            seats_of_commune[row["codeCommune"]].add(seat)
    return seat_of_bureau, seats_of_commune


def commune_group(commune: str, seats_of_commune: dict[str, set]) -> str:
    if commune in PLM_COMMUNES:
        return GROUP_PLM
    return GROUP_WHOLE if len(seats_of_commune.get(commune, ())) == 1 else GROUP_SPLIT


def ministry_bureau_code(reu_commune: str, miom: str) -> str:
    """The polling-station list's code for a station of Insee's register table.

    Overseas, the Ministry code starts with its letter code (ZD401_0010 for 97401_0010).
    """
    if miom.startswith("Z"):
        return f"{reu_commune}_{miom.partition('_')[2]}"
    return miom


def load_reu_bureaux(reu_bureaux_csv: Path) -> dict[str, str]:
    """Insee's register station id (id_brut_reu) -> the polling-station list's code."""
    codes = {}
    with reu_bureaux_csv.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["id_brut_miom"]:
                codes[row["id_brut_reu"]] = ministry_bureau_code(
                    row["code_commune"], row["id_brut_miom"]
                )
    return codes


class Sample:
    """Addresses with a known seat, kept as flat arrays so millions of rows fit."""

    def __init__(self) -> None:
        self.lon = array("d")
        self.lat = array("d")
        self.expected = array("i")
        self.group = array("b")
        self.weight = array("i")

    def add(self, lon: float, lat: float, expected: int, group: str, weight: int = 1) -> None:
        self.lon.append(lon)
        self.lat.append(lat)
        self.expected.append(expected)
        self.group.append(GROUPS.index(group))
        self.weight.append(weight)

    def __len__(self) -> int:
        return len(self.lon)


def ban_sample(paths, seats_of_commune, index_of) -> Sample:
    """BAN addresses in communes wholly inside one seat (#661)."""
    sample = Sample()
    for path in paths:
        with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f, delimiter=";"):
                seats = seats_of_commune.get(row.get("code_insee", ""), ())
                if len(seats) != 1:
                    continue
                seat = next(iter(seats))
                if seat not in index_of:
                    continue
                try:
                    lon, lat = float(row["lon"]), float(row["lat"])
                except (KeyError, ValueError):
                    continue
                sample.add(lon, lat, index_of[seat], GROUP_WHOLE)
    return sample


def reu_sample(path, reu_codes, seat_of_bureau, seats_of_commune, index_of, min_score):
    """Register addresses with the seat of their polling station (#670)."""
    sample = Sample()
    skipped: dict[str, int] = defaultdict(int)
    unjoined: dict[str, int] = defaultdict(int)
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["geo_type"] not in PRECISE_TYPES:
                skipped["not a house number or lieu-dit"] += 1
                continue
            try:
                score = float(row["geo_score"] or 0)
            except ValueError:
                score = 0.0
            if score < min_score:
                skipped[f"geocoded with a score below {min_score}"] += 1
                continue
            code = reu_codes.get(row["id_brut_bv_reu"])
            seat = seat_of_bureau.get(code) if code else None
            commune = code.partition("_")[0] if code else row["code_commune_ref"]
            group = commune_group(commune, seats_of_commune)
            if seat is None:
                # A commune the list does not know (merged since 2022, for instance) has
                # no seats to group it by; count it apart rather than as split.
                known = commune in PLM_COMMUNES or commune in seats_of_commune
                unjoined[group if known else UNJOINED_UNKNOWN_COMMUNE] += 1
                continue
            if seat not in index_of:
                skipped["seat without a shape"] += 1
                continue
            try:
                lon, lat = float(row["longitude"]), float(row["latitude"])
                weight = int(float(row["nb_adresses"] or 1))
            except ValueError:
                skipped["unreadable row"] += 1
                continue
            if not (math.isfinite(lon) and math.isfinite(lat)) or abs(lat) > MAX_SEAT_LATITUDE:
                # One such point would widen the matcher's degree pre-filter to every seat.
                skipped["unreadable row"] += 1
                continue
            sample.add(lon, lat, index_of[seat], group, weight)
    return sample, skipped, unjoined


# Answer categories, in report order.
SURE_RIGHT, SURE_WRONG, SEVERAL_RIGHT, SEVERAL_WRONG, NO_SEAT = range(5)


def haversine_m_arrays(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    h = (
        np.sin((lat2 - lat1) / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(h))


class Matcher:
    """Answers every address of a sample the way the locator would (ADR-047 §5)."""

    def __init__(self, sample: Sample, tree: STRtree, geoms: list) -> None:
        self.n = len(sample)
        self.lon = np.frombuffer(sample.lon, dtype=np.float64)
        self.lat = np.frombuffer(sample.lat, dtype=np.float64)
        self.expected = np.frombuffer(sample.expected, dtype=np.int32)
        self.points = shapely.points(self.lon, self.lat)
        self.tree = tree
        self.geoms = np.asarray(geoms, dtype=object)
        # Pairs whose point lies in the seat: distance 0, true at every tolerance.
        self.inside = tree.query(self.points, predicate="intersects")

    def pairs_within(self, tolerance: int) -> tuple[np.ndarray, np.ndarray]:
        """(point, seat) pairs with the point within `tolerance` metres of the seat."""
        if tolerance == 0:
            return self.inside[0], self.inside[1]
        # A degree of longitude shrinks with latitude; use the largest degree span so
        # the query never misses a seat (distances are checked exactly below).
        max_lat = float(np.abs(self.lat).max())
        degrees = tolerance / (METRES_PER_DEGREE * math.cos(math.radians(max_lat)))
        near_p, near_g = self.tree.query(self.points, predicate="dwithin", distance=degrees)
        inside_keys = self.inside[0].astype(np.int64) * len(self.geoms) + self.inside[1]
        near_keys = near_p.astype(np.int64) * len(self.geoms) + near_g
        outside = ~np.isin(near_keys, inside_keys)
        out_p, out_g = near_p[outside], near_g[outside]
        lines = shapely.shortest_line(self.points[out_p], self.geoms[out_g])
        ends = shapely.get_coordinates(lines).reshape(-1, 2, 2)
        metres = haversine_m_arrays(ends[:, 0, 0], ends[:, 0, 1], ends[:, 1, 0], ends[:, 1, 1])
        keep = metres <= tolerance
        return (
            np.concatenate([self.inside[0], out_p[keep]]),
            np.concatenate([self.inside[1], out_g[keep]]),
        )

    def categories(self, tolerance: int) -> np.ndarray:
        """One answer category per address at this tolerance."""
        p, g = self.pairs_within(tolerance)
        seats = np.bincount(p, minlength=self.n)
        right = np.bincount(p[g == self.expected[p]], minlength=self.n) > 0
        out = np.full(self.n, NO_SEAT, dtype=np.int8)
        out[(seats == 1) & right] = SURE_RIGHT
        out[(seats == 1) & ~right] = SURE_WRONG
        out[(seats > 1) & right] = SEVERAL_RIGHT
        out[(seats > 1) & ~right] = SEVERAL_WRONG
        return out


def report(sample: Sample, tree: STRtree, geoms: list, tolerances, weighted: bool) -> None:
    matcher = Matcher(sample, tree, geoms)
    group = np.frombuffer(sample.group, dtype=np.int8)
    weight = np.frombuffer(sample.weight, dtype=np.int32)
    for tolerance in tolerances:
        category = matcher.categories(tolerance)
        print(f"  tolerance {tolerance} m")
        for g, name in enumerate(GROUPS):
            mask = group == g
            if not mask.any():
                continue
            measures = [("addresses", np.bincount(category[mask], minlength=5))]
            if weighted:
                measures.append(
                    (
                        "register entries",
                        np.bincount(category[mask], weights=weight[mask], minlength=5),
                    )
                )
            for label, values in measures:
                total = values.sum()

                def pct(n, total=total) -> str:
                    return f"{100 * n / total:.3f} %"

                print(
                    f"    {name}, {label} ({int(total)}): "
                    f"sure and right {pct(values[SURE_RIGHT])}, "
                    f"sure and wrong {pct(values[SURE_WRONG])} ({int(values[SURE_WRONG])}), "
                    f"several seats {pct(values[SEVERAL_RIGHT] + values[SEVERAL_WRONG])} "
                    f"(right one missing in {int(values[SEVERAL_WRONG])}), "
                    f"no seat {pct(values[NO_SEAT])}"
                )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--boundaries", type=Path, required=True)
    parser.add_argument("--bureaux", type=Path, required=True)
    parser.add_argument("--reu-addresses", type=Path, help="Insee table-adresses-reu.csv")
    parser.add_argument("--reu-bureaux", type=Path, help="Insee table-bv-reu.csv")
    parser.add_argument(
        "--tolerances",
        type=lambda s: tuple(int(t) for t in s.split(",")),
        default=TOLERANCES_M,
        help="comma-separated metres, default %(default)s",
    )
    parser.add_argument(
        "--min-score",
        type=float,
        default=MIN_GEO_SCORE,
        help="lowest Insee geo_score kept from the register, default %(default)s",
    )
    parser.add_argument("addresses", type=Path, nargs="*", help="BAN per-département CSV.gz")
    args = parser.parse_args()
    if bool(args.reu_addresses) != bool(args.reu_bureaux):
        parser.error("--reu-addresses and --reu-bureaux go together")
    if not args.addresses and not args.reu_addresses:
        parser.error("give BAN address files, the register files, or both")

    keys, geoms = load_boundaries(args.boundaries)
    index_of = {key: i for i, key in enumerate(keys)}
    tree = STRtree(geoms)
    seat_of_bureau, seats_of_commune = load_bureaux(args.bureaux)
    print(f"boundaries: {args.boundaries}")

    if args.addresses:
        sample = ban_sample(args.addresses, seats_of_commune, index_of)
        print(f"BAN addresses in communes wholly inside one seat: {len(sample)}")
        report(sample, tree, geoms, args.tolerances, weighted=False)

    if args.reu_addresses:
        reu_codes = load_reu_bureaux(args.reu_bureaux)
        sample, skipped, unjoined = reu_sample(
            args.reu_addresses,
            reu_codes,
            seat_of_bureau,
            seats_of_commune,
            index_of,
            args.min_score,
        )
        print(f"register addresses with a known seat: {len(sample)}")
        for reason, n in sorted(skipped.items()):
            print(f"  left out, {reason}: {n}")
        kept_per_group = np.bincount(np.frombuffer(sample.group, np.int8), minlength=len(GROUPS))
        for group, kept in zip(GROUPS, kept_per_group, strict=True):
            missing = unjoined.get(group, 0)
            if kept + missing:
                print(
                    f"  {group}: {kept} kept, {missing} with no matching polling station "
                    f"({100 * missing / (kept + missing):.2f} %)"
                )
        if unjoined.get(UNJOINED_UNKNOWN_COMMUNE):
            print(f"  {UNJOINED_UNKNOWN_COMMUNE}: {unjoined[UNJOINED_UNKNOWN_COMMUNE]} left out")
        report(sample, tree, geoms, args.tolerances, weighted=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
