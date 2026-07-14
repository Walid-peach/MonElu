-- MonÉlu — stored fact-check verdicts (MON-126, ADR-022)
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS — safe to re-run.

-- A verification is an immutable snapshot: the claim as verified, the verdict,
-- and denormalized deputy/citation data frozen at verification time. Rows are
-- never updated; a "re-vérifier" action creates a new row (ADR-022).
-- No user identity is stored; UUIDs keep stored claims non-enumerable.
CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('vrai', 'faux', 'trompeur', 'inverifiable')),
    explanation TEXT NOT NULL,
    -- {"deputy_id", "name", "party"} snapshot, or NULL when no deputy was identified.
    deputy JSONB,
    -- [{"vote_id", "title", "voted_at", "result", "deputy_position"}] — validated
    -- against the votes table in code before insert (ADR-022: no fabricated ids).
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence TEXT NOT NULL,
    data_horizon DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
