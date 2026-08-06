"""
api/auth.py
API key resolution for the public API tier (MON-98).

Keys are issued manually (email request -> row insert into api_keys). Only the
sha256 hash of the raw key is ever stored or compared. Active keys are cached
in-process with a short TTL so almost every request resolves from memory
instead of hitting the DB.
"""

import hashlib
import logging
import threading
import time
from dataclasses import dataclass

from api.db import get_conn

logger = logging.getLogger(__name__)

API_KEY_HEADER = "X-API-Key"  # pragma: allowlist secret
_CACHE_TTL_SECONDS = 300


@dataclass(frozen=True)
class ApiKeyRecord:
    id: int
    label: str
    rate_limit_multiplier: int


_cache_lock = threading.Lock()
_cache_by_hash: dict[str, ApiKeyRecord] = {}
_cache_loaded_at = 0.0


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _reload_cache() -> None:
    global _cache_by_hash, _cache_loaded_at
    fresh: dict[str, ApiKeyRecord] = {}
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT key_hash, id, label, rate_limit_multiplier
                    FROM api_keys
                    WHERE revoked_at IS NULL
                    """
                )
                for row in cur.fetchall():
                    fresh[row["key_hash"]] = ApiKeyRecord(
                        id=row["id"],
                        label=row["label"],
                        rate_limit_multiplier=row["rate_limit_multiplier"],
                    )
    except Exception:
        # Advance the timestamp even on failure (MON-229) - otherwise every
        # keyed request repeats this blocking query on the event loop until
        # a reload finally succeeds, stalling all concurrent requests for up
        # to the statement timeout each time. The stale cache is kept as-is.
        with _cache_lock:
            _cache_loaded_at = time.monotonic()
        raise
    with _cache_lock:
        _cache_by_hash = fresh
        _cache_loaded_at = time.monotonic()


def resolve_api_key(raw_key: str | None) -> ApiKeyRecord | None:
    """Return the active key record for a raw header value, or None if missing/invalid/revoked."""
    if not raw_key:
        return None
    with _cache_lock:
        stale = time.monotonic() - _cache_loaded_at > _CACHE_TTL_SECONDS
    if stale:
        try:
            _reload_cache()
        except Exception as exc:
            logger.warning("API key cache reload failed: %s", exc)
    return _cache_by_hash.get(_hash_key(raw_key))


def record_usage(api_key_id: int, endpoint: str) -> None:
    """Best-effort per-day usage counter increment; never raises into the request path."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO api_key_usage (api_key_id, endpoint, day, request_count)
                    VALUES (%s, %s, CURRENT_DATE, 1)
                    ON CONFLICT (api_key_id, endpoint, day)
                    DO UPDATE SET request_count = api_key_usage.request_count + 1
                    """,
                    (api_key_id, endpoint),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("API key usage logging failed: %s", exc)
