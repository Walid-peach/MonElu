-- MonÉlu — dossier parcours: dossiers + dossier_actes, and votes.scrutin_kind
-- (MON-243 / GH #368, ADR-035)
-- Idempotent: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
--
-- Numbered 012, not 011 as the issue text says: 011_changed_at.sql (GH #353)
-- took that prefix first, and migrate.py's assert_unique_numeric_prefixes
-- hard-fails on a duplicate (the 005 pair is grandfathered and must never grow).
--
-- ADR-035 §1: `votes.dossier_id` alone cannot carry a bill timeline — the AN
-- only began tagging scrutins with it in March 2026, so four bills in five have
-- no scrutin history before that. The acte parcours below is complete from the
-- start of the legislature and is the spine the page is built on; scrutins
-- attach to it where they exist.

-- One row per legislature-17 dossier législatif. Upserted only, never deleted
-- (CLAUDE.md decision 8, ADR-035 §3).
CREATE TABLE IF NOT EXISTS dossiers (
    dossier_uid     TEXT PRIMARY KEY,        -- titreDossier uid, e.g. DLR5L17N51670; joins votes.dossier_id
    legislature     TEXT,                    -- carried through from the source; ingestion is scoped to L17, this is not a multi-legislature key
    titre           TEXT NOT NULL,           -- titreDossier.titre; the readable short title, median 94 chars
    titre_chemin    TEXT,                    -- titreDossier.titreChemin; stored for a future slug URL, not routed on
    procedure_code  TEXT,                    -- procedureParlementaire.code
    procedure_label TEXT,                    -- procedureParlementaire.libelle
    initiateur      TEXT,                    -- first acteurRef, else first organeRef, of initiateur
    status          TEXT NOT NULL,           -- derived enum, ADR-035 §5
    status_label    TEXT,                    -- raw statutConclusion.libelle of the deciding acte, verbatim
    current_stage   TEXT,                    -- codeActe of the last top-level acte, e.g. AN1, SN1, PROM
    parcours_start  DATE,                    -- earliest dateActe in the tree
    parcours_end    DATE,                    -- latest dateActe in the tree
    has_scrutins    BOOLEAN NOT NULL DEFAULT FALSE,  -- drives page scope, ADR-035 §6
    last_seen_at    TIMESTAMPTZ NOT NULL,    -- stamped on every ingestion run
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_at      TIMESTAMPTZ              -- last run that wrote something different (GH #353)
);

-- One row per procedural acte, flattened out of the nested actesLegislatifs
-- tree. The nesting is preserved by parent_uid / depth / ordinal rather than by
-- document structure, so the tree is rebuilt for rendering in one ordered pass.
--
-- The primary key is composite and that is not a formality (ADR-035 §3):
-- measured over the export, 20 957 acte rows carry 20 914 distinct uids, because
-- 43 uids belong to two different dossiers each (merged dossiers sharing one
-- procedural event — L17-VD223530 is AN21-DGVT on DLR5L17N51427 and ANNLEC-DGVT
-- on DLR5L17N50588). acte_uid alone would fail on first ingestion.
CREATE TABLE IF NOT EXISTS dossier_actes (
    dossier_uid     TEXT NOT NULL REFERENCES dossiers(dossier_uid) ON DELETE CASCADE,
    acte_uid        TEXT NOT NULL,           -- acteLegislatif uid, e.g. L17-VD223914DEC
    parent_uid      TEXT,                    -- enclosing acte_uid within the same dossier; NULL at top level
    depth           SMALLINT NOT NULL,       -- 0 for a top-level stage
    ordinal         INTEGER NOT NULL,        -- pre-order position within the dossier; siblings stay in document order
    code_acte       TEXT NOT NULL,
    acte_type       TEXT,                    -- @xsi:type, e.g. Decision_Type, Etape_Type
    libelle         TEXT,                    -- libelleActe.nomCanonique
    date_acte       DATE,
    statut_label    TEXT,                    -- statutConclusion.libelle, verbatim
    organe_ref      TEXT,
    last_seen_at    TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_at      TIMESTAMPTZ,
    PRIMARY KEY (dossier_uid, acte_uid)
);

CREATE INDEX IF NOT EXISTS idx_dossiers_status ON dossiers (status);
CREATE INDEX IF NOT EXISTS idx_dossiers_scrutin_pages ON dossiers (dossier_uid) WHERE has_scrutins;
CREATE INDEX IF NOT EXISTS idx_dossier_actes_order ON dossier_actes (dossier_uid, ordinal);
CREATE INDEX IF NOT EXISTS idx_dossier_actes_date ON dossier_actes (date_acte);

-- Every new table in `public` must enable RLS (MON-248): on Supabase the anon
-- role holds default privileges there and PostgREST exposes the schema, so this
-- is the only gate. No policy on either table — the API is the only reader and
-- connects as the owner, which bypasses RLS, exactly as document_chunks does.
ALTER TABLE dossiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossier_actes ENABLE ROW LEVEL SECURITY;

-- ADR-035 §4: 96 % of the tagged scrutins are amendment or article votes
-- (2 261 amendments and 241 articles against 72 "ensemble" votes, 19 motions and
-- 15 others, measured 2026-09-22). A literal "every scrutin on the dossier"
-- timeline is therefore hundreds of rows of amendment noise around a handful of
-- meaningful nodes, so MON-244 splits headline scrutins from a collapsed
-- amendment count on this column.
--
-- It lives on `votes`, not on `dossier_actes`: it is a property of the scrutin,
-- and GET /votes benefits from it independently of any bill page. Classified
-- from objet.libelle at ingestion time (scripts/ingest_votes.py), never
-- recomputed per request.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS scrutin_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_votes_scrutin_kind ON votes (scrutin_kind);
