"""
Pure-function tests for api/routers/agenda.py (MON-212, ADR-030).

No mocks, no DB — window resolution, week default, and dossier URL construction.
"""

from datetime import date

import pytest
from fastapi import HTTPException

from api.routers.agenda import _dossier_url, _resolve_window, _week_window


def test_week_window_monday_start():
    # 2026-08-05 is a Wednesday
    assert _week_window(date(2026, 8, 5)) == (date(2026, 8, 3), date(2026, 8, 9))


def test_week_window_when_today_is_monday():
    assert _week_window(date(2026, 8, 3)) == (date(2026, 8, 3), date(2026, 8, 9))


class _FixedDate(date):
    @classmethod
    def today(cls):
        return date(2026, 8, 5)


def test_resolve_window_defaults_to_this_week(monkeypatch):
    import api.routers.agenda as agenda_mod

    monkeypatch.setattr(agenda_mod, "date", _FixedDate)
    assert _resolve_window(None, None) == (date(2026, 8, 3), date(2026, 8, 9))


def test_resolve_window_honours_explicit_range():
    assert _resolve_window(date(2026, 9, 1), date(2026, 9, 10)) == (
        date(2026, 9, 1),
        date(2026, 9, 10),
    )


def test_resolve_window_rejects_partial_range():
    with pytest.raises(HTTPException) as exc:
        _resolve_window(date(2026, 9, 1), None)
    assert exc.value.status_code == 422


def test_resolve_window_rejects_to_before_from():
    with pytest.raises(HTTPException) as exc:
        _resolve_window(date(2026, 9, 10), date(2026, 9, 1))
    assert exc.value.status_code == 422


def test_resolve_window_rejects_span_over_max():
    with pytest.raises(HTTPException) as exc:
        _resolve_window(date(2026, 1, 1), date(2026, 12, 31))
    assert exc.value.status_code == 422


def test_dossier_url_construction():
    assert _dossier_url("DLR5L17N12345") == (
        "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N12345"
    )
