"""
api/routers/app_config.py
Configuration for native clients (ADR-041 §5, #438).

One public, anonymous, cacheable endpoint. It carries nothing about the
caller, so it is safe behind a CDN; the values live in api/app_config_data.py.
"""

from fastapi import APIRouter
from starlette.requests import Request

from api.app_config_data import app_config
from api.limiter import limiter, tiered_limit
from api.schemas import AppConfig

router = APIRouter()


@router.get(
    "/config",
    response_model=AppConfig,
    summary="Launch configuration for the MonÉlu mobile app",
)
@limiter.limit(tiered_limit(30))
def get_app_config(request: Request):
    """What a MonÉlu mobile app reads at launch instead of hardcoding it.

    `min_ios_version` is the oldest app version (`MAJOR.MINOR.PATCH`) this API
    still serves correctly: an older app must ask its user to update rather than
    call the API. `features` are remote switches, `true` unless the operator has
    turned one off: `chat` says whether the app should offer `POST /search/`, and
    `verify` whether it should offer `POST /verify/`, both of which depend on a
    third-party model provider. They are advice to the app, not enforcement -
    both endpoints keep answering whatever the switches say.
    `data_horizon` is the first date production holds scrutins for (ISO date).
    `caveats` are the reading notes the website prints next to its figures,
    in French, with inline Markdown, each under a stable `id`.

    Nothing here depends on the caller, and no account is needed.
    """
    return app_config()
