-- MonÉlu — initial schema
-- Fully idempotent: all statements use CREATE TABLE/INDEX IF NOT EXISTS

CREATE TABLE IF NOT EXISTS deputies (
    deputy_id       TEXT PRIMARY KEY,           -- AN uid, e.g. "PA1592"
    full_name       TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    party           TEXT,                       -- full group name
    party_short     TEXT,                       -- short group code, e.g. "EPR" (see update_party.py)
    circonscription TEXT,
    department      TEXT,
    mandate_start   DATE,
    mandate_end     DATE,                       -- NULL if currently active
    photo_url       TEXT,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
    vote_id         TEXT PRIMARY KEY,           -- AN scrutin uid, e.g. "VTANR5L17V1234"
    voted_at        TIMESTAMPTZ,                -- nullable: AN can omit dateScrutin (003)
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

-- Natural primary key (vote_id, deputy_id): one position per deputy per
-- vote, and the ON CONFLICT target of the ingestion upsert. A BIGSERIAL
-- surrogate this file used to create was dropped in migration 006 (MON-77) —
-- it was never referenced and wasted ~8 bytes/row plus a redundant index.
CREATE TABLE IF NOT EXISTS vote_positions (
    vote_id         TEXT NOT NULL REFERENCES votes(vote_id) ON DELETE CASCADE,
    deputy_id       TEXT NOT NULL REFERENCES deputies(deputy_id) ON DELETE CASCADE,
    position        VARCHAR(15) NOT NULL,       -- "pour" | "contre" | "abstention" | "nonVotant"
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (vote_id, deputy_id)
);

-- Indexes for common query patterns.
-- Deliberately minimal: UNIQUE(vote_id, deputy_id) already serves vote_id
-- lookups, and name/title searches are ILIKE '%…%' (btree-unusable) — see
-- migration 003, which dropped the dead indexes this file used to create.
CREATE INDEX IF NOT EXISTS idx_positions_deputy   ON vote_positions(deputy_id, vote_id);
CREATE INDEX IF NOT EXISTS idx_votes_voted_at     ON votes(voted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deputies_party     ON deputies(party_short);

-- ---------------------------------------------------------------------------
-- Phase 2: semantic search via pgvector
-- Requires the vector extension (pre-installed on Supabase).
-- This will fail loudly on environments where pgvector is not available —
-- that is intentional: the embedding index cannot be created without it.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- No ANN index: at this corpus size (~3.7k chunks) an exact cosine scan is
-- milliseconds with perfect recall. An IVFFlat index built at migration time
-- (empty table) clusters degenerately — see migration 003 and the database
-- diagnostic 2026-06-11 before reintroducing one.

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Affects direct Supabase REST API access only. The FastAPI app connects as
-- the table OWNER, which bypasses RLS by default (on Supabase the postgres
-- role is not a superuser — owner bypass is what actually applies here).
-- If a dedicated non-owner app role is ever created, it will need policies.
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
