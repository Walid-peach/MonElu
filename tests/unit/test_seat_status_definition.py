"""One definition of a sitting deputy (#682).

`mandate_end IS NULL` once meant "sitting" in 30 places, and could not say that a
deputy the AN's roster no longer lists, with no end date, is not sitting either.
Migration 019's `deputy_seat_status` view is now the one definition, and these
tests keep it that way without a database: the live behaviour is in
tests/integration/test_seat_status.py.
"""

import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
MIGRATION = ROOT / "data/migrations/019_deputy_seat_status.sql"

# Any spelling of the old test, in SQL, a comment or a docstring.
OLD_SITTING = re.compile(r"mandate_end\s+IS\s+(NOT\s+)?NULL", re.IGNORECASE)


def _python_sources(*dirs: str) -> list[Path]:
    return sorted(p for d in dirs for p in (ROOT / d).rglob("*.py"))


def test_api_and_rag_never_test_mandate_end_for_null():
    """The readers go through `sitting_deputies`; a mandate window that must
    cover a date writes `COALESCE(mandate_end, 'infinity')` instead."""
    offenders = [
        f"{path.relative_to(ROOT)}:{n}"
        for path in _python_sources("api", "rag")
        for n, line in enumerate(path.read_text().splitlines(), start=1)
        if OLD_SITTING.search(line)
    ]
    assert offenders == [], f"use the sitting_deputies view instead: {offenders}"


def test_the_staging_model_reads_the_view_not_mandate_end():
    sql = (ROOT / "transform/models/staging/stg_deputies.sql").read_text()
    assert "source('raw', 'deputy_seat_status')" in sql
    assert not re.search(r"mandate_end\s+is\s+null", sql, re.IGNORECASE)


def test_the_view_has_exactly_three_states():
    sql = MIGRATION.read_text()
    view = sql[sql.index("CREATE OR REPLACE VIEW deputy_seat_status") :]
    assert re.findall(r"THEN '(\w+)'|ELSE '(\w+)'", view)[:3] == [
        ("departed", ""),
        ("sitting", ""),
        ("", "unconfirmed"),
    ]
    # departed is decided first: a set mandate_end wins over any listing.
    assert view.index("mandate_end IS NOT NULL") < view.index("last_listed_at = latest")


def test_the_views_apply_the_callers_rls():
    sql = MIGRATION.read_text()
    assert sql.count("WITH (security_invoker = true)") == 2


def test_ingestion_stamps_listing_without_touching_the_other_two_signals():
    """`last_listed_at` is a third signal: `ingested_at` still moves on every run,
    and listing a deputy is not a change (ADR-039)."""
    from scripts.ingest_deputies import CLOSE_MANDATE_SQL, UPSERT_SQL

    assert "last_listed_at  = NOW()" in UPSERT_SQL
    assert "ingested_at     = NOW()" in UPSERT_SQL
    change_test = UPSERT_SQL[UPSERT_SQL.index("changed_at      = CASE") :]
    assert "last_listed_at" not in change_test
    # Closing a mandate is AMO20's date, never a listing.
    assert "last_listed_at" not in CLOSE_MANDATE_SQL


def test_the_dbt_gate_fails_on_any_unconfirmed_deputy():
    sql = (ROOT / "transform/tests/assert_no_unconfirmed_deputy.sql").read_text()
    assert "source('raw', 'deputy_seat_status')" in sql
    assert "seat_status = 'unconfirmed'" in sql
