"""
api/limiter.py
Shared SlowAPI limiter instance — imported by main.py and individual routers.
Keeping it in its own module avoids circular imports.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from api.auth import API_KEY_HEADER, resolve_api_key


def rate_limit_key(request: Request) -> str:
    """Bucket keyed requests by API key id, anonymous requests by IP.

    The key's rate_limit_multiplier is embedded in the returned string so
    `tiered_limit` below can read it back without a second cache lookup.
    """
    record = resolve_api_key(request.headers.get(API_KEY_HEADER))
    if record:
        return f"apikey:{record.id}:{record.rate_limit_multiplier}"
    return get_remote_address(request)


def tiered_limit(base_per_minute: int):
    """Build a dynamic slowapi limit.

    Anonymous requests keep `base`; keyed requests get base * multiplier.
    """

    def _limit(key: str) -> str:
        if key.startswith("apikey:"):
            multiplier = int(key.rsplit(":", 1)[-1])
            return f"{base_per_minute * multiplier}/minute"
        return f"{base_per_minute}/minute"

    return _limit


limiter = Limiter(key_func=rate_limit_key, default_limits=[])
