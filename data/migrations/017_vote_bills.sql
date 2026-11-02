-- MonÉlu - official bill text behind whole-text vote summaries (#645, ADR-046)
-- Idempotent: safe to re-run.
--
-- One row per whole-text scrutin matched to the text the Assemblée examined,
-- holding its articles. A vote with no row has no source text and gets no
-- generated summary.
CREATE TABLE IF NOT EXISTS vote_bills (
    vote_id TEXT PRIMARY KEY REFERENCES votes(vote_id) ON DELETE CASCADE,
    text_uid TEXT NOT NULL,
    bill_text TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vote_bills ENABLE ROW LEVEL SECURITY;

-- 'procedure' marks a sentence written by code from the motion type and result.
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_summary_basis_check;
ALTER TABLE votes ADD CONSTRAINT votes_summary_basis_check
    CHECK (summary_basis IN ('official_text', 'procedure', 'rejected'));
