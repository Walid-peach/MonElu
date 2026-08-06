"""
Tests for the parse-failure skip-rate guard in ingest_deputies.py and
ingest_votes.py (MON-220): a high parse-skip rate must exit 1 instead of
silently upserting a skeleton dataset with fresh ingested_at stamps.
"""

from unittest.mock import patch

import pytest

from scripts.ingest_deputies import upsert_deputies
from scripts.ingest_votes import upsert_votes


def _deputy_item(uid: str) -> dict:
    return {"uid": {"#text": uid}, "etatCivil": {"ident": {"prenom": "Jean", "nom": "Dupont"}}}


def _vote_item(uid: str) -> dict:
    return {"uid": uid, "dateScrutin": "2026-01-01"}


class TestIngestDeputiesSkipRateGuard:
    def test_high_skip_rate_exits_without_upserting(self):
        # 2 valid, 19 unparseable (missing uid) => skip rate > 5%
        raw_items = [_deputy_item("PA1"), _deputy_item("PA2")] + [{}] * 19
        with patch("scripts.ingest_deputies._upsert_records") as mock_upsert:
            with pytest.raises(SystemExit) as exc_info:
                upsert_deputies(raw_items)
        assert exc_info.value.code == 1
        mock_upsert.assert_not_called()

    def test_low_skip_rate_upserts_normally(self):
        raw_items = [_deputy_item(f"PA{i}") for i in range(20)] + [{}]
        with patch("scripts.ingest_deputies._upsert_records") as mock_upsert:
            count = upsert_deputies(raw_items)
        assert count == 20
        mock_upsert.assert_called_once()


class TestIngestVotesSkipRateGuard:
    def test_high_skip_rate_exits_without_upserting(self):
        raw_items = [_vote_item("v1"), _vote_item("v2")] + [{}] * 19
        with patch("scripts.ingest_votes._upsert_records") as mock_upsert:
            with pytest.raises(SystemExit) as exc_info:
                upsert_votes(raw_items)
        assert exc_info.value.code == 1
        mock_upsert.assert_not_called()

    def test_low_skip_rate_upserts_normally(self):
        raw_items = [_vote_item(f"v{i}") for i in range(20)] + [{}]
        with patch("scripts.ingest_votes._upsert_records") as mock_upsert:
            count = upsert_votes(raw_items)
        assert count == 20
        mock_upsert.assert_called_once()
