-- MonÉlu — add plain-language summary and theme classification to votes
-- Idempotent: IF NOT EXISTS guards

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS summary_plain TEXT,
  ADD COLUMN IF NOT EXISTS theme         TEXT;

-- theme is one of the 8 fixed LLM-classified categories, or NULL if not yet generated
