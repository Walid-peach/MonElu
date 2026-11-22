"""Seat identity for the circonscription lookup (ADR-047).

A seat is `(department, circonscription)`: the department code as `deputies.department`
codes are normalized by `api.departments_data.normalize_department_code` ("01", "2A",
"971", "99") and the circonscription number as an int.

The boundary source codes overseas départements with the Ministère de l'Intérieur's
letter codes (ZA for Guadeloupe ...) and writes circonscriptions as "0104" or "ZA01";
`seat_key_from_source` is the one place that translation happens.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

INTERIOR_OVERSEAS_CODES = {
    "ZA": "971",
    "ZB": "972",
    "ZC": "973",
    "ZD": "974",
    "ZM": "976",
    "ZS": "975",
    "ZX": "977",
    "ZW": "986",
    "ZP": "987",
    "ZN": "988",
    "ZZ": "99",
}


def seat_key_from_source(department: str, circonscription: str) -> tuple[str, int]:
    """("ZA", "ZA01") -> ("971", 1); ("01", "0104") -> ("01", 4); ("2A", "2A02") -> ("2A", 2)."""
    department = department.strip().upper()
    department = INTERIOR_OVERSEAS_CODES.get(department, department)
    number = int(circonscription.strip()[-2:])
    return department, number


BOUNDARY_FILE = Path(__file__).resolve().parent.parent / "data" / "geo" / "circonscriptions.geojson"

BOUNDARY_SOURCE = {
    "name": "Contours géographiques des circonscriptions législatives (p20, simplifié)",
    "producer": "Jérôme Desboeufs, à partir des contours de bureaux de vote (INSEE) "
    "et de la liste des bureaux par circonscription (Ministère de l'Intérieur)",
    "page": "https://www.data.gouv.fr/datasets/contours-geographiques-des-circonscriptions-legislatives",
    "download_url": "https://www.data.gouv.fr/api/1/datasets/r/67c0f382-dc8d-4d1f-8a76-1162c53b9dfe",
    "version": "2024-06-13",
    "licence": "Licence Ouverte / Open Licence 2.0",
}

TOTAL_SEATS = 577

BOUNDARY_TOLERANCE_M = 50

SEATS_WITHOUT_SHAPE: dict[str, tuple[int, ...]] = {
    "977": (1,),
    "986": (1,),
    "987": (1, 2, 3),
    "988": (1, 2),
    "99": tuple(range(1, 12)),
}

ABROAD_DEPARTMENT = "99"

ABROAD_SEAT_REGIONS: dict[int, str] = {
    1: "Canada et États-Unis",
    2: "Amérique latine et Caraïbes",
    3: "Europe du Nord (Royaume-Uni, Irlande, pays nordiques et baltes)",
    4: "Benelux",
    5: "Espagne, Portugal, Andorre et Monaco",
    6: "Suisse et Liechtenstein",
    7: "Allemagne, Europe centrale et Balkans",
    8: "Italie, Grèce, Turquie, Israël, Chypre et Malte",
    9: "Maghreb et Afrique de l'Ouest",
    10: "Afrique centrale, orientale et australe, Proche et Moyen-Orient",
    11: "Europe de l'Est, Asie et Océanie",
}


def iter_features(path: Path = BOUNDARY_FILE) -> Iterator[dict]:
    """The features of the boundary file, one at a time.

    `scripts/export_circonscriptions.py` writes one feature per line, so this never
    parses the whole file at once: loading it that way kept about 130 MB of parsed
    coordinates in the API process, a line at a time keeps about 18 MB.
    """
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip().rstrip(",")
            if line.startswith('{"type":"Feature"'):
                yield json.loads(line)
