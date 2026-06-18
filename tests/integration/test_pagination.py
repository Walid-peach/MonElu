"""
Integration tests for keyset pagination against a real Postgres instance.

The fixture seeds 25 votes in mart_vote_summary (via conftest.py).
We verify that cursor-based pagination walks the full dataset without gaps
or overlaps — the exact bug class that "mock matched, SQL didn't" misses.
"""

import pytest
from psycopg2 import sql

from api.routers.votes import _decode_cursor, _encode_cursor


def _list_page(cur, *, limit: int, cursor=None, result_filter=None):
    """Run the same keyset SQL used by api/routers/votes.py list_votes."""
    conditions = []
    params = []

    if result_filter:
        conditions.append(sql.SQL("result = %s"))
        params.append(result_filter)

    cursor_key = _decode_cursor(cursor) if cursor else None
    page_conditions = list(conditions)
    page_params = list(params)
    if cursor_key:
        page_conditions.append(sql.SQL("(voted_at, vote_id) < (%s, %s)"))
        page_params.extend(cursor_key)

    where = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(page_conditions)
        if page_conditions
        else sql.SQL("")
    )

    cur.execute(
        sql.SQL(
            """
            SELECT vote_id, voted_at, result
            FROM analytics_marts.mart_vote_summary {}
            ORDER BY voted_at DESC, vote_id DESC
            LIMIT %s
            """
        ).format(where),
        page_params + [limit],
    )
    rows = cur.fetchall()
    next_cursor = (
        _encode_cursor(rows[-1]["voted_at"], rows[-1]["vote_id"]) if len(rows) == limit else None
    )
    return rows, next_cursor


@pytest.mark.integration
def test_first_page_returns_limit_rows(db_conn):
    with db_conn.cursor() as cur:
        rows, next_cursor = _list_page(cur, limit=10)
    assert len(rows) == 10
    assert next_cursor is not None


@pytest.mark.integration
def test_second_page_continues_without_overlap(db_conn):
    with db_conn.cursor() as cur:
        page1, cursor1 = _list_page(cur, limit=10)
        page2, cursor2 = _list_page(cur, limit=10, cursor=cursor1)

    ids1 = {r["vote_id"] for r in page1}
    ids2 = {r["vote_id"] for r in page2}
    assert len(ids2) == 10
    assert ids1.isdisjoint(ids2), "pages must not share vote_ids"
    assert cursor2 is not None


@pytest.mark.integration
def test_third_page_exhausts_dataset(db_conn):
    """With 25 votes and limit=10 the third page has 5 rows and no next_cursor."""
    with db_conn.cursor() as cur:
        _, c1 = _list_page(cur, limit=10)
        _, c2 = _list_page(cur, limit=10, cursor=c1)
        page3, c3 = _list_page(cur, limit=10, cursor=c2)

    assert len(page3) == 5
    assert c3 is None


@pytest.mark.integration
def test_all_pages_cover_full_dataset(db_conn):
    """Walking all pages must return exactly 25 distinct vote_ids."""
    all_ids = set()
    cursor = None
    with db_conn.cursor() as cur:
        while True:
            rows, cursor = _list_page(cur, limit=10, cursor=cursor)
            all_ids.update(r["vote_id"] for r in rows)
            if cursor is None:
                break

    assert len(all_ids) == 25


@pytest.mark.integration
def test_cursor_encode_decode_roundtrip(db_conn):
    """_decode_cursor(_encode_cursor(ts, id)) must be lossless."""
    from datetime import datetime, timezone

    ts = datetime(2026, 3, 15, 10, 30, 0, tzinfo=timezone.utc)
    vote_id = "VTANR5L17V9999"
    decoded_ts, decoded_id = _decode_cursor(_encode_cursor(ts, vote_id))
    assert decoded_ts == ts
    assert decoded_id == vote_id


@pytest.mark.integration
def test_result_filter_scopes_pages(db_conn):
    """Filtering by result='rejeté' must return only rejected votes."""
    all_ids = set()
    cursor = None
    with db_conn.cursor() as cur:
        while True:
            rows, cursor = _list_page(cur, limit=10, cursor=cursor, result_filter="rejeté")
            for r in rows:
                assert r["result"] == "rejeté"
            all_ids.update(r["vote_id"] for r in rows)
            if cursor is None:
                break

    # conftest seeds i%3==0 as "rejeté": i=3,6,9,12,15,18,21,24 → 8 votes
    assert len(all_ids) == 8
