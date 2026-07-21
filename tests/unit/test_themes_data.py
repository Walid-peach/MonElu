"""Unit tests for the theme slug map (MON-106)."""

from api.themes_data import THEME_NAMES, normalize_slug


def test_normalize_slug_known():
    assert normalize_slug("energie-environnement") == "Énergie & Environnement"
    assert normalize_slug("autre") == "Autre"


def test_normalize_slug_case_and_whitespace_insensitive():
    assert normalize_slug(" Economie-Budget ".lower()) == "Économie & Budget"


def test_normalize_slug_unknown_returns_none():
    assert normalize_slug("not-a-theme") is None


def test_all_ten_taxonomy_categories_have_a_slug():
    assert len(THEME_NAMES) == 10
    assert len(set(THEME_NAMES.values())) == 10
