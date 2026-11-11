"""
Each soft-state upsert must stay one transaction (#684).

Visibility on the agenda and on bill pages compares `last_seen_at` stamps, and
the upserts stamp them with NOW(), the transaction's start time:

* `GET /agenda` shows an item when its stamp equals the table's latest
  (api/agenda_visibility.py), so `upsert_agenda_items()` must write a whole run
  in one transaction or every batch but the last disappears;
* `GET /lois/{uid}` shows an acte when its stamp is at least its dossier's
  (api/routers/lois.py), so `upsert_dossiers()` must write the dossiers and
  their actes together, dossiers first.

The integration tests in tests/integration/test_agenda.py and
test_dossiers.py show what breaks when that is not so. This file reads the
source, in the style of tests/unit/test_http_retry.py, so a change that splits
either upsert into several commits fails here without a database.
"""

import ast
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

UPSERTS = [
    ("ingest_agenda.py", "upsert_agenda_items"),
    ("ingest_dossiers.py", "upsert_dossiers"),
]


def _function(script: str, name: str) -> ast.FunctionDef:
    tree = ast.parse((SCRIPTS_DIR / script).read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{script} no longer defines {name}()")


def _transaction_blocks(func: ast.FunctionDef) -> list[ast.With]:
    """`with conn:` blocks: psycopg2 commits once, when the block exits."""
    return [
        node
        for node in ast.walk(func)
        if isinstance(node, ast.With)
        and any(
            isinstance(item.context_expr, ast.Name) and item.context_expr.id == "conn"
            for item in node.items
        )
    ]


def _calls(node: ast.AST, attr: str) -> list[ast.Call]:
    return [
        n
        for n in ast.walk(node)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == attr
    ]


@pytest.mark.parametrize(("script", "name"), UPSERTS)
def test_upsert_opens_one_connection(script, name):
    func = _function(script, name)
    connects = [
        n
        for n in ast.walk(func)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Name)
        and n.func.id == "connect_with_retry"
    ]
    assert len(connects) == 1, f"{name}() must write through a single connection"


@pytest.mark.parametrize(("script", "name"), UPSERTS)
def test_upsert_is_one_transaction(script, name):
    func = _function(script, name)
    blocks = _transaction_blocks(func)
    assert len(blocks) == 1, f"{name}() must write inside exactly one `with conn:` block"
    assert not _calls(func, "commit"), f"{name}() must not commit part way through"
    assert not any(
        isinstance(n, ast.Assign)
        and any(isinstance(t, ast.Attribute) and t.attr == "autocommit" for t in n.targets)
        for n in ast.walk(func)
    ), f"{name}() must not switch to autocommit"


@pytest.mark.parametrize(("script", "name"), UPSERTS)
def test_every_write_is_inside_the_transaction(script, name):
    func = _function(script, name)
    (block,) = _transaction_blocks(func)
    for attr in ("execute_batch", "execute", "executemany"):
        assert len(_calls(func, attr)) == len(_calls(block, attr)), (
            f"{name}() calls {attr} outside its `with conn:` block"
        )
    assert _calls(block, "execute_batch"), f"{name}() no longer upserts in its transaction"


def test_dossiers_are_written_before_their_actes():
    """An acte is visible when its stamp is >= its dossier's: both share one NOW()."""
    (block,) = _transaction_blocks(_function("ingest_dossiers.py", "upsert_dossiers"))
    statements = [
        call.args[1].id
        for call in _calls(block, "execute_batch")
        if len(call.args) > 1 and isinstance(call.args[1], ast.Name)
    ]
    assert statements == ["UPSERT_DOSSIER_SQL", "UPSERT_ACTE_SQL"]
