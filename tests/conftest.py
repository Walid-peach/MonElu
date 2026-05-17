from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import api.db as _db
from api.main import app


@pytest.fixture(scope="module")
def client():
    with patch("api.main.init_pool"), patch("api.main.close_pool"):
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

    with patch.object(_db, "_pool", pool):
        yield cursor
