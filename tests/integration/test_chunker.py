"""
Integration tests for rag/pipeline/chunker.py aggregate SQL.

Chunker functions read from deputies, votes, and vote_positions via a
fresh psycopg2 connection to DATABASE_URL. conftest.py seeds those tables
with 3 deputies (3 parties), 25 votes, and positions for PA001 + PA002.
"""

import pytest

from rag.pipeline.chunker import (
    chunk_deputies,
    chunk_global_stats,
    chunk_party_summaries,
    chunk_votes,
)


@pytest.mark.integration
def test_chunk_votes_returns_seeded_votes(db_conn):
    chunks = chunk_votes()
    assert len(chunks) == 25
    for c in chunks:
        assert c["content"]
        assert c["metadata"]["chunk_type"] == "vote"
        assert "vote_id" in c["metadata"]


@pytest.mark.integration
def test_chunk_votes_filtered_by_ids(db_conn):
    ids = {"VTANR5L17V0001", "VTANR5L17V0002"}
    chunks = chunk_votes(vote_ids=ids)
    returned_ids = {c["metadata"]["vote_id"] for c in chunks}
    assert returned_ids == ids


@pytest.mark.integration
def test_chunk_deputies_returns_seeded_deputies(db_conn):
    chunks = chunk_deputies()
    assert len(chunks) == 3
    deputy_ids = {c["metadata"]["deputy_id"] for c in chunks}
    assert "PA001" in deputy_ids
    assert "PA002" in deputy_ids


@pytest.mark.integration
def test_chunk_deputies_content_fields(db_conn):
    chunks = chunk_deputies()
    for c in chunks:
        assert c["content"]
        assert c["metadata"]["chunk_type"] == "deputy"
        assert "full_name" in c["metadata"]


@pytest.mark.integration
def test_chunk_party_summaries_one_per_party(db_conn):
    chunks = chunk_party_summaries()
    # conftest seeds 3 deputies with 3 distinct party_short values
    party_shorts = {c["metadata"]["party_short"] for c in chunks}
    assert "RN" in party_shorts
    assert "LFI" in party_shorts
    assert "RE" in party_shorts


@pytest.mark.integration
def test_chunk_global_stats_single_chunk(db_conn):
    chunks = chunk_global_stats()
    assert len(chunks) == 1
    c = chunks[0]
    assert c["metadata"]["chunk_type"] == "global_stats"
    assert "total_deputies" in c["content"] or "député" in c["content"].lower()
