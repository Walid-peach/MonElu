"""Cache-invalidation scope shared by the ingestion entry points (GH #353).

``/api/revalidate`` used to purge every frontend route family on every call, so
a weekday run that ingested nothing cost exactly as much as a sitting day: every
deputy, vote, group, department and theme page regenerated on the next crawl.
This module is the other half of the fix - it lets a run say *what it changed*
so the frontend can invalidate only the cache tags that read it.

The vocabulary is deliberately small and mirrors ``frontend/src/lib/cacheTags.ts``
one-to-one. Families name a data family; ``votes``/``deputies`` name individual
rows when few enough of them changed to be worth naming.

Contract with the endpoint:

* a payload with a ``families`` key is a *targeted* purge - only its tags are
  invalidated, and an empty ``families`` with no ids purges nothing at all;
* **no body at all** is the conservative full purge, unchanged from before.

That asymmetry is the safety property: every way of getting the payload wrong -
an unset variable, a crashed manifest query, an old workflow revision, a manual
``curl`` - degrades to purging too much, never to purging too little.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

# Family names. Keep in sync with SCOPE_FAMILY_TAGS in frontend/src/lib/cacheTags.ts.
FAMILY_VOTES = "votes"
FAMILY_SUMMARIES = "summaries"
FAMILY_DEPUTIES = "deputies"
FAMILY_POSITIONS = "positions"
FAMILY_MARTS = "marts"
FAMILY_AGENDA = "agenda"

FAMILIES = frozenset(
    {
        FAMILY_VOTES,
        FAMILY_SUMMARIES,
        FAMILY_DEPUTIES,
        FAMILY_POSITIONS,
        FAMILY_MARTS,
        FAMILY_AGENDA,
    }
)

# Above this many changed rows in either id list, the run stops trying to name
# what changed and falls back to the **full purge**.
#
# Not "drop the ids and keep the family": a scrutin's own page is reached only
# through its `vote:<id>` tag (the family tags live on the *lists*, which is what
# makes one retried summary cheap), so dropping the ids would leave those pages
# stale. A mass correction that touches more rows than this is exactly the
# "unexpected correction" the conservative path exists for, and it costs nothing
# in practice: any run that ingested new scrutins already purges the whole site
# through the `votes` family's health tag.
MAX_ENTITY_IDS = 50


@dataclass
class CacheScope:
    """What a run changed, in the vocabulary ``/api/revalidate`` accepts."""

    families: set[str] = field(default_factory=set)
    votes: set[str] = field(default_factory=set)
    deputies: set[str] = field(default_factory=set)
    _full_purge_reason: str | None = None

    def add_votes(self, vote_ids: list[str]) -> None:
        if not vote_ids:
            return
        self.families.add(FAMILY_VOTES)
        self.votes.update(vote_ids)

    def add_summaries(self, vote_ids: list[str]) -> None:
        """Summary text changed on these scrutins.

        Deliberately not ``add_votes``: the ``votes`` family also carries the
        ``health`` tag, which the root layout's freshness badge reads, so it
        purges the entire site. A summary does not move ``MAX(voted_at)``, so it
        must not claim that family.
        """
        if not vote_ids:
            return
        self.families.add(FAMILY_SUMMARIES)
        self.votes.update(vote_ids)

    def add_deputies(self, deputy_ids: list[str]) -> None:
        if not deputy_ids:
            return
        self.families.add(FAMILY_DEPUTIES)
        self.deputies.update(deputy_ids)

    def add_position_votes(self, vote_ids: list[str]) -> None:
        """Scrutins whose *positions* changed without their own row moving.

        Their entity tags ride along so the scrutin pages get purged, but the
        ``votes`` family is not claimed: it carries the ``health`` tag, and
        ``MAX(voted_at)`` has not moved.
        """
        if not vote_ids:
            return
        self.families.add(FAMILY_POSITIONS)
        self.votes.update(vote_ids)

    def add_family(self, family: str) -> None:
        if family not in FAMILIES:
            raise ValueError(f"Unknown cache-scope family: {family!r}")
        self.families.add(family)

    def force_full_purge(self, reason: str) -> None:
        """Give up on naming the change and send no body at all.

        For the cases where the run knows it does *not* know: a summary
        generator that died mid-sweep, an agenda feed whose contents shifted
        without any row being upserted. Over-purging is the cheap direction.
        """
        self._full_purge_reason = reason

    @property
    def is_empty(self) -> bool:
        return not self.families and not self.votes and not self.deputies

    @property
    def is_over_cap(self) -> bool:
        """Too many changed rows to name them, so this run cannot be targeted."""
        return len(self.votes) > MAX_ENTITY_IDS or len(self.deputies) > MAX_ENTITY_IDS

    @property
    def needs_full_purge(self) -> bool:
        return self._full_purge_reason is not None or self.is_over_cap

    def to_payload(self) -> dict | None:
        """The JSON body to POST, or None when the caller must send no body.

        None means "full purge": the caller writes an empty value and the
        workflow's ``-n "$CACHE_SCOPE"`` check falls through to a body-less
        request, which the endpoint reads as the conservative full purge.
        """
        if self.needs_full_purge:
            return None
        payload: dict = {"families": sorted(self.families)}
        if self.votes:
            payload["votes"] = sorted(self.votes)
        if self.deputies:
            payload["deputies"] = sorted(self.deputies)
        return payload

    def to_json(self) -> str:
        """The request body, or the empty string when there must not be one."""
        payload = self.to_payload()
        return "" if payload is None else json.dumps(payload, separators=(",", ":"))

    def describe(self) -> str:
        """One line for the workflow job summary."""
        if self._full_purge_reason is not None:
            return f"full purge - {self._full_purge_reason}"
        if self.is_over_cap:
            return (
                f"{len(self.votes)} vote(s), {len(self.deputies)} deputy/deputies - "
                f"over the {MAX_ENTITY_IDS}-entity cap, falling back to a full purge"
            )
        if self.is_empty:
            return "nothing changed - no cache invalidated"
        families = ", ".join(sorted(self.families)) or "none"
        parts = [f"families: {families}"]
        if self.votes:
            parts.append(f"{len(self.votes)} vote(s)")
        if self.deputies:
            parts.append(f"{len(self.deputies)} deputy/deputies")
        return " · ".join(parts)


def changed_ids(conn, table: str, id_column: str, since) -> list[str]:
    """Ids in ``table`` whose ``changed_at`` moved at or after ``since``.

    Deliberately **not** ``ingested_at``: that column means "the last run that
    wrote this row", which dbt reads as its source-freshness field and the marts
    publish as ``updated_at`` (see ``data/migrations/011_changed_at.sql`` for
    why conflating the two turns the daily job red). Every upsert in
    ``scripts/`` sets ``changed_at`` through a ``CASE`` that fires only when the
    record really differs.

    ``changed_at`` is NULL on rows written before migration 011, which a
    ``>=`` comparison never matches - so the first run after the migration
    reports only what it genuinely changed.
    """
    allowed = {
        ("votes", "vote_id"),
        ("deputies", "deputy_id"),
        ("vote_positions", "vote_id"),
        ("agenda_items", "point_uid"),
    }
    if (table, id_column) not in allowed:
        raise ValueError(f"Unknown table/column for change detection: {table}.{id_column}")
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT DISTINCT {id_column} FROM {table} WHERE changed_at >= %s",  # noqa: S608
            (since,),
        )
        return [row[0] for row in cur.fetchall()]


def write_changed_ids(path: str | None, ids: list[str]) -> None:
    """Write one id per line, for a step that cannot return them in-process.

    ``generate_vote_summaries.py`` runs as its own process under both
    ``run_ingestion_prod.py`` and ``summarize_backfill.yml``, and a summary
    write deliberately does *not* move ``votes.ingested_at`` - ``ingested_at``
    means "the AN record changed", and the dbt staging layer reads it that way.
    So the generator hands its ids over through a file instead of being
    rediscovered with a query.
    """
    if not path:
        return
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(ids))


def read_changed_ids(path: str | None) -> list[str]:
    """Read back a ``write_changed_ids`` file. A missing file means no ids."""
    if not path or not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return [line.strip() for line in fh if line.strip()]


def publish_scope(scope: CacheScope) -> None:
    """Expose the scope to the calling workflow.

    ``cache_scope`` is the JSON body the revalidate step POSTs;
    ``cache_scope_summary`` is the human line the job summary prints, so the run
    log says which pages the purge was allowed to touch (GH #353).
    """
    github_output = os.getenv("GITHUB_OUTPUT")
    if not github_output:
        return
    with open(github_output, "a", encoding="utf-8") as fh:
        fh.write(f"cache_scope={scope.to_json()}\n")
        fh.write(f"cache_scope_summary={scope.describe()}\n")
