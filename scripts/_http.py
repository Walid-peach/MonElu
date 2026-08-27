"""
scripts/_http.py
Shared download / DB-connection helpers for the ingestion scripts.

Single source of truth for the retry logic that was previously copy-pasted
in ingest_deputies.py, ingest_votes.py and ingest_positions.py.
"""

from __future__ import annotations

import logging
import os
import time

import psycopg2
import requests

log = logging.getLogger(__name__)

MAX_RETRIES = 5
BACKOFF_BASE = 2  # seconds

# Abort an ingestion run when more than this share of records fail to parse — a
# silent AN format change should fail loudly, not ship a skeleton dataset
# (MON-220). Shared by all four parsers (deputies, votes, positions, agenda) so
# the four guards can never drift apart (MON-249).
SKIP_RATE_THRESHOLD = 0.05


def download_with_retry(url: str, timeout: int = 60) -> bytes:
    """GET with exponential backoff on 429 / 5xx / network errors; returns raw bytes.

    Other 4xx errors are permanent (e.g. a moved/removed ZIP path) and are
    raised immediately rather than retried.
    """
    last_exc: Exception | None = None
    last_status: int | None = None
    for attempt in range(MAX_RETRIES):
        last_attempt = attempt == MAX_RETRIES - 1
        try:
            resp = requests.get(url, timeout=timeout)
            if resp.status_code == 429:
                last_status = resp.status_code
                if not last_attempt:
                    wait = BACKOFF_BASE**attempt
                    log.warning("Rate-limited (429). Retrying in %ss…", wait)
                    time.sleep(wait)
                continue
            if resp.status_code >= 500:
                last_status = resp.status_code
                if not last_attempt:
                    wait = BACKOFF_BASE**attempt
                    log.warning("Server error %s. Retrying in %ss…", resp.status_code, wait)
                    time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            last_exc = exc
            last_status = exc.response.status_code if exc.response is not None else None
            if last_status is not None and last_status < 500 and last_status != 429:
                raise RuntimeError(f"Failed to download {url}: HTTP {last_status}") from exc
            if not last_attempt:
                wait = BACKOFF_BASE**attempt
                log.warning("Request failed (%s). Retrying in %ss…", exc, wait)
                time.sleep(wait)
    status_suffix = f" (last status: {last_status})" if last_status is not None else ""
    raise RuntimeError(
        f"Failed to download {url} after {MAX_RETRIES} attempts{status_suffix}"
    ) from last_exc


def connect_with_retry(dsn: str | None = None) -> psycopg2.extensions.connection:
    """Connect to Postgres with exponential backoff (handles transient proxy drops)."""
    dsn = dsn or os.getenv("DATABASE_URL")
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return psycopg2.connect(dsn)
        except psycopg2.OperationalError as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_BASE**attempt
                log.warning("DB connection failed (%s). Retrying in %ss…", exc, wait)
                time.sleep(wait)
    raise RuntimeError(f"Could not connect to DB after {MAX_RETRIES} attempts") from last_exc
