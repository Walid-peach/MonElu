"""
Static invariants of scripts/purge_test_fixtures.py.

The STATEMENTS list is order-sensitive: statements whose SQL subselects
from `votes` must run before the statement that deletes fixture votes,
otherwise their subqueries match nothing in a single --apply run.
"""

from scripts.purge_test_fixtures import STATEMENTS


def _index_of(label: str) -> int:
    for i, (stmt_label, _, _) in enumerate(STATEMENTS):
        if stmt_label == label:
            return i
    raise AssertionError(f"statement {label!r} not found")


def test_votes_dependent_statements_run_before_votes_delete():
    votes_delete = _index_of("fixture votes")
    for label, _count_sql, delete_sql in STATEMENTS:
        if label != "fixture votes" and "FROM votes" in delete_sql:
            assert _index_of(label) < votes_delete, (
                f"{label!r} subselects from votes but runs after the fixture-votes delete"
            )


def test_fk_children_run_before_parents():
    assert _index_of("vote_positions of fixture votes") < _index_of("fixture votes")
    assert _index_of("vote_positions of fixture deputies") < _index_of("fixture deputies")


def test_all_statements_are_parameterized_not_interpolated():
    for _label, count_sql, delete_sql in STATEMENTS:
        for sql in (count_sql, delete_sql):
            assert "%(" in sql, "statement must use named parameters"
            assert "format" not in sql.lower()
