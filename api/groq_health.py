"""
api/groq_health.py
Cached Groq liveness probe behind /health's `groq` field (GH #385).

During the #351 outage /health reported `groq: ok` for the whole time every LLM
endpoint returned 500s, because it only checked that GROQ_API_KEY was a
non-placeholder string. The key was valid; the configured models had been
decommissioned.

`GET /openai/v1/models` catches both failure modes in one cheap call that spends
no inference quota: a rejected or expired key answers 401/403, and a
decommissioned model is absent from the returned catalog. It is still a network
call on a frequently polled endpoint, so the result is cached, the call is
bounded by a short timeout with no retries, and any probe error is reported as
`unknown` rather than raised - /health must never hang or 500 because Groq did.
"""

import logging
import threading
import time

from groq import AuthenticationError, Groq, PermissionDeniedError

from rag.constants import CLASSIFIER_MODEL, LLM_MODEL

logger = logging.getLogger(__name__)

OK = "ok"
# Key rejected, or a configured model is gone: every LLM endpoint is down.
FAILING = "failing"
# The probe itself could not reach a verdict (timeout, Groq 5xx, rate limit).
# Deliberately not a failure: a blip on the catalog endpoint says nothing about
# whether inference works, and a health check that flaps teaches people to
# ignore it.
UNKNOWN = "unknown"

REQUIRED_MODELS = (LLM_MODEL, CLASSIFIER_MODEL)

# A decommission is caught within this window; between probes a cache hit
# costs nothing, so /health latency is unchanged in the common case.
_PROBE_TTL_SECONDS = 600.0
# An inconclusive probe is retried sooner, so a transient blip clears quickly.
_UNKNOWN_TTL_SECONDS = 60.0
_PROBE_TIMEOUT_SECONDS = 3.0

_lock = threading.Lock()
# (api_key, status, detail, probed_at) - keyed on the key so a rotation re-probes.
_cache: tuple[str, str, str | None, float] | None = None


def _fetch_catalog(api_key: str) -> set[str]:
    client = Groq(api_key=api_key, timeout=_PROBE_TIMEOUT_SECONDS, max_retries=0)
    return {m.id for m in client.models.list().data}


def _probe(api_key: str) -> tuple[str, str | None]:
    try:
        catalog = _fetch_catalog(api_key)
    except (AuthenticationError, PermissionDeniedError) as exc:
        return FAILING, f"API key rejected (HTTP {exc.status_code})"
    except Exception as exc:
        logger.warning("Groq health probe inconclusive: %s", exc)
        return UNKNOWN, f"probe failed: {type(exc).__name__}"

    missing = [m for m in REQUIRED_MODELS if m not in catalog]
    if missing:
        return FAILING, f"model not in Groq catalog: {', '.join(missing)}"
    return OK, None


def groq_status(api_key: str) -> tuple[str, str | None]:
    """Return (status, detail) for a real, non-placeholder key; detail is None when ok.

    Serves the cached verdict while it is fresh. Concurrent callers on a stale
    cache wait for the single in-flight probe, which the timeout bounds.
    """
    global _cache
    with _lock:
        if _cache is not None:
            key, status, detail, probed_at = _cache
            ttl = _UNKNOWN_TTL_SECONDS if status == UNKNOWN else _PROBE_TTL_SECONDS
            if key == api_key and time.monotonic() - probed_at < ttl:
                return status, detail
        status, detail = _probe(api_key)
        _cache = (api_key, status, detail, time.monotonic())
        return status, detail


def reset_cache() -> None:
    global _cache
    with _lock:
        _cache = None
