from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import api.db as _db
import api.main as _main
from api.main import app


@pytest.fixture(scope="module")
def client():
    with (
        patch("api.main.init_pool"),
        patch("api.main.close_pool"),
        patch("api.main._warm_sql_pool"),
    ):
        with TestClient(app) as c:
            yield c


@pytest.fixture
def mock_cursor():
    """Patch _pool so get_conn() works without a real DB.

    Yields the mock cursor — configure fetchone/fetchall per test.
    """
    cursor = MagicMock()
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor

    pool = MagicMock()
    pool.getconn.return_value = conn
    pool.closed = False

    # The stats snapshot is cached at module level — reset it so tests don't
    # leak cached counts into each other.
    _main._stats_cache = None
    with patch.object(_db, "_pool", pool):
        yield cursor
    _main._stats_cache = None


# ---------------------------------------------------------------------------
# Live-API tests (tests/live) spend real tokens, so they are opt-in twice over:
# --run-live must be passed *and* the relevant key must be set. They are not
# part of the PR gate - see tests/live/test_groq_contract.py for why they exist.
# ---------------------------------------------------------------------------


def pytest_addoption(parser):
    parser.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="run tests marked 'live', which call paid third-party APIs",
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-live"):
        return
    skip_live = pytest.mark.skip(reason="needs --run-live (calls a paid API)")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip_live)
