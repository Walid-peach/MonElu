-- MonÉlu — initial schema
-- Run automatically by Postgres on first container start

CREATE TABLE IF NOT EXISTS deputies (
    deputy_id       TEXT PRIMARY KEY,           -- AN uid, e.g. "PA1592"
    full_name       TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    party           TEXT,                       -- full group name
    party_short     TEXT,                       -- e.g. "RN", "LFI", "EPR"
    circonscription TEXT,
    department      TEXT,
    mandate_start   DATE,
    mandate_end     DATE,                       -- NULL if currently active
    photo_url       TEXT,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
    vote_id         TEXT PRIMARY KEY,           -- AN scrutin uid, e.g. "VTANR5L16V1234"
    voted_at        TIMESTAMPTZ NOT NULL,
    vote_title      TEXT NOT NULL,
    vote_type       TEXT,                       -- e.g. "SFS" (solennel), "ordinaire"
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
    position        TEXT NOT NULL,              -- "pour" | "contre" | "abstention" | "nonVotant" | "absent"
    voted_at        TIMESTAMPTZ NOT NULL,       -- denormalised from votes for query convenience
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (vote_id, deputy_id)                 -- one position per deputy per vote
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_vote_positions_deputy  ON vote_positions(deputy_id);
CREATE INDEX IF NOT EXISTS idx_vote_positions_vote    ON vote_positions(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_positions_pos     ON vote_positions(position);
CREATE INDEX IF NOT EXISTS idx_votes_voted_at         ON votes(voted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deputies_party         ON deputies(party_short);
