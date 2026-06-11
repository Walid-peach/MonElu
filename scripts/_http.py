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


def download_with_retry(url: str, timeout: int = 60) -> bytes:
    """GET with exponential backoff on 429 / 5xx / network errors; returns raw bytes."""
    for attempt in range(MAX_RETRIES):
        last_attempt = attempt == MAX_RETRIES - 1
        try:
            resp = requests.get(url, timeout=timeout)
            if resp.status_code == 429:
                if not last_attempt:
                    wait = BACKOFF_BASE**attempt
                    log.warning("Rate-limited (429). Retrying in %ss…", wait)
                    time.sleep(wait)
                continue
            if resp.status_code >= 500:
                if not last_attempt:
                    wait = BACKOFF_BASE**attempt
                    log.warning("Server error %s. Retrying in %ss…", resp.status_code, wait)
                    time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            if not last_attempt:
                wait = BACKOFF_BASE**attempt
                log.warning("Request failed (%s). Retrying in %ss…", exc, wait)
                time.sleep(wait)
    raise RuntimeError(f"Failed to download {url} after {MAX_RETRIES} attempts")


def connect_with_retry(dsn: str | None = None) -> psycopg2.extensions.connection:
    """Connect to Postgres with exponential backoff (handles transient proxy drops)."""
    dsn = dsn or os.getenv("DATABASE_URL")
    for attempt in range(MAX_RETRIES):
        try:
            return psycopg2.connect(dsn)
        except psycopg2.OperationalError as exc:
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_BASE**attempt
                log.warning("DB connection failed (%s). Retrying in %ss…", exc, wait)
                time.sleep(wait)
    raise RuntimeError(f"Could not connect to DB after {MAX_RETRIES} attempts")
