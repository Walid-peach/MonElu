import os
from datetime import datetime, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

DATABASE_URL = os.getenv("DATABASE_URL")


def get_new_votes(since: Optional[datetime] = None) -> list[dict]:
    """
    Get votes ingested after `since`.
    Default: last 10 minutes (covers 5-min polling with overlap).
    """
    if since is None:
        since = datetime.utcnow() - timedelta(minutes=10)

    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT vote_id, vote_title, result, voted_at,
                       votes_for, votes_against, abstentions
                FROM votes
                WHERE ingested_at >= %s
                ORDER BY voted_at DESC
                """,
                (since,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_deputies_who_voted(vote_id: str) -> list[dict]:
    """
    Get all deputy positions for a given vote.
    Returns: [{deputy_id, full_name, party, department, position}]
    """
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    vp.deputy_id,
                    d.full_name,
                    d.party,
                    d.department,
                    vp.position
                FROM vote_positions vp
                JOIN deputies d ON vp.deputy_id = d.deputy_id
                WHERE vp.vote_id = %s
                """,
                (vote_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_matching_subscriptions(deputy_ids: list[str]) -> list[dict]:
    """
    Find active confirmed subscribers who follow any of these deputies.
    """
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT subscription_id, email, deputy_ids
                FROM subscriptions
                WHERE is_active = TRUE
                  AND confirmed = TRUE
                  AND deputy_ids && %s::text[]
                """,
                (deputy_ids,),
            )
            return [dict(r) for r in cur.fetchall()]


def already_alerted(subscription_id: str, vote_id: str) -> bool:
    """Prevent duplicate alerts for the same vote + subscription."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM alert_log
                WHERE subscription_id = %s AND vote_id = %s
                LIMIT 1
                """,
                (subscription_id, vote_id),
            )
            return cur.fetchone() is not None


def log_alert(
    subscription_id: str,
    vote_id: str,
    deputy_id: str,
    status: str = "sent",
):
    """Record that an alert was sent and update last_alerted_at."""
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO alert_log
                    (subscription_id, vote_id, deputy_id, email_status)
                VALUES (%s, %s, %s, %s)
                """,
                (subscription_id, vote_id, deputy_id, status),
            )
            cur.execute(
                """
                UPDATE subscriptions
                SET last_alerted_at = NOW()
                WHERE subscription_id = %s
                """,
                (subscription_id,),
            )
        conn.commit()
