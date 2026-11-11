-- MonÉlu - one definition of a sitting deputy (#682)
-- Idempotent: safe to re-run.
--
-- `mandate_end IS NULL` used to mean "sitting" everywhere, but a deputy who
-- drops out of the AN's active-deputies export (AMO10) with no end date in the
-- all-mandates export (AMO20) keeps a NULL `mandate_end` and went on counting
-- as sitting. `last_listed_at` records what ingestion actually observed: the
-- run that last listed the deputy in AMO10. It is a third signal beside
-- `ingested_at` and `changed_at` and replaces neither (ADR-039).
--
-- Every deputy is in exactly one state:
--   departed     `mandate_end` is set (the legal date, written from AMO20 only)
--   sitting      listed by the latest ingestion run
--   unconfirmed  not listed by the latest run, yet no `mandate_end`
-- The latest run is MAX(last_listed_at): ingest_deputies.py stamps every
-- listed deputy in one transaction, so they all carry the same NOW().
ALTER TABLE deputies ADD COLUMN IF NOT EXISTS last_listed_at TIMESTAMPTZ;

-- Keep today's sitting set as it is until the next ingestion run stamps the
-- real one. One NOW() for every row, so no deputy reads as unconfirmed before
-- that run. Backfilling from `ingested_at` instead would be wrong: any other
-- write to a row moves it, and the newest one would unseat everyone else.
UPDATE deputies
SET last_listed_at = NOW()
WHERE last_listed_at IS NULL AND mandate_end IS NULL;

-- security_invoker: the views read `deputies` with the caller's rights, so its
-- RLS policy applies through them as it does to the table (MON-248).
CREATE OR REPLACE VIEW deputy_seat_status WITH (security_invoker = true) AS
SELECT
    d.deputy_id,
    CASE
        WHEN d.mandate_end IS NOT NULL THEN 'departed'
        WHEN d.last_listed_at = latest.listed_at THEN 'sitting'
        ELSE 'unconfirmed'
    END AS seat_status
FROM deputies d
CROSS JOIN (SELECT MAX(last_listed_at) AS listed_at FROM deputies) latest;

-- What every "current Assemblée" reader filters on: seat counts, group and
-- department rosters, the quiz, the circonscription lookup and the RAG chunks.
CREATE OR REPLACE VIEW sitting_deputies WITH (security_invoker = true) AS
SELECT deputy_id FROM deputy_seat_status WHERE seat_status = 'sitting';
