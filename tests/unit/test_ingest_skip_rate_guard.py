"""
Tests for the parse-failure guards in the four ingestion parsers: a shape
change upstream must exit 1 instead of silently shipping a skeleton dataset
with fresh ingested_at stamps.

ingest_deputies / ingest_votes carry the original skip-rate guard (MON-220);
ingest_positions and ingest_agenda carry the yield guards added in MON-249,
and all four share SKIP_RATE_THRESHOLD from scripts._http.
"""

import io
import json
import zipfile
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from scripts import ingest_positions
from scripts._http import SKIP_RATE_THRESHOLD
from scripts.ingest_agenda import check_agenda_yield, parse_reunions
from scripts.ingest_deputies import upsert_deputies
from scripts.ingest_positions import check_position_yield
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


class TestSharedThreshold:
    """All four parsers must move together — MON-249 folded the duplicated
    constant into scripts/_http.py so a future retune cannot drift."""

    def test_every_parser_uses_the_shared_constant(self):
        from scripts import ingest_agenda, ingest_deputies, ingest_positions, ingest_votes

        for module in (ingest_deputies, ingest_votes, ingest_positions, ingest_agenda):
            assert module.SKIP_RATE_THRESHOLD is SKIP_RATE_THRESHOLD


class TestIngestPositionsYieldGuard:
    def test_zero_written_with_known_votes_exits(self):
        # The ventilationVotes reshape: every extract_positions call returns [].
        with pytest.raises(SystemExit) as exc_info:
            check_position_yield(
                written=0, skipped_unknown_deputy=0, known_votes_count=120, matched_scrutins=120
            )
        assert exc_info.value.code == 1

    def test_zero_written_with_no_known_votes_is_fine(self):
        # Recess: the --since window holds no votes, so there is nothing to write.
        check_position_yield(
            written=0, skipped_unknown_deputy=0, known_votes_count=0, matched_scrutins=0
        )

    def test_high_unknown_deputy_rate_exits(self):
        with pytest.raises(SystemExit) as exc_info:
            check_position_yield(
                written=900, skipped_unknown_deputy=100, known_votes_count=2, matched_scrutins=2
            )
        assert exc_info.value.code == 1

    def test_low_unknown_deputy_rate_passes(self):
        # A handful of unknown acteurRefs (a deputy sworn in mid-window) is normal.
        check_position_yield(
            written=1000, skipped_unknown_deputy=10, known_votes_count=2, matched_scrutins=2
        )


class TestIngestAgendaYieldGuard:
    def test_all_points_unparsed_exits(self):
        with pytest.raises(SystemExit) as exc_info:
            check_agenda_yield(parsed=0, points_seen=40, past_seance_in_window=5)
        assert exc_info.value.code == 1

    def test_high_unparsed_rate_exits(self):
        with pytest.raises(SystemExit) as exc_info:
            check_agenda_yield(parsed=90, points_seen=100, past_seance_in_window=12)
        assert exc_info.value.code == 1

    def test_low_unparsed_rate_passes(self):
        check_agenda_yield(parsed=99, points_seen=100, past_seance_in_window=12)

    def test_no_points_in_window_is_not_a_failure(self):
        # Recess, or a --since window whose only séance is still ahead with no
        # ODJ published yet — no past sitting to contradict the empty result.
        check_agenda_yield(parsed=0, points_seen=0, past_seance_in_window=0)

    def test_no_points_despite_past_sittings_exits(self):
        # The ODJ container itself was renamed: _odj_points returns [] for every
        # réunion, so points_seen is 0 even though past sittings are in window.
        with pytest.raises(SystemExit) as exc_info:
            check_agenda_yield(parsed=0, points_seen=0, past_seance_in_window=8)
        assert exc_info.value.code == 1

    def test_parse_reunions_exits_when_every_point_fails_to_parse(self):
        # A séance réunion whose ODJ points no longer carry a uid — the exact
        # shape a feed reshape produces (MON-249).
        reunions = [
            {
                "@xsi:type": "seance_type",
                "uid": "RU1",
                "timeStampDebut": "2026-01-15T09:00:00",
                "ODJ": {"pointsODJ": {"pointODJ": [{"objet": "Sans uid"}, {"objet": "Non plus"}]}},
            }
        ]
        with pytest.raises(SystemExit) as exc_info:
            parse_reunions(reunions)
        assert exc_info.value.code == 1

    def test_parse_reunions_does_not_exit_when_only_commissions_are_present(self):
        reunions = [{"@xsi:type": "commission_type", "uid": "RU2"}]
        assert parse_reunions(reunions) == []

    def test_parse_reunions_exits_when_the_odj_container_is_renamed(self):
        # _odj_points walks ODJ.pointsODJ.pointODJ; renaming any level of that
        # path yields no points at all, which the parsed-vs-seen ratio cannot
        # see. Past sittings in the window are what make it detectable (MON-249).
        past = (date.today() - timedelta(days=7)).isoformat()
        reunions = [
            {
                "@xsi:type": "seance_type",
                "uid": f"RU{i}",
                "timeStampDebut": f"{past}T09:00:00",
                "ODJ": {"pointsODJRenamed": {"pointODJ": [{"uid": f"P{i}"}]}},
            }
            for i in range(3)
        ]
        with pytest.raises(SystemExit) as exc_info:
            parse_reunions(reunions)
        assert exc_info.value.code == 1

    def test_parse_reunions_tolerates_a_future_sitting_with_no_odj_yet(self):
        # First sitting back after a recess, ODJ not published — must not exit.
        future = (date.today() + timedelta(days=7)).isoformat()
        reunions = [
            {"@xsi:type": "seance_type", "uid": "RU1", "timeStampDebut": f"{future}T09:00:00"}
        ]
        assert parse_reunions(reunions) == []


