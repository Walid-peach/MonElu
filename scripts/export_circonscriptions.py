"""
scripts/export_circonscriptions.py
Write data/geo/circonscriptions.geojson, the circonscription boundaries the locator
matches a point against (ADR-047 §1, #661).

The boundaries follow the 2010 redistricting and change only by law, so this is run
by hand when the source publishes a new version, never by the daily cron.

Only what the matcher needs is kept: the seat key (`department`, `circonscription`,
as in `deputies`) and the geometry, repaired where the source crosses itself and snapped
to 5 decimals (about a metre, far below the simplification error the file already
carries). Features are sorted by seat so a rerun on the same source writes the same
bytes.

Usage:
    python scripts/export_circonscriptions.py                     # download and write
    python scripts/export_circonscriptions.py --source FILE       # from a local copy
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

import requests
import shapely
from shapely.geometry import mapping, shape

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.circonscriptions_data import (  # noqa: E402
    BOUNDARY_FILE,
    BOUNDARY_SOURCE,
    seat_key_from_source,
)

COORDINATE_DECIMALS = 5


def _clean(geometry: dict) -> dict:
    """A valid (Multi)Polygon snapped to a 10⁻⁵ degree grid.

    Ten shapes in the source cross themselves, which point-in-polygon tests answer
    unpredictably, and rounding coordinates on its own can create more such crossings.
    `make_valid` repairs the source and `set_precision` snaps to the grid while keeping
    the result valid.
    """
    geom = shapely.make_valid(shape(geometry))
    if geom.geom_type == "GeometryCollection":
        geom = shapely.union_all([g for g in geom.geoms if g.geom_type.endswith("Polygon")])
    geom = shapely.set_precision(geom, 10**-COORDINATE_DECIMALS)
    return json.loads(
        json.dumps(mapping(geom)),
        parse_float=lambda value: round(float(value), COORDINATE_DECIMALS),
    )


def build(source: dict) -> dict:
    features = []
    for feature in source["features"]:
        props = feature["properties"]
        department, number = seat_key_from_source(
            props["codeDepartement"], props["codeCirconscription"]
        )
        features.append(
            {
                "type": "Feature",
                "properties": {"department": department, "circonscription": number},
                "geometry": _clean(feature["geometry"]),
            }
        )
    features.sort(key=lambda f: (f["properties"]["department"], f["properties"]["circonscription"]))
    return {"type": "FeatureCollection", "source": BOUNDARY_SOURCE, "features": features}


def write(collection: dict, out: pathlib.Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write data/geo/circonscriptions.geojson.")
    parser.add_argument("--source", type=pathlib.Path, help="a local copy of the source file")
    parser.add_argument("--out", type=pathlib.Path, default=BOUNDARY_FILE)
    args = parser.parse_args(argv)

    if args.source:
        source = json.loads(args.source.read_text(encoding="utf-8"))
    else:
        response = requests.get(BOUNDARY_SOURCE["download_url"], timeout=120)
        response.raise_for_status()
        with tempfile.TemporaryFile() as tmp:
            tmp.write(response.content)
            tmp.seek(0)
            source = json.load(tmp)

    collection = build(source)
    write(collection, args.out)
    print(f"wrote {len(collection['features'])} seats to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
