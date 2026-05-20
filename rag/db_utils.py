"""
rag/db_utils.py

Shared DB connection helper for the RAG pipeline.
"""

import logging
import time

import psycopg2

log = logging.getLogger(__name__)

_MAX_RETRIES = 5
_BACKOFF_BASE = 2  # seconds


def connect_with_retry(database_url: str, **kwargs) -> psycopg2.extensions.connection:
    """Open a psycopg2 connection with exponential-backoff retry on transient errors."""
    for attempt in range(_MAX_RETRIES):
        try:
            return psycopg2.connect(database_url, **kwargs)
        except psycopg2.OperationalError as exc:
            if attempt == _MAX_RETRIES - 1:
                raise
            wait = _BACKOFF_BASE**attempt
            log.warning(
                "DB connection failed (%s). Retrying in %ss… (attempt %d/%d)",
                exc,
                wait,
                attempt + 1,
                _MAX_RETRIES,
            )
            time.sleep(wait)
