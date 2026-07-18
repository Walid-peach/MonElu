-- MonÉlu — stored quiz result snapshots (MON-139, ADR-025)
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.

-- A quiz share is an immutable snapshot of a server-computed match result
-- ("Je vote à 78% comme …"). POST /quiz/share recomputes the result from the
-- submitted answers before storing it — client-computed percentages are never
-- trusted (ADR-025), which is what keeps MonÉlu-branded share cards
-- non-forgeable. Rows are never updated; no user identity, no postal code,
-- and no raw answers beyond what the rendered card shows. UUIDs keep stored
-- shares non-enumerable (mirrors chat_shares / verifications).
CREATE TABLE IF NOT EXISTS quiz_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Question-set version that produced the result (e.g. "2026-Q3") — keeps
    -- old cards attributable to the questionnaire of their day.
    version TEXT NOT NULL,
    -- The full QuizMatchResponse as rendered: top matches, opposite deputy,
    -- group alignment, optional department comparison.
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
