"""
api/groups_data.py

Slug -> canonical party label map used by the /groups router (MON-150).

Per ADR-026: group membership has no dimension table or slug column —
`deputies.party` is one of the 12 labels enforced by
`scripts/backfill_party_labels.py::CANONICAL_LABELS`. This hardcodes the
slug for each, mirroring the DEPT_NAMES pattern in api/departments_data.py
rather than introducing a groups table. Slugs are full human-readable
strings (SEO/citability), not the existing CANONICAL_SHORT_LABELS codes —
`lfi-nfp` in particular is a deliberate exception, not a bug: see ADR-026.
"""

GROUP_SLUGS: dict[str, str] = {
    "rassemblement-national": "Rassemblement National",
    "ensemble-pour-la-republique": "Ensemble pour la République",
    "lfi-nfp": "La France insoumise - Nouveau Front Populaire",
    "socialistes-et-apparentes": "Socialistes et apparentés",
    "droite-republicaine": "Droite Républicaine",
    "ecologiste-et-social": "Écologiste et Social",
    "les-democrates": "Les Démocrates",
    "horizons-independants": "Horizons & Indépendants",
    "liot": "Libertés, Indépendants, Outre-mer et Territoires",
    "union-des-droites": "Union des droites pour la République",
    "gauche-democrate-republicaine": "Gauche Démocrate et Républicaine",
    "non-inscrits": "Non inscrit",
}


# Canonical full name -> short group code, one entry per
# scripts/backfill_party_labels.py::CANONICAL_LABELS. GET /groups derives a
# group's `party_short` from it rather than from the deputies table, so a stray
# value on one deputy's row cannot become the group's chip (#517).
# Keep in sync with frontend/src/lib/utils.ts::partyShort() — party_short is
# read directly by the frontend (vote group breakdown, dissident detection)
# and must match the keys that map/utils there expect.
CANONICAL_SHORT_LABELS: dict[str, str] = {
    "Rassemblement National": "RN",
    "Ensemble pour la République": "EPR",
    "La France insoumise - Nouveau Front Populaire": "LFI",
    "Socialistes et apparentés": "SOC",
    "Droite Républicaine": "DR",
    "Écologiste et Social": "ECS",
    "Les Démocrates": "DEM",
    "Horizons & Indépendants": "HOR",
    "Libertés, Indépendants, Outre-mer et Territoires": "LIOT",
    "Union des droites pour la République": "UDR",
    "Gauche Démocrate et Républicaine": "GDR",
    "Non inscrit": "NI",
}


def normalize_slug(raw: str) -> str | None:
    """Canonical party label for a slug, or None if it doesn't match a known group."""
    return GROUP_SLUGS.get(raw.strip().lower())
