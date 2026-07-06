-- MonÉlu — public API tier: keys and usage accounting (MON-98)
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.

-- Keys are issued manually (email request -> row insert); no self-serve signup.
-- Only the sha256 hash of the raw key is stored, never the raw value.
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    contact_email TEXT,
    -- Anonymous requests share the per-route base limit (e.g. 30/min, 10/min
    -- on expensive endpoints). A keyed request's effective limit is
    -- base * rate_limit_multiplier, so relative route protection is preserved.
    rate_limit_multiplier INTEGER NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Per-key, per-endpoint, per-day request counters for usage accounting.
CREATE TABLE IF NOT EXISTS api_key_usage (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
    endpoint TEXT NOT NULL,
    day DATE NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (api_key_id, endpoint, day)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_day ON api_key_usage (api_key_id, day);