def _scrutins_zip(scrutins: list[dict]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for scrutin in scrutins:
            zf.writestr(f"json/{scrutin['uid']}.json", json.dumps({"scrutin": scrutin}))
    return buf.getvalue()


def _known_ids_conn(vote_ids: list[str], deputy_ids: list[str]) -> MagicMock:
    cur = MagicMock()
    cur.fetchall.side_effect = [[(v,) for v in vote_ids], [(d,) for d in deputy_ids]]
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    return conn


class TestIngestPositionsRunWiring:
    """End-to-end over run()'s loop: the split counters must actually reach the
    guard, which a pure check_position_yield() test cannot prove."""

    def _run(self, scrutins, vote_ids, deputy_ids):
        conn = _known_ids_conn(vote_ids, deputy_ids)
        with (
            patch.object(
                ingest_positions, "fetch_scrutin_zip", return_value=_scrutins_zip(scrutins)
            ),
            patch.object(ingest_positions, "connect_with_retry", return_value=conn),
            patch.object(ingest_positions, "upsert_positions") as mock_upsert,
            patch.object(ingest_positions, "DATABASE_URL", "postgresql://test"),
        ):
            ingest_positions.run()
        return mock_upsert

    def test_reshaped_ventilation_votes_exits_1(self):
        # ventilationVotes renamed upstream: extract_positions returns [] for every
        # scrutin, so the run writes nothing and must fail loudly (MON-249).
        scrutins = [{"uid": "VTANR5L17V1", "ventilationVotesRenamed": {}}]
        with pytest.raises(SystemExit) as exc_info:
            self._run(scrutins, vote_ids=["VTANR5L17V1"], deputy_ids=["PA1"])
        assert exc_info.value.code == 1

    def test_healthy_feed_writes_and_exits_cleanly(self):
        scrutins = [
            {
                "uid": "VTANR5L17V1",
                "ventilationVotes": {
                    "organe": {
                        "groupes": {
                            "groupe": {
                                "vote": {
                                    "decompteNominatif": {
                                        "pours": {"votant": [{"acteurRef": "PA1"}]},
                                        "contres": {"votant": [{"acteurRef": "PA2"}]},
                                    }
                                }
                            }
                        }
                    }
                },
            }
        ]
        mock_upsert = self._run(scrutins, vote_ids=["VTANR5L17V1"], deputy_ids=["PA1", "PA2"])
        assert [r["deputy_id"] for r in mock_upsert.call_args[0][0]] == ["PA1", "PA2"]
