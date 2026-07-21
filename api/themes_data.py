"""
api/themes_data.py

Theme slug <-> name map used by the /themes router (MON-106).

The theme taxonomy itself (10 fixed categories) is already established by
scripts/generate_vote_summaries.py (VALID_THEMES) and enforced there — no
normalization needed here, just a stable URL slug per theme.
frontend/src/lib/themes.ts carries the same map for rendering.
"""

THEME_NAMES = {
    "economie-budget": "Économie & Budget",
    "sante-social": "Santé & Social",
    "justice-securite": "Justice & Sécurité",
    "energie-environnement": "Énergie & Environnement",
    "education-culture": "Éducation & Culture",
    "agriculture": "Agriculture",
    "transport-logement": "Transport & Logement",
    "institutions": "Institutions",
    "international": "International",
    "autre": "Autre",
}

SLUGS_BY_NAME = {name: slug for slug, name in THEME_NAMES.items()}


def normalize_slug(raw: str) -> str | None:
    """Canonical theme name for a slug, or None if the slug is unknown."""
    return THEME_NAMES.get(raw.strip().lower())
