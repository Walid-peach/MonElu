"""
Unit tests never see a remote database URL (#621).

tests/conftest.py replaces any DATABASE_URL / ACCOUNT_DATABASE_URL that does
not name a local host before a single module loads .env, so ingestion code a
test forgets to mock cannot reach production.
"""

import os
from urllib.parse import urlparse

import pytest

from scripts import ingest_deputies, ingest_votes

LOCAL = {"localhost", "127.0.0.1", "::1", "postgres", "db"}


@pytest.mark.parametrize("name", ["DATABASE_URL", "ACCOUNT_DATABASE_URL"])
def test_the_environment_names_no_remote_database(name):
    url = os.environ.get(name)
    assert not url or urlparse(url).hostname in LOCAL


def test_ingestion_modules_read_the_guarded_url():
    for module in (ingest_deputies, ingest_votes):
        assert not module.DATABASE_URL or urlparse(module.DATABASE_URL).hostname in LOCAL
