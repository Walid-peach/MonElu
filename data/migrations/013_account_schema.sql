-- MonÉlu — private account schema, restricted role, and RLS that actually applies (#412, ADR-040)
-- Idempotent: CREATE SCHEMA/TABLE IF NOT EXISTS, DO-guarded CREATE ROLE, DROP POLICY IF EXISTS
-- before each CREATE POLICY. Safe to re-run.
--
-- Why 013 and not 012: ADR-040 said "012", written before #368's open PR claimed
-- 012_dossiers.sql. Prefixes must be unique (assert_unique_numeric_prefixes,
-- MON-226), so this file takes the next free one.
--
-- ---------------------------------------------------------------------------
-- Why this is not in `public`, unlike every other table in this project
-- ---------------------------------------------------------------------------
-- MON-248 requires RLS on every new `public` table, because on Supabase `public`
-- is served through PostgREST and the anon role holds default privileges there.
-- That rule is sound, and for public civic data RLS is the whole gate.
--
-- For user data it would be a comfortable illusion. The API, the ingestion
-- scripts and dbt all connect as the table OWNER, which bypasses RLS entirely
-- (001_init.sql says so in its own RLS header, and `document_chunks` running
-- with RLS on and no policy since 001 is the production proof). A policy on a
-- `public` account table would be visible in this file and enforce nothing, so
-- one forgotten `WHERE profile_id = …` in api/ would expose every account.
--
-- ADR-040 therefore stacks three layers instead of one:
--
--   1. `app_private` is not in Supabase's exposed schemas, so PostgREST never
--      serves it. The MON-248 failure mode is removed rather than guarded.
--   2. `monelu_app_user` is a non-owner role with no BYPASSRLS. The API opens a
--      second connection pool as this role for account routes only (#413);
--      public routes keep the existing owner connection untouched.
--   3. The policies below therefore apply, keyed on a per-transaction GUC.
--
-- The identity comes from `app.user_id`, set inside each authenticated
-- transaction from a JWT the API verified itself:
--
--     BEGIN;
--     SET LOCAL app.user_id = '<sub from the verified token>';
--     SELECT … ;          -- policies filter this to that profile
--     COMMIT;
--
-- `SET LOCAL`, never `SET`: Supabase sits behind PgBouncer in transaction
-- pooling mode, so a session-scoped SET outlives the request and leaks the
-- previous caller's identity to whoever gets that connection next.
--
-- `NULLIF(…, '')` matters: current_setting(…, true) returns NULL when the GUC
-- was never set, which makes every policy false and the query return nothing —
-- fails closed. An empty string would instead raise on the uuid cast, so it is
-- normalised to NULL and fails closed the same way.
--
-- Deliberately NOT used here: `FORCE ROW LEVEL SECURITY`, which would subject
-- the owner to these policies too. It is tempting (an account route that
-- wrongly used the owner pool would fail closed), but ADR-040 does not call for
-- it and it would also block owner-level maintenance and inspection. Revisit
-- with an ADR amendment, not in passing.
--
-- Do NOT add a `public_read` policy to anything in this file. These are the
-- only tables in the project holding personal data.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app_private;

-- No ambient access: PUBLIC gets nothing on this schema, and the Supabase
-- anon/authenticated roles are never granted anything in it. The DO guard is
-- required because those roles exist on Supabase but not in local Docker.
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA app_private FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA app_private FROM authenticated';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The restricted role
-- ---------------------------------------------------------------------------
-- Created NOLOGIN on purpose: it cannot authenticate until an operator sets a
-- password out of band, so no credential for it lives in this repository.
--
--     ALTER ROLE monelu_app_user WITH LOGIN PASSWORD '<generated>';
--
-- #413 then consumes it as its own connection URL. Rotating that password is an
-- ALTER ROLE plus an env-var change; it never touches this migration.
-- CREATE ROLE's defaults are already NOSUPERUSER / NOBYPASSRLS / NOCREATEDB /
-- NOCREATEROLE, and this deliberately does NOT re-assert them with ALTER ROLE:
-- setting or clearing SUPERUSER and BYPASSRLS requires an actual superuser,
-- which Supabase's `postgres` role is not — the ALTER would fail the migration
-- in production while succeeding locally. So instead of enforcing the
-- attributes, verify them and fail loudly: either of them silently turns every
-- policy below into decoration.
-- The CREATE is wrapped so a missing CREATEROLE privilege explains itself. This
-- migration runs as Railway's start hook (`migrate.py && uvicorn` in
-- railway.json), so a failure here does not merely skip a table - it stops the
-- API from starting. A bare "permission denied to create role" would be a
-- confusing way to find that out at 3am.
DO $$
DECLARE
    role_row RECORD;
BEGIN
    SELECT rolsuper, rolbypassrls
      INTO role_row
      FROM pg_roles
     WHERE rolname = 'monelu_app_user';

    IF NOT FOUND THEN
        BEGIN
            CREATE ROLE monelu_app_user NOLOGIN NOINHERIT;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE EXCEPTION
                'Cannot create the monelu_app_user role: the migration user lacks '
                'CREATEROLE. Check it with: SELECT rolcreaterole FROM pg_roles '
                'WHERE rolname = current_user; On Supabase the `postgres` role has '
                'it. Until this succeeds the account routes have no restricted '
                'connection and #413 cannot ship (ADR-040).';
        END;
    ELSIF role_row.rolsuper OR role_row.rolbypassrls THEN
        RAISE EXCEPTION
            'monelu_app_user already exists with SUPERUSER or BYPASSRLS, which '
            'bypasses every policy in this migration. Clear those attributes as '
            'a superuser before re-running (ADR-040).';
    END IF;
END
$$;

-- USAGE on `public` is already held by PUBLIC, but granting it explicitly keeps
-- the role's access legible in one place rather than resting on a default.
GRANT USAGE ON SCHEMA public TO monelu_app_user;
GRANT USAGE ON SCHEMA app_private TO monelu_app_user;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The profile row. `id` is MonÉlu's own UUID and is what every other table here
-- references; the Supabase user id sits beside it as a unique attribute.
-- ADR-040: never key application data on the provider's subject id, or leaving
-- Supabase Auth (or adding a second sign-in method) becomes a migration of
-- every follow and bookmark instead of one column.
CREATE TABLE IF NOT EXISTS app_private.profiles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id       UUID NOT NULL UNIQUE,      -- Supabase auth.users.id
    display_name       TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'fr'
                       CHECK (preferred_language IN ('fr', 'en')),
    -- Territory is department + circonscription (ADR-040 §6). `department_code`
    -- is the code api/departments_data.py keys on and GET /departments/{code}
    -- serves — not the expanded name deputies.department holds, which is
    -- derived from it. `circonscription` follows deputies.circonscription's
    -- convention: a bare number as TEXT ("1", "10"). Commune-level territory is
    -- deferred: no commune-to-circonscription dataset is ingested anywhere.
    -- Both are validated against api/departments_data.py by the API (#414);
    -- a CHECK would pin a 100-entry list in SQL and drift from it.
    department_code    TEXT,
    circonscription    TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ON DELETE CASCADE on every child table is what makes account deletion total
-- and single-statement (RGPD article 17, #414).
CREATE TABLE IF NOT EXISTS app_private.followed_deputies (
    profile_id  UUID NOT NULL REFERENCES app_private.profiles(id) ON DELETE CASCADE,
    deputy_id   TEXT NOT NULL REFERENCES public.deputies(deputy_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (profile_id, deputy_id)
);

-- theme_slug is constrained to the ten slugs in api/themes_data.py, which are
-- themselves the VALID_THEMES scripts/_summaries.py enforces. A fixed taxonomy
-- of ten is worth a CHECK; a new theme means a migration, deliberately.
CREATE TABLE IF NOT EXISTS app_private.followed_themes (
    profile_id  UUID NOT NULL REFERENCES app_private.profiles(id) ON DELETE CASCADE,
    theme_slug  TEXT NOT NULL CHECK (theme_slug IN (
                    'economie-budget',
                    'sante-social',
                    'justice-securite',
                    'energie-environnement',
                    'education-culture',
                    'agriculture',
                    'transport-logement',
                    'institutions',
                    'international',
                    'autre'
                )),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (profile_id, theme_slug)
);

CREATE TABLE IF NOT EXISTS app_private.bookmarks (
    profile_id  UUID NOT NULL REFERENCES app_private.profiles(id) ON DELETE CASCADE,
    vote_id     TEXT NOT NULL REFERENCES public.votes(vote_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (profile_id, vote_id)
);

-- Preferences are STORED AND NOTHING IS SENT (ADR-002 as narrowed by ADR-040:
-- transactional auth mail only, no scheduled or bulk dispatch). The alert hold
-- on #359 stands, and the UI says so on the account page (#416).
CREATE TABLE IF NOT EXISTS app_private.notification_preferences (
    profile_id             UUID PRIMARY KEY
                           REFERENCES app_private.profiles(id) ON DELETE CASCADE,
    followed_deputy_votes  BOOLEAN NOT NULL DEFAULT FALSE,
    followed_theme_votes   BOOLEAN NOT NULL DEFAULT FALSE,
    weekly_digest          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The account routes read the public civic tables too (a followed deputy's
-- name, a bookmarked vote's title). Those rows are public by design and already
-- carry 001_init.sql's `public_read` SELECT policies, so SELECT is all this role
-- gets — no write privilege anywhere in `public`.
GRANT SELECT ON public.deputies, public.votes TO monelu_app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    app_private.profiles,
    app_private.followed_deputies,
    app_private.followed_themes,
    app_private.bookmarks,
    app_private.notification_preferences
TO monelu_app_user;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE app_private.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.followed_deputies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.followed_themes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.bookmarks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.notification_preferences  ENABLE ROW LEVEL SECURITY;

-- FOR ALL with both USING and WITH CHECK: reads, updates and deletes are
-- filtered, and an INSERT cannot write a row belonging to another profile.
DROP POLICY IF EXISTS own_profile ON app_private.profiles;
CREATE POLICY own_profile ON app_private.profiles
    FOR ALL
    USING      (id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS own_followed_deputies ON app_private.followed_deputies;
CREATE POLICY own_followed_deputies ON app_private.followed_deputies
    FOR ALL
    USING      (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS own_followed_themes ON app_private.followed_themes;
CREATE POLICY own_followed_themes ON app_private.followed_themes
    FOR ALL
    USING      (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS own_bookmarks ON app_private.bookmarks;
CREATE POLICY own_bookmarks ON app_private.bookmarks
    FOR ALL
    USING      (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS own_notification_preferences ON app_private.notification_preferences;
CREATE POLICY own_notification_preferences ON app_private.notification_preferences
    FOR ALL
    USING      (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (profile_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- updated_at is maintained by the database, not by callers
-- ---------------------------------------------------------------------------
-- An `updated_at` that depends on every future endpoint remembering to set it is
-- a column that quietly lies. There is no trigger precedent in this project
-- because no earlier table has a caller-maintained timestamp - `ingested_at` and
-- `changed_at` are written by the ingestion upserts themselves, which are the
-- only writer. These two tables will have several writers (#414), so the
-- guarantee belongs here.
CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_profiles_updated_at ON app_private.profiles;
CREATE TRIGGER touch_profiles_updated_at
    BEFORE UPDATE ON app_private.profiles
    FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

DROP TRIGGER IF EXISTS touch_notification_preferences_updated_at
    ON app_private.notification_preferences;
CREATE TRIGGER touch_notification_preferences_updated_at
    BEFORE UPDATE ON app_private.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

-- No extra indexes: the UNIQUE constraint on profiles.auth_user_id already
-- indexes the one lookup that runs before `app.user_id` is known ("which profile
-- is this signed-in user"), and every child table's primary key leads with
-- profile_id, which is exactly what the policies filter on.
--
-- That first lookup by auth_user_id cannot satisfy own_profile — the GUC is not
-- set yet — so #413 runs it on the owner connection and then sets the GUC for
-- everything after. It is the single deliberate exception to "account routes use
-- the restricted pool", and it reads one row by unique key.
