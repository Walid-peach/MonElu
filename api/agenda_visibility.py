"""
api/agenda_visibility.py

The one definition of which agenda items are visible (ADR-030 §2, #684).

An item is visible when both conditions hold:
- it was seen in the most recent ingestion run: its `last_seen_at` equals the
  table's maximum;
- neither its réunion nor its own state is cancelled.

Imported by every reader that has to agree with `GET /agenda`:
`api/routers/agenda.py` (and through its query `api/routers/feed.py`),
`scripts/generate_agenda_summaries.py` (summarizing a hidden item is spend with
nothing to show) and `visible_agenda_count()` in `scripts/run_ingestion_prod.py`
(the cache scope's withdrawn-item check).

**The rule depends on `ingest_agenda.py` writing every item in one
transaction.** `last_seen_at` is stamped with `NOW()`, which is the
transaction's start time, so one transaction gives every item of a run the same
stamp. If the upsert ever committed in batches, each batch would carry its own
stamp and every batch but the last would vanish from the feed.
`tests/integration/test_agenda.py` shows that, and `tests/unit/test_ingest_transactions.py`
fails if the upsert stops being a single transaction. A run ledger keyed by a
run id would remove the dependency; that is the open half of #684.
"""

CANCELLED_STATES = ("Annulé", "Supprimé")

# Written into the SQL as literals rather than bound as parameters, so a caller
# cannot get the parameter order wrong. They are constants of this module, never
# input; the check keeps a quote, or a `%` psycopg2 would read as a
# placeholder, from ever reaching the SQL.
if any("'" in state or "%" in state for state in CANCELLED_STATES):
    raise ValueError("CANCELLED_STATES must not contain ' or %")
_CANCELLED_SQL = ", ".join(f"'{state}'" for state in CANCELLED_STATES)


def visible_agenda_predicate(alias: str = "agenda_items") -> str:
    """The SQL condition an `agenda_items` row must meet to be shown.

    `alias` is how the calling query names the table. The condition binds no
    parameters, so it can go into any query's WHERE clause as it is.
    """
    if not alias.isidentifier():
        raise ValueError(f"not an SQL table alias: {alias!r}")
    return (
        f"{alias}.last_seen_at = (SELECT MAX(last_seen_at) FROM agenda_items)"
        f" AND {alias}.reunion_etat NOT IN ({_CANCELLED_SQL})"
        f" AND ({alias}.point_etat IS NULL OR {alias}.point_etat NOT IN ({_CANCELLED_SQL}))"
    )
