import os
from unittest.mock import MagicMock, patch
from urllib.parse import urlparse

from dotenv import dotenv_values, find_dotenv

# Before anything imports a module that calls load_dotenv() (#621). From a
# worktree, find_dotenv() walks up to the main checkout's .env, whose
# DATABASE_URL may be production: a unit test that reached unmocked ingestion
# code once wrote to the production deputies table through it. Any database
# URL that does not name a local host is replaced with one that cannot
# connect (an unset one stays unset); load_dotenv() never overrides a
# variable that is already set, so .env cannot bring it back.
# tests/integration/conftest.py applies the same host rule to the suite that
# does need a database.
_LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres", "db"}
_UNREACHABLE_DB = "postgresql://unit-tests@127.0.0.1:1/unit_tests"  # pragma: allowlist secret
_dotenv = dotenv_values(find_dotenv(usecwd=True))
for _name in ("DATABASE_URL", "ACCOUNT_DATABASE_URL"):
    _url = os.environ.get(_name) or _dotenv.get(_name) or ""
    if _url and (urlparse(_url).hostname or "").lower() not in _LOCAL_DB_HOSTS:
        os.environ[_name] = _UNREACHABLE_DB

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import api.account_auth as _account_auth  # noqa: E402
import api.db as _db  # noqa: E402
import api.groq_health as _groq_health  # noqa: E402
import api.main as _main  # noqa: E402
from api.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _stub_groq_catalog():
    """Keep /health's Groq probe (GH #385) off the network in every test.

    Serves a catalog that contains every configured model, so a test that sets a
    real-looking key reads `groq: ok`. Tests of the probe itself patch
    `_fetch_catalog` again inside this one.
    """
    _groq_health.reset_cache()
    with patch.object(
        _groq_health, "_fetch_catalog", return_value=set(_groq_health.REQUIRED_MODELS)
    ):
        yield
    _groq_health.reset_cache()


@pytest.fixture(autouse=True)
def _fresh_account_rate_limit():
    """Start every test with empty per-account buckets (ADR-041 §6).

    The account suites send many requests under one test identity; without this
    they would share one 120/minute allowance across the whole run.
    """
    _account_auth.reset_account_rate_limit()
    yield
    _account_auth.reset_account_rate_limit()


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
