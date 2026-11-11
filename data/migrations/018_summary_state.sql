-- MonÉlu - the vote summary lifecycle as a column (#681)
-- Idempotent: the columns and their backfill run once, guarded by the column's
-- absence; the constraints are dropped and re-added. Safe to re-run.
--
-- Before this migration the state of a summary was the combination of
-- summary_plain, summary_basis, scrutin_kind and the three source tables, and
-- "no source yet", "never a source", "queued" and "the model call failed" were
-- all stored as summary_plain IS NULL AND summary_basis IS NULL.
--
--   no_source  no official text is attached, so no summary is generated
--   queued     a source exists (or the vote is a motion) and the generator owes it a summary
--   published  summary_plain holds a summary; summary_basis says what it was built from
--   rejected   the guards refused the output; summary_rejection_reason says why
--
-- Transitions, each with one writer:
--   no_source -> queued     ingest_amendments.py, ingest_articles.py, ingest_bills.py
--                           when they attach a text row; ingest_votes.py for motions
--   queued -> published     generate_vote_summaries.py
--   queued -> rejected      generate_vote_summaries.py
--   queued -> queued        generate_vote_summaries.py, summary_attempts + 1 on a failed call
--   rejected -> queued      generate_vote_summaries.py --retry-rejected, and nothing else
--
-- summary_basis keeps its meaning, the kind of a published summary, so the API
-- and the RAG chunker read it unchanged. Its old 'rejected' value moves here.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'votes' AND column_name = 'summary_state'
    ) THEN
        ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_basis_check;

        ALTER TABLE votes
            ADD COLUMN summary_state TEXT NOT NULL DEFAULT 'no_source',
            ADD COLUMN summary_rejection_reason TEXT,
            ADD COLUMN summary_attempts INTEGER NOT NULL DEFAULT 0;

        -- Each vote's state from the columns that encoded it until now. The
        -- source tables decide queued, with the same kind each one serves in
        -- the generator's old pending query.
        UPDATE votes v SET
            summary_state = CASE
                WHEN v.summary_basis IN ('official_text', 'procedure') THEN 'published'
                WHEN v.summary_basis = 'rejected' THEN 'rejected'
                WHEN v.scrutin_kind = 'motion' THEN 'queued'
                WHEN v.scrutin_kind = 'amendement'
                     AND EXISTS (SELECT 1 FROM vote_amendments a WHERE a.vote_id = v.vote_id)
                    THEN 'queued'
                WHEN v.scrutin_kind = 'article'
                     AND EXISTS (SELECT 1 FROM vote_articles a WHERE a.vote_id = v.vote_id)
                    THEN 'queued'
                WHEN v.scrutin_kind IN ('ensemble', 'autre')
                     AND EXISTS (SELECT 1 FROM vote_bills b WHERE b.vote_id = v.vote_id)
                    THEN 'queued'
                ELSE 'no_source'
            END,
            -- The reason of an older rejection was only ever in a run log.
            summary_rejection_reason = CASE
                WHEN v.summary_basis = 'rejected' THEN 'unrecorded'
            END;

        UPDATE votes SET summary_basis = NULL WHERE summary_basis = 'rejected';
    END IF;
END $$;

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_basis_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_basis_check
    CHECK (summary_basis IN ('official_text', 'procedure'));

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_state_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_state_check
    CHECK (summary_state IN ('no_source', 'queued', 'published', 'rejected'));

-- A published summary always says what it was built from, and nothing else has a basis.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_basis_published_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_basis_published_check
    CHECK ((summary_state = 'published') = (summary_basis IS NOT NULL));

-- A rejection always carries its reason, and nothing else has one.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_rejection_reason_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_rejection_reason_check
    CHECK ((summary_state = 'rejected') = (summary_rejection_reason IS NOT NULL));

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_attempts_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_attempts_check
    CHECK (summary_attempts >= 0);
