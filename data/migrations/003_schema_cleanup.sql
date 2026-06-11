-- MonÉlu — schema cleanup (database diagnostic 2026-06-11)
-- Idempotent: DROP IF EXISTS / guarded DO blocks — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Drop dead indexes (MON-10)
--    idx_positions_vote      — redundant: UNIQUE(vote_id, deputy_id) covers vote_id
--    idx_vote_positions_pos  — 4 distinct values; planner never chooses it
--    idx_votes_vote_title    — title lookups are ILIKE '%…%'; btree-unusable
--    idx_deputies_full_name  — name lookups are ILIKE '%…%'; 577 rows seq-scan fine
--    idx_chunks_created_at   — nothing queries chunks by created_at
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_positions_vote;
DROP INDEX IF EXISTS idx_vote_positions_pos;
DROP INDEX IF EXISTS idx_votes_vote_title;
DROP INDEX IF EXISTS idx_deputies_full_name;
DROP INDEX IF EXISTS idx_chunks_created_at;

-- ---------------------------------------------------------------------------
-- 2. Drop the IVFFlat ANN index (MON-11)
--    Built on an empty table at migration time → degenerate clustering and
--    recall gaps. At ~3.7k chunks an exact cosine scan is milliseconds and
--    has perfect recall; reintroduce ANN only if the corpus grows ~100×.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_chunks_embedding;

-- ---------------------------------------------------------------------------
-- 3. votes.voted_at: drop NOT NULL (MON-13)
--    The AN parser can yield a scrutin without dateScrutin; NOT NULL would
--    abort the whole execute_batch transaction on one bad record.
-- ---------------------------------------------------------------------------

ALTER TABLE votes ALTER COLUMN voted_at DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. document_chunks.created_at: TIMESTAMP → TIMESTAMPTZ (MON-13)
--    Every other table uses TIMESTAMPTZ; align the one outlier.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE document_chunks
            ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. CHECK constraint on vote_positions.position (MON-13)
--    Catches upstream AN format drift at write time instead of letting
--    unknown position strings through silently.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_position_domain'
    ) THEN
        ALTER TABLE vote_positions
            ADD CONSTRAINT chk_position_domain
            CHECK (position IN ('pour', 'contre', 'abstention', 'nonVotant'));
    END IF;
END $$;
