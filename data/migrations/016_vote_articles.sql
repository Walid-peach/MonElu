-- MonÉlu - official article text behind vote summaries (#642, ADR-044)
-- Idempotent: CREATE TABLE IF NOT EXISTS - safe to re-run.
--
-- One row per article scrutin matched to the text the Assemblée examined. Only
-- voted articles are kept, not the bills. A vote with no row has no source text
-- and gets no generated summary.
CREATE TABLE IF NOT EXISTS vote_articles (
    vote_id TEXT PRIMARY KEY REFERENCES votes(vote_id) ON DELETE CASCADE,
    text_uid TEXT NOT NULL,
    article_label TEXT NOT NULL,
    article_text TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vote_articles ENABLE ROW LEVEL SECURITY;
