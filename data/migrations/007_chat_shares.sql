-- MonÉlu — stored chat/RAG answer snapshots (MON-66, ADR-024)
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS — safe to re-run.

-- A chat share is an immutable snapshot of an answer the user already saw in
-- the chat UI: the question, the answer, and the sources rendered with it,
-- frozen at share time. Rows are never updated; sharing the same answer twice
-- creates a new row (mirrors ADR-022's verifications table). No user identity
-- is stored; UUIDs keep stored shares non-enumerable.
CREATE TABLE IF NOT EXISTS chat_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    -- [{"content", "metadata", "similarity"}] as rendered in the chat UI.
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence TEXT,
    data_source TEXT,
    caveat TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
