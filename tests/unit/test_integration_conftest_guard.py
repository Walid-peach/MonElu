"""
Guards against repeating the Supabase-contamination incident: the
integration-test fixture must refuse to run against anything but a
disposable local/CI database, no matter what DATABASE_URL happens to be
set in the developer's shell.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "integration"))

from conftest import _assert_safe_test_database  # noqa: E402

_SUPABASE_URL = (
    "postgresql://postgres:pw@db.example.supabase.co:5432/postgres"  # pragma: allowlist secret
)


def test_rejects_supabase_host():
    with pytest.raises(pytest.fail.Exception):
        _assert_safe_test_database(_SUPABASE_URL)


def test_rejects_unknown_remote_host():
    with pytest.raises(pytest.fail.Exception):
        _assert_safe_test_database(
            "postgresql://user:pw@some-remote-host.example.com:5432/db"  # pragma: allowlist secret
        )


def test_allows_localhost():
    _assert_safe_test_database("postgresql://ci:ci@localhost:5432/ci")  # pragma: allowlist secret


def test_allows_127_0_0_1():
    _assert_safe_test_database(
        "postgresql://monelu:monelu@127.0.0.1:5432/monelu"  # pragma: allowlist secret
    )
