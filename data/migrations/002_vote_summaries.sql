-- MonÉlu — add plain-language summary and theme classification to votes
-- Idempotent: IF NOT EXISTS guards

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS summary_plain TEXT,
  ADD COLUMN IF NOT EXISTS theme         TEXT;

-- theme is one of the LLM-classified categories in VALID_THEMES
-- (scripts/generate_vote_summaries.py — currently 10), or NULL if not yet
-- generated. No CHECK constraint on purpose: the theme list is expected to
-- evolve with the classifier prompt.
