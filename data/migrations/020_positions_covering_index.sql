-- MonÉlu - a deputy's positions readable from the index alone
-- Idempotent: safe to re-run.
--
-- GET /deputies/{id}/votes needs one deputy's (vote_id, position) pairs. With
-- `idx_positions_deputy (deputy_id, vote_id)` each pair cost a visit to the
-- table, and a deputy's rows are spread over as many pages as they have
-- positions: 2 008 pages for a 2 029-position record, measured locally. On
-- production a page read from disk costs about 11 ms, so a deputy nobody had
-- opened recently took over a second.
--
-- Carrying `position` in the index lets Postgres answer from the index alone:
-- 16 pages for the same record. The new index serves everything the old one
-- did (same key columns, same order), so the old one goes; it is about 9 bytes
-- per row larger.
--
-- CREATE INDEX blocks writes to the table while it builds (a few seconds for a
-- million rows) and never reads. The only writer is the daily ingestion.
CREATE INDEX IF NOT EXISTS idx_positions_deputy_covering
    ON vote_positions (deputy_id, vote_id) INCLUDE (position);

DROP INDEX IF EXISTS idx_positions_deputy;

-- An index-only scan still visits the table for any row on a page not marked
-- all-visible, and only a vacuum sets that mark. The daily ingestion rewrites
-- every position of the last 30 days, so with the default threshold (20% of
-- the table changed) those rows stayed unmarked for days: 114 of 1 337 rows
-- on production. Vacuum once 2% has changed instead, which is after each run.
ALTER TABLE vote_positions SET (autovacuum_vacuum_scale_factor = 0.02);
