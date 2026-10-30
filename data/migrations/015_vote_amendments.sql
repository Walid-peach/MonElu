-- MonÉlu - official amendment text behind vote summaries (#630, ADR-043)
-- Idempotent: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS - safe to re-run.
--
-- One row per amendment or sub-amendment scrutin matched to its AN amendment.
-- Only voted amendments are kept, not the whole export, so the table stays a
-- few megabytes on the Supabase free tier. A vote with no row has no source
-- text and gets no generated summary.
CREATE TABLE IF NOT EXISTS vote_amendments (
    vote_id TEXT PRIMARY KEY REFERENCES votes(vote_id) ON DELETE CASCADE,
    amendment_uid TEXT NOT NULL,
    is_sub_amendment BOOLEAN NOT NULL DEFAULT FALSE,
    dispositif TEXT NOT NULL,
    expose_sommaire TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vote_amendments ENABLE ROW LEVEL SECURITY;

-- What a stored amendment summary was built from. NULL on every summary
-- written before this migration, 'official_text' on one built from
-- vote_amendments, 'rejected' when the guards refused the output and the
-- summary stays empty on purpose.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS summary_basis TEXT
    CHECK (summary_basis IN ('official_text', 'rejected'));
