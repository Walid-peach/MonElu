-- MonÉlu — user feedback loop (MON-70)
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.

-- Generic feedback sink: `type` distinguishes sources (e.g. 'chat'), `payload`
-- carries the type-specific context as JSONB so new feedback sources (e.g. the
-- data-page report channel in MON-101) don't need a schema migration.
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_type_created ON feedback (type, created_at);
