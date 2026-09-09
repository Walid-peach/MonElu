"""
Tests for the staging-table lifecycle in rag/pipeline/index_manager.py.

MON-233 made the full rebuild atomic by embedding into document_chunks_staging
and swapping it in. MON-256 closes the two holes that left behind:

* a build that exits without swapping - including one killed by the SIGTERM a
  GitHub Actions job timeout sends - must drop the staging table, not leave
  tens of MB of vector(1536) rows on a 500 MB tier;
* an orphan that does survive (SIGKILL cannot be caught) must be visible,
  which is what staging_chunk_count() reports.

MON-256 also removed the incremental `build --since` path: it wrote directly to
the live document_chunks, contradicting the atomic-swap contract, and nothing
in production called it.
"""

import os
import signal
from pathlib import Path
from unittest.mock import patch

import pytest

from rag.pipeline import index_manager

MODULE_SOURCE = Path(index_manager.__file__).read_text(encoding="utf-8")


@pytest.fixture
def build_doubles():
    """Patch every DB-touching step of _build_full_index_atomic."""
    with (
        patch.object(index_manager, "_create_staging_table") as create,
        patch.object(index_manager, "_populate_staging_table") as populate,
        patch.object(index_manager, "_swap_in_staging_table") as swap,
        patch.object(index_manager, "_drop_staging_table") as drop,
        patch.object(index_manager, "get_index_stats"),
    ):
        yield {"create": create, "populate": populate, "swap": swap, "drop": drop}


def test_successful_build_swaps_and_leaves_no_staging_table(build_doubles):
    index_manager._build_full_index_atomic()

    build_doubles["swap"].assert_called_once()
    # The swap renames the staging table away; dropping it again would be wrong.
    build_doubles["drop"].assert_not_called()


def test_failed_build_drops_the_staging_table(build_doubles):
    build_doubles["populate"].side_effect = RuntimeError("OpenAI outage")

    with pytest.raises(RuntimeError, match="OpenAI outage"):
        index_manager._build_full_index_atomic()

    build_doubles["drop"].assert_called_once()
    build_doubles["swap"].assert_not_called()


def test_sigterm_during_table_creation_is_still_cleaned_up(build_doubles):
    """The CREATE commits on its own, so it must sit inside the signal guard."""

    def _killed(*_args, **_kwargs):
        os.kill(os.getpid(), signal.SIGTERM)

    build_doubles["create"].side_effect = _killed

    with pytest.raises(index_manager.BuildInterrupted):
        index_manager._build_full_index_atomic()

    build_doubles["drop"].assert_called_once()
    build_doubles["populate"].assert_not_called()


def test_sigterm_mid_build_drops_the_staging_table(build_doubles):
    """A job timeout / cancelled workflow sends SIGTERM before SIGKILL."""

    def _killed(*_args, **_kwargs):
        os.kill(os.getpid(), signal.SIGTERM)

    build_doubles["populate"].side_effect = _killed

    with pytest.raises(index_manager.BuildInterrupted):
        index_manager._build_full_index_atomic()

    build_doubles["drop"].assert_called_once()
    build_doubles["swap"].assert_not_called()


def test_failure_during_swap_still_drops_the_staging_table(build_doubles):
    build_doubles["swap"].side_effect = RuntimeError("connection reset")

    with pytest.raises(RuntimeError, match="connection reset"):
        index_manager._build_full_index_atomic()

    build_doubles["drop"].assert_called_once()


def test_drop_failure_does_not_mask_the_original_error(build_doubles):
    build_doubles["populate"].side_effect = RuntimeError("OpenAI outage")
    build_doubles["drop"].side_effect = RuntimeError("could not reach the DB")

    with pytest.raises(RuntimeError, match="OpenAI outage"):
        index_manager._build_full_index_atomic()


def test_signal_handlers_are_restored_after_a_build(build_doubles):
    before = signal.getsignal(signal.SIGTERM)

    index_manager._build_full_index_atomic()

    assert signal.getsignal(signal.SIGTERM) is before


def test_signal_handlers_are_restored_after_a_failed_build(build_doubles):
    before = signal.getsignal(signal.SIGINT)
    build_doubles["populate"].side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        index_manager._build_full_index_atomic()

    assert signal.getsignal(signal.SIGINT) is before


def test_staging_chunk_count_returns_none_when_absent():
    with patch.object(index_manager, "_get_conn") as get_conn:
        cursor = get_conn.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {"oid": None}

        assert index_manager.staging_chunk_count() is None


def test_staging_chunk_count_returns_row_count_when_present():
    with patch.object(index_manager, "_get_conn") as get_conn:
        cursor = get_conn.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = [{"oid": "document_chunks_staging"}, {"total": 5900}]

        assert index_manager.staging_chunk_count() == 5900


def test_build_index_takes_no_since_argument():
    """The incremental path is gone; a stray --since must not silently no-op."""
    with pytest.raises(TypeError):
        index_manager.build_index(since="2026-01-01")


def test_incremental_path_is_not_reintroduced():
    """It wrote to the live table, defeating the MON-233 atomic swap."""
    # The argparse literal, not the prose: the docstrings explain why it went.
    assert '"--since"' not in MODULE_SOURCE
    assert "_delete_aggregate_chunks" not in MODULE_SOURCE
    assert "DELETE FROM document_chunks" not in MODULE_SOURCE
