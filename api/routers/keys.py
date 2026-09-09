from fastapi import APIRouter, HTTPException, Request

from api.auth import API_KEY_HEADER, resolve_api_key
from api.db import get_conn
from api.limiter import limiter, tiered_limit
from api.schemas import ApiKeyUsageDay, ApiKeyUsageResponse

router = APIRouter()


@router.get(
    "/usage",
    response_model=ApiKeyUsageResponse,
    summary="Your own API key's usage over the last 30 days",
)
@limiter.limit(tiered_limit(10))
def get_key_usage(request: Request):
    """Request counts for the calling key, by endpoint and by day.

    Requires the `X-API-Key` header and reports only on that key - there is no
    way to read another key's usage. `rate_limit_multiplier` is the factor
    applied to the anonymous per-minute limits. 401 without a valid key.
    """
    record = resolve_api_key(request.headers.get(API_KEY_HEADER))
    if not record:
        raise HTTPException(status_code=401, detail=f"Missing or invalid {API_KEY_HEADER} header")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT endpoint, day, request_count
                FROM api_key_usage
                WHERE api_key_id = %s AND day >= CURRENT_DATE - INTERVAL '30 days'
                ORDER BY day DESC, endpoint
                """,
                (record.id,),
            )
            rows = cur.fetchall()

    return ApiKeyUsageResponse(
        label=record.label,
        rate_limit_multiplier=record.rate_limit_multiplier,
        items=[ApiKeyUsageDay(**r) for r in rows],
    )
