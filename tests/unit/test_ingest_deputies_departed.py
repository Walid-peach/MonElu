"""
Tests for closing the mandate of deputies who left the Assemblée (#621).

AMO10 lists sitting deputies only, so a departed deputy just disappears from
it; `close_departed_mandates` gives them the end date AMO20 records.
"""

from unittest.mock import MagicMock, patch

from scripts import ingest_deputies
from scripts.ingest_deputies import an_mandate_end, close_departed_mandates


def _seat(start, end=None, legislature="17", organe="ASSEMBLEE"):
    return {
        "typeOrgane": organe,
        "legislature": legislature,
        "dateDebut": start,
        "dateFin": end,
    }


def _acteur(uid, *mandats):
    return {"uid": {"#text": uid}, "mandats": {"mandat": list(mandats)}}


class TestAnMandateEnd:
    def test_a_running_seat_has_no_end(self):
        assert an_mandate_end(_acteur("PA1", _seat("2024-07-07"))) is None

    def test_an_ended_seat_gives_its_end_date(self):
        acteur = _acteur("PA1", _seat("2024-07-07", "2026-09-30T00:00:00.000+02:00"))
        assert an_mandate_end(acteur) == "2026-09-30"

    def test_the_latest_end_wins_when_both_seats_started_on_election_day(self):
        # Astrid Panosyan-Bouvet: appointed minister, then back, then left.
        acteur = _acteur(
            "PA795050",
            _seat("2024-07-07", "2024-10-21"),
            _seat("2024-07-07", "2026-08-04"),
        )
        assert an_mandate_end(acteur) == "2026-08-04"

    def test_any_running_seat_means_still_sitting(self):
        acteur = _acteur("PA1", _seat("2024-07-07", "2024-10-21"), _seat("2025-01-01"))
        assert an_mandate_end(acteur) is None

    def test_other_legislatures_and_organes_are_ignored(self):
        acteur = _acteur(
            "PA1",
            _seat("2022-06-22", "2024-06-09", legislature="16"),
            _seat("2026-10-01", organe="SENAT", legislature=None),
        )
        assert an_mandate_end(acteur) is None

    def test_a_single_mandate_may_come_as_a_dict(self):
        acteur = {"uid": {"#text": "PA1"}, "mandats": {"mandat": _seat("2024-07-07", "2026-07-08")}}
        assert an_mandate_end(acteur) == "2026-07-08"


def _conn(departed_ids):
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchall.return_value = [(d,) for d in departed_ids]
    return conn, cur


class TestCloseDepartedMandates:
    def test_closes_each_departed_deputy_with_its_amo20_end_date(self):
        conn, cur = _conn(["PA719218", "PA841017"])
        acteurs = [
            _acteur("PA719218", _seat("2024-07-07", "2026-08-04")),
            _acteur("PA841017", _seat("2024-07-07", "2026-07-25")),
        ]
        with (
            patch.object(ingest_deputies, "connect_with_retry", return_value=conn),
            patch.object(ingest_deputies.psycopg2.extras, "execute_batch") as batch,
        ):
            ends = close_departed_mandates(["PA840135"], fetch_all_mandates=lambda: acteurs)

        assert ends == {"PA719218": "2026-08-04", "PA841017": "2026-07-25"}
        assert cur.execute.call_args.args[1] == {"active_ids": ["PA840135"]}
        assert batch.call_args.args[2] == [
            {"deputy_id": "PA719218", "mandate_end": "2026-08-04"},
            {"deputy_id": "PA841017", "mandate_end": "2026-07-25"},
        ]
        conn.close.assert_called_once()

    def test_downloads_nothing_when_nobody_left(self):
        conn, _ = _conn([])
        fetch = MagicMock()
        with patch.object(ingest_deputies, "connect_with_retry", return_value=conn):
            assert close_departed_mandates(["PA1"], fetch_all_mandates=fetch) == {}
        fetch.assert_not_called()

    def test_leaves_a_deputy_amo20_does_not_show_as_departed(self):
        conn, _ = _conn(["PA1", "PA2"])
        acteurs = [_acteur("PA1", _seat("2024-07-07"))]  # PA2 absent, PA1 still running
        with (
            patch.object(ingest_deputies, "connect_with_retry", return_value=conn),
            patch.object(ingest_deputies.psycopg2.extras, "execute_batch") as batch,
        ):
            ends = close_departed_mandates([], fetch_all_mandates=lambda: acteurs)
        assert ends == {"PA1": None, "PA2": None}
        assert batch.call_args.args[2] == []

    def test_never_raises_into_the_critical_step(self):
        conn, _ = _conn(["PA1"])

        def broken():
            raise OSError("AN portal down")

        with patch.object(ingest_deputies, "connect_with_retry", return_value=conn):
            assert close_departed_mandates([], fetch_all_mandates=broken) == {}
        conn.close.assert_called_once()

    def test_a_failed_connection_does_not_raise_either(self):
        with patch.object(ingest_deputies, "connect_with_retry", side_effect=OSError("down")):
            assert close_departed_mandates([]) == {}


def test_upsert_closes_departed_mandates_after_writing_the_sitting_ones():
    item = {
        "uid": {"#text": "PA1"},
        "etatCivil": {"ident": {"prenom": "Jean", "nom": "Dupont"}},
        "mandats": {"mandat": _seat("2024-07-07")},
    }
    with (
        patch.object(ingest_deputies, "_upsert_records") as upsert,
        patch.object(ingest_deputies, "close_departed_mandates") as close,
    ):
        ingest_deputies.upsert_deputies([item])
    upsert.assert_called_once()
    close.assert_called_once_with(["PA1"])
