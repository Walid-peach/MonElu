"""
api/routers/account.py
Private account routes (#413, ADR-040).

Every handler here takes `require_account`, which verifies the Supabase access
token itself, and reads through `account_transaction()` on the restricted-role
pool, so the migration 013 RLS policies are the backstop behind each explicit
`WHERE`. Never use `get_conn()` (the owner connection, which bypasses RLS) in
this module - `resolve_profile_id()` in api/account_auth.py is the one
deliberate exception, and it lives there, not here.

There is no sign-up, sign-in, sign-out or password endpoint, and there never
will be: Supabase Auth and the Next.js server own the flow (ADR-040 §4).

No per-route rate limit: `rate_limit_key` buckets anonymous callers by IP, and
every request here arrives from the Next.js server, so an IP bucket would throttle
all signed-in users together. A per-account limit, if one is needed, keys on the
verified identity instead.
"""

from fastapi import APIRouter, Depends, HTTPException

from api.account_auth import Account, require_account
from api.db import AccountStoreUnavailable, account_transaction
from api.schemas import AccountProfile

router = APIRouter()


@router.get(
    "/me",
    response_model=AccountProfile,
    summary="The signed-in caller's own MonÉlu profile",
)
def get_my_profile(account: Account = Depends(require_account)):
    """The profile of the account holder whose Supabase access token is presented.

    Requires `Authorization: Bearer <access token>`. The API verifies the token's
    signature, expiry, audience and issuer itself; a forwarded user id or any
    other caller-asserted identity is ignored. 401 when the header is absent,
    the token does not verify, or no MonÉlu profile exists for that identity.
    503 when account authentication or the account database is unavailable.

    Returns only the caller's own row - there is no way to address another
    account. Nothing about public data requires an account: every other endpoint
    in this API stays anonymous.
    """
    try:
        with account_transaction(account.profile_id) as cur:
            cur.execute(
                """
                SELECT id::text AS id, display_name, preferred_language,
                       department_code, circonscription, created_at, updated_at
                FROM app_private.profiles
                WHERE id = %s
                """,
                (str(account.profile_id),),
            )
            row = cur.fetchone()
    except AccountStoreUnavailable:
        raise HTTPException(
            status_code=503, detail="Account storage is temporarily unavailable"
        ) from None

    if row is None:
        # Deleted between the owner-side lookup and this read.
        raise HTTPException(
            status_code=401,
            detail="No MonÉlu account for this identity",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AccountProfile(**row)
