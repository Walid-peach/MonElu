"""Seat identity for the circonscription lookup (ADR-047).

A seat is `(department, circonscription)`: the department code as `deputies.department`
codes are normalized by `api.departments_data.normalize_department_code` ("01", "2A",
"971", "99") and the circonscription number as an int.

The boundary source codes overseas départements with the Ministère de l'Intérieur's
letter codes (ZA for Guadeloupe ...) and writes circonscriptions as "0104" or "ZA01";
`seat_key_from_source` is the one place that translation happens.
"""

from __future__ import annotations

from pathlib import Path

# Ministère de l'Intérieur letter codes for the overseas départements and collectivités.
INTERIOR_OVERSEAS_CODES = {
    "ZA": "971",  # Guadeloupe
    "ZB": "972",  # Martinique
    "ZC": "973",  # Guyane
    "ZD": "974",  # La Réunion
    "ZM": "976",  # Mayotte
    "ZS": "975",  # Saint-Pierre-et-Miquelon
    "ZX": "977",  # Saint-Barthélemy et Saint-Martin
    "ZW": "986",  # Wallis-et-Futuna
    "ZP": "987",  # Polynésie française
    "ZN": "988",  # Nouvelle-Calédonie
    "ZZ": "99",  # Français établis hors de France
}


def seat_key_from_source(department: str, circonscription: str) -> tuple[str, int]:
    """("ZA", "ZA01") -> ("971", 1); ("01", "0104") -> ("01", 4); ("2A", "2A02") -> ("2A", 2)."""
    department = department.strip().upper()
    department = INTERIOR_OVERSEAS_CODES.get(department, department)
    number = int(circonscription.strip()[-2:])
    return department, number


BOUNDARY_FILE = Path(__file__).resolve().parent.parent / "data" / "geo" / "circonscriptions.geojson"

# The source of data/geo/circonscriptions.geojson (ADR-047 §1). Chosen over the more
# simplified "p10" variant of the same dataset and over INSEE's official file by
# scripts/measure_circonscription_accuracy.py (#661): 99.81 % of 3.8 million addresses
# in communes wholly inside one seat land in it, against 99.71 % and 99.20 %.
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

# Seats the boundary file has no shape for (ADR-047 §7): the 11 seats abroad, and the
# overseas collectivités the source does not cover. Their visitors use the list of the
# department's seats instead.
SEATS_WITHOUT_SHAPE: dict[str, tuple[int, ...]] = {
    "977": (1,),  # Saint-Barthélemy et Saint-Martin
    "986": (1,),  # Wallis-et-Futuna
    "987": (1, 2, 3),  # Polynésie française
    "988": (1, 2),  # Nouvelle-Calédonie
    "99": tuple(range(1, 12)),  # Français établis hors de France
}

ABROAD_DEPARTMENT = "99"

# Region of each seat abroad, in the words commonly used for them (ADR-047 §7). No
# country-to-seat table: its only authority is tableau n° 1 ter of the Code électoral.
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
