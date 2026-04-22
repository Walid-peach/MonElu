-- MonÉlu — initial schema
-- Fully idempotent: all statements use CREATE TABLE/INDEX IF NOT EXISTS

CREATE TABLE IF NOT EXISTS deputies (
    deputy_id       TEXT PRIMARY KEY,           -- AN uid, e.g. "PA1592"
    full_name       TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    party           TEXT,                       -- full group name
    party_short     TEXT,                       -- organeRef, e.g. "PO845401"
    circonscription TEXT,
    department      TEXT,
    mandate_start   DATE,
    mandate_end     DATE,                       -- NULL if currently active
    photo_url       TEXT,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
    vote_id         TEXT PRIMARY KEY,           -- AN scrutin uid, e.g. "VTANR5L17V1234"
    voted_at        TIMESTAMPTZ NOT NULL,
    vote_title      TEXT NOT NULL,
    vote_type       TEXT,                       -- e.g. "SPO" (scrutin public ordinaire)
    result          TEXT,                       -- "adopté" | "rejeté"
    votes_for       INTEGER,
    votes_against   INTEGER,
    abstentions     INTEGER,
    total_voters    INTEGER,
    dossier_id      TEXT,                       -- linked legislative dossier, if any
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_positions (
    position_id     BIGSERIAL PRIMARY KEY,
    vote_id         TEXT NOT NULL REFERENCES votes(vote_id) ON DELETE CASCADE,
    deputy_id       TEXT NOT NULL REFERENCES deputies(deputy_id) ON DELETE CASCADE,
    position        VARCHAR(15) NOT NULL,       -- "pour" | "contre" | "abstention" | "nonVotant"
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (vote_id, deputy_id)                 -- one position per deputy per vote
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_positions_deputy   ON vote_positions(deputy_id, vote_id);
CREATE INDEX IF NOT EXISTS idx_positions_vote     ON vote_positions(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_positions_pos ON vote_positions(position);
CREATE INDEX IF NOT EXISTS idx_votes_voted_at     ON votes(voted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deputies_party     ON deputies(party_short);

-- ---------------------------------------------------------------------------
-- Phase 2: semantic search via pgvector
-- Requires the vector extension (pre-installed on Supabase)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_chunks (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON document_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Affects direct Supabase REST API access only — psycopg2 (superuser role)
-- bypasses RLS entirely, so the FastAPI app is unaffected.
-- ---------------------------------------------------------------------------

ALTER TABLE deputies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Public read on civic data (AN open data — already public by design)
DROP POLICY IF EXISTS "public_read_deputies"       ON deputies;
DROP POLICY IF EXISTS "public_read_votes"          ON votes;
DROP POLICY IF EXISTS "public_read_vote_positions" ON vote_positions;

CREATE POLICY "public_read_deputies"
    ON deputies FOR SELECT USING (true);

CREATE POLICY "public_read_votes"
    ON votes FOR SELECT USING (true);

CREATE POLICY "public_read_vote_positions"
    ON vote_positions FOR SELECT USING (true);

-- document_chunks: no public policy — anon gets nothing (embeddings are internal)
