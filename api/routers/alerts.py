import os
from typing import Annotated

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr, Field

router = APIRouter()
DATABASE_URL = os.getenv("DATABASE_URL")


class SubscribeRequest(BaseModel):
    email: EmailStr
    deputy_ids: Annotated[
        list[str],
        Field(
            min_length=1,
            max_length=20,
            description="List of deputy IDs to track (e.g. ['PA722190'])",
        ),
    ]


class SubscribeResponse(BaseModel):
    message: str
    subscription_id: str
    deputies_tracked: int


@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(request: SubscribeRequest, background_tasks: BackgroundTasks):
    """Subscribe to vote alerts for specific deputies."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT deputy_id FROM deputies WHERE deputy_id = ANY(%s)",
                (request.deputy_ids,),
            )
            found = [r["deputy_id"] for r in cur.fetchall()]
            invalid = set(request.deputy_ids) - set(found)
            if invalid:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown deputy IDs: {sorted(invalid)}",
                )

            cur.execute(
                """
                INSERT INTO subscriptions (email, deputy_ids)
                VALUES (%s, %s)
                ON CONFLICT (email) DO UPDATE
                SET deputy_ids = EXCLUDED.deputy_ids,
                    is_active = TRUE,
                    confirmation_token = gen_random_uuid()
                RETURNING subscription_id, confirmation_token
                """,
                (request.email, request.deputy_ids),
            )
            row = cur.fetchone()
        conn.commit()

    background_tasks.add_task(
        _send_confirmation_background,
        request.email,
        str(row["confirmation_token"]),
    )

    return SubscribeResponse(
        message="Confirmation email sent. Check your inbox.",
        subscription_id=str(row["subscription_id"]),
        deputies_tracked=len(request.deputy_ids),
    )


@router.get("/confirm")
async def confirm(token: str):
    """Confirm email subscription via token link."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE subscriptions
                SET confirmed = TRUE
                WHERE confirmation_token = %s
                RETURNING email
                """,
                (token,),
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Token not found")

    return {"message": f"Subscription confirmed for {row[0]}. You will now receive vote alerts."}


@router.delete("/unsubscribe")
async def unsubscribe(email: str):
    """Unsubscribe from all alerts."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE subscriptions SET is_active = FALSE WHERE email = %s",
                (email,),
            )
        conn.commit()
    return {"message": f"Unsubscribed {email} from all alerts."}


@router.get("/stats")
async def alert_stats():
    """Alert system statistics."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE is_active AND confirmed)     AS active_subscribers,
                    COUNT(*) FILTER (WHERE is_active AND NOT confirmed) AS pending_confirmation,
                    COUNT(*) FILTER (WHERE NOT is_active)               AS unsubscribed
                FROM subscriptions
                """
            )
            subs = dict(cur.fetchone())
            cur.execute("SELECT COUNT(*) AS total_alerts FROM alert_log")
            alerts = dict(cur.fetchone())
    return {**subs, **alerts}


def _send_confirmation_background(email: str, token: str):
    from ingestion.utils.email_dispatcher import send_confirmation_email

    send_confirmation_email(email, token)
