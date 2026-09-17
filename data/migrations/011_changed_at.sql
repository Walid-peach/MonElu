-- MonÉlu — a per-row "this record actually changed" timestamp (GH #353)
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op when already present.
--
-- The cache-invalidation scope ingestion sends to /api/revalidate needs to know
-- *which* records a run changed, not which ones it saw. The obvious column for
-- that is `ingested_at` — and it is the wrong one, because it already carries
-- the opposite meaning and two things depend on it:
--
--   1. transform/models/staging/sources.yml sets `loaded_at_field: ingested_at`
--      on all three raw sources. The `deputies` source is documented there as
--      the "cron silently died" detector, with error_after: 7 days, precisely
--      because every successful run re-upserts all 577 rows whether or not the
--      AN changed anything. `dbt source freshness` runs in ingest_prod.yml and
--      the MON-250 data-quality gate re-fails the job on it, so making
--      `ingested_at` conditional turns the daily job red about a week into any
--      quiet stretch — while simultaneously destroying the alert for a cron
--      that really has died.
--   2. mart_deputy_scorecard / mart_party_alignment / mart_vote_summary each
--      publish `max(ingested_at)` as their `updated_at`, which is a "data as
--      of" stamp for the API and would stall the same way.
--
-- So `ingested_at` keeps meaning "the last run that wrote this row" and this
-- column means "the last run that wrote something *different*". The upserts set
-- it through a CASE rather than skipping the row, because a skipped row cannot
-- stamp `ingested_at` either — the run signal and the change signal need two
-- columns and one write.
--
-- NULL default on purpose: a pre-existing row has no known change time, and
-- `changed_ids()` only ever asks `changed_at >= <this run's start>`, which a
-- NULL never satisfies. The first run after this migration therefore reports
-- only what it genuinely changed, not the whole table.
--
-- No RLS statements here (MON-248): these four tables already have it from
-- 001_init.sql and 010_rls_backfill.sql, and adding a column does not change
-- that.

ALTER TABLE deputies       ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
ALTER TABLE votes          ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
ALTER TABLE vote_positions ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
ALTER TABLE agenda_items   ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;

-- The scope query is `... WHERE changed_at >= <run start>` once per table per
-- day. Partial indexes keep it off a sequential scan of ~715 000 position rows
-- while staying tiny: only rows changed since the index was built qualify, and
-- the predicate is dropped from the index entry itself.
CREATE INDEX IF NOT EXISTS idx_deputies_changed_at       ON deputies (changed_at)       WHERE changed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_votes_changed_at          ON votes (changed_at)          WHERE changed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vote_positions_changed_at ON vote_positions (changed_at) WHERE changed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_items_changed_at   ON agenda_items (changed_at)   WHERE changed_at IS NOT NULL;
