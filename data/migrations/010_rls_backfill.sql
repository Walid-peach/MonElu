-- MonÉlu — enable Row Level Security on the seven tables created after 001 (MON-248)
-- Idempotent: ALTER ... ENABLE ROW LEVEL SECURITY is a no-op when already on.
--
-- 001_init.sql deliberately enabled RLS on all four original tables. Every
-- migration since silently dropped that pattern, leaving these seven in the
-- public schema with no second gate.
--
-- Why this matters on Supabase: tables in `public` are reachable through
-- PostgREST, and the project's default privileges grant the anon/authenticated
-- roles access to that schema. With RLS off there is nothing else in the way —
-- an anon-key caller could read the full api_keys hash list, its labels and
-- rate_limit_multipliers, and (subject to the grants actually in place) write
-- to it or to the four user-writable snapshot tables the API treats as
-- immutable.
--
-- The FastAPI app, the ingestion scripts and dbt all connect as the table
-- OWNER, which bypasses RLS — the same reason 001's RLS has never affected
-- them. document_chunks has run with RLS on and no policy since 001, which is
-- the working proof of that bypass in production.
--
-- No policies are created here, deliberately. Nothing in this project reads
-- these tables through PostgREST: there is no supabase-js client, no anon key,
-- and no NEXT_PUBLIC_SUPABASE_* env var anywhere in the repo. The API is the
-- only intended reader of all seven, so `document_chunks` (RLS on, no policy,
-- anon gets nothing) is the right precedent rather than the `public_read`
-- policies 001 gave the civic-data tables.
--
-- If direct anon reads are ever wanted on the public-by-nature tables here
-- (verifications, chat_shares, quiz_shares, agenda_items), add an explicit
-- `FOR SELECT USING (true)` policy at that point. Do NOT add one to api_keys,
-- api_key_usage or feedback: secrets, usage accounting and user-submitted
-- payloads respectively.
-- ---------------------------------------------------------------------------

-- Secrets and internal accounting — no policy, ever.
ALTER TABLE api_keys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage  ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback       ENABLE ROW LEVEL SECURITY;

-- Immutable snapshots and agenda data — served through the API only.
ALTER TABLE verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_shares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_shares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items   ENABLE ROW LEVEL SECURITY;
