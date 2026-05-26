"""
Alert runner — detects new votes and dispatches emails.
Called by Airflow DAG and GitHub Actions.
Can also be run manually: python scripts/run_alerts.py
"""

import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.utils.alert_engine import (
    already_alerted,
    get_deputies_who_voted,
    get_matching_subscriptions,
    get_new_votes,
    log_alert,
)
from ingestion.utils.email_dispatcher import send_alert


def run_alerts(since_minutes: int = 10) -> dict:
    since = datetime.utcnow() - timedelta(minutes=since_minutes)
    print(f"Checking for new votes since {since.isoformat()}")

    new_votes = get_new_votes(since=since)
    print(f"Found {len(new_votes)} new votes")

    stats = {
        "votes_processed": 0,
        "alerts_sent": 0,
        "alerts_skipped": 0,
        "errors": 0,
    }

    for vote in new_votes:
        stats["votes_processed"] += 1
        print(f"\nProcessing: {vote['vote_title'][:60]}...")

        deputies = get_deputies_who_voted(vote["vote_id"])
        deputy_ids = [d["deputy_id"] for d in deputies]

        subscriptions = get_matching_subscriptions(deputy_ids)
        if not subscriptions:
            print("  No subscribers for this vote")
            continue

        print(f"  {len(subscriptions)} subscribers to notify")

        for sub in subscriptions:
            if already_alerted(sub["subscription_id"], vote["vote_id"]):
                stats["alerts_skipped"] += 1
                continue

            tracked = [d for d in deputies if d["deputy_id"] in sub["deputy_ids"]]

            for deputy in tracked:
                voted_at = vote["voted_at"]
                voted_at_str = (
                    voted_at.strftime("%d/%m/%Y à %H:%M")
                    if hasattr(voted_at, "strftime")
                    else str(voted_at)
                )

                success = send_alert(
                    to_email=sub["email"],
                    vote_title=vote["vote_title"],
                    vote_result=vote["result"],
                    voted_at=voted_at_str,
                    votes_for=vote["votes_for"],
                    votes_against=vote["votes_against"],
                    abstentions=vote["abstentions"],
                    deputy_name=deputy["full_name"],
                    deputy_position=deputy["position"],
                    deputy_party=deputy["party"] or "Groupe non renseigné",
                )

                if success:
                    log_alert(sub["subscription_id"], vote["vote_id"], deputy["deputy_id"])
                    stats["alerts_sent"] += 1
                else:
                    stats["errors"] += 1

    print(f"\n{'=' * 40}")
    print("Alert run complete:")
    print(f"  Votes processed: {stats['votes_processed']}")
    print(f"  Alerts sent:     {stats['alerts_sent']}")
    print(f"  Skipped (dupe):  {stats['alerts_skipped']}")
    print(f"  Errors:          {stats['errors']}")
    return stats


if __name__ == "__main__":
    since_minutes = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    run_alerts(since_minutes=since_minutes)
