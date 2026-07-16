-- MonÉlu — drop the position_id surrogate key on vote_positions (MON-77)
-- Idempotent: guarded on the column's existence — safe to re-run, and a
-- no-op on fresh databases where 001_init.sql already creates the table
-- with the natural primary key.
--
-- The natural key (vote_id, deputy_id) already carried a UNIQUE constraint
-- (the ON CONFLICT target of the ingestion upsert). The surrogate BIGSERIAL
-- was never referenced by any query, FK, or ordering — it only cost 8 bytes
-- per row plus a redundant btree index (~794k rows on the Supabase free
-- tier). Promote the natural key to PRIMARY KEY and drop the surrogate.
--
-- The whole block runs in one transaction (migrate.py), so the upsert's
-- ON CONFLICT (vote_id, deputy_id) target never observably disappears:
-- the old UNIQUE constraint is only dropped after the new PK exists.
-- Dropping the column also drops its sequence (owned by the column).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vote_positions'
          AND column_name = 'position_id'
    ) THEN
        -- dbt staging views select position_id and block the column drop.
        -- CASCADE takes any dependent intermediate views along; all of them
        -- are recreated by the next `dbt run` (deploy.yml on the same merge).
        -- The API is unaffected: it only queries raw tables and the marts,
        -- which are materialized as tables.
        DROP VIEW IF EXISTS analytics_staging.stg_vote_positions CASCADE;
        ALTER TABLE public.vote_positions DROP CONSTRAINT vote_positions_pkey;
        ALTER TABLE public.vote_positions DROP COLUMN position_id;
        ALTER TABLE public.vote_positions
            ADD CONSTRAINT vote_positions_pkey PRIMARY KEY (vote_id, deputy_id);
        ALTER TABLE public.vote_positions
            DROP CONSTRAINT vote_positions_vote_id_deputy_id_key;
    END IF;
END $$;
