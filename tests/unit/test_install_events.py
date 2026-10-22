"""Unit tests for POST /install-events (#598)."""

import re
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from api.routers.install_events import INSTALL_EVENTS, SQL_INCREMENT, InstallEventRequest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "data" / "migrations" / "014_install_events.sql"
FRONTEND_EVENTS = ROOT / "frontend" / "src" / "lib" / "installEvents.ts"


def test_each_known_event_is_accepted():
    for event in INSTALL_EVENTS:
        assert InstallEventRequest(event=event).event == event


def test_unknown_event_is_rejected():
    with pytest.raises(ValidationError):
        InstallEventRequest(event="deputy_PA720892_viewed")


def test_extra_fields_cannot_smuggle_data():
    """Only `event` is read: anything else a caller sends is never stored."""
    req = InstallEventRequest.model_validate({"event": "app_installed", "deputy_id": "PA1"})
    assert req.model_dump() == {"event": "app_installed"}


def test_increment_keeps_only_a_paris_day_and_an_event():
    assert "(now() AT TIME ZONE 'Europe/Paris')::date" in SQL_INCREMENT
    assert "ON CONFLICT (day, event) DO UPDATE SET count = install_event_counts.count + 1" in (
        " ".join(SQL_INCREMENT.split())
    )
    columns = re.search(r"install_event_counts \(([^)]*)\)", SQL_INCREMENT).group(1)
    assert [c.strip() for c in columns.split(",")] == ["day", "event", "count"]


def test_migration_check_matches_the_api_events():
    sql = MIGRATION.read_text()
    block = re.search(r"event\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(event IN \((.*?)\)\)", sql, re.DOTALL)
    assert block, "event CHECK not found"
    assert set(re.findall(r"'([a-z_]+)'", block.group(1))) == set(INSTALL_EVENTS)


def test_frontend_sends_the_same_events():
    source = FRONTEND_EVENTS.read_text()
    block = re.search(r"INSTALL_EVENTS = \[(.*?)\] as const", source, re.DOTALL)
    assert block, "INSTALL_EVENTS not found in installEvents.ts"
    assert set(re.findall(r"'([a-z_]+)'", block.group(1))) == set(INSTALL_EVENTS)


def test_record_install_event_increments(client, mock_cursor):
    resp = client.post("/install-events", json={"event": "standalone_visit"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    sql, params = mock_cursor.execute.call_args.args
    assert "install_event_counts" in sql
    assert params == {"event": "standalone_visit"}


def test_record_install_event_rejects_unknown_event(client, mock_cursor):
    resp = client.post("/install-events", json={"event": "nope"})
    assert resp.status_code == 422
    mock_cursor.execute.assert_not_called()


def test_record_install_event_db_error_returns_500(client):
    with patch("api.routers.install_events.get_conn", side_effect=RuntimeError("db down")):
        resp = client.post("/install-events", json={"event": "app_installed"})
    assert resp.status_code == 500
