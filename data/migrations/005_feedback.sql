-- MonÉlu — user feedback loop (MON-70)
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.

-- Generic feedback sink: `type` distinguishes sources ('chat' for MON-70 chat
-- thumbs, 'report' for MON-101 data-page error reports), `payload` carries the
-- type-specific context as JSONB so new feedback sources don't need a schema
-- migration.
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_type_created ON feedback (type, created_at);
