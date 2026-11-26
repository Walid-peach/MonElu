CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

DO $$
DECLARE
    ext_schema text;
BEGIN
    SELECT n.nspname INTO ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'unaccent';

    EXECUTE format(
        $fn$
        CREATE OR REPLACE FUNCTION public.f_unaccent(text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        STRICT
        PARALLEL SAFE
        SET search_path = ''
        AS $body$ SELECT %1$I.unaccent(%2$L::regdictionary, $1) $body$
        $fn$,
        ext_schema,
        format('%I.unaccent', ext_schema)
    );
END
$$;
