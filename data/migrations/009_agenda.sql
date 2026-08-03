-- MonÉlu — agenda ingestion: séance publique ODJ points (MON-210, ADR-030)
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.

-- One denormalized row per ODJ point, with the parent réunion's fields
-- inlined. Refreshed by upsert only (CLAUDE.md decision 8) — cancellations
-- and silent drops are both reflected via reunion_etat / point_etat and
-- last_seen_at, never by DELETE. See ADR-030 for the full reasoning.
CREATE TABLE IF NOT EXISTS agenda_items (
    point_uid       TEXT PRIMARY KEY,        -- ODJ point uid, e.g. RUANR5L17S2026IDS29879PT50907
    reunion_uid     TEXT NOT NULL,           -- parent réunion uid
    sitting_start   TIMESTAMPTZ NOT NULL,    -- réunion timeStampDebut
    sitting_end     TIMESTAMPTZ,             -- réunion timeStampFin
    objet           TEXT,                    -- free text; may be a one-word stub
    point_type      TEXT,                    -- typePointODJ ("Vote solennel", "Discussion", …)
    travaux_nature  TEXT,                    -- natureTravauxODJ (ODJPR | ODJSN | ODJAN)
    procedure_label TEXT,                    -- point procedure; present on ~5 % of points
    dossier_id      TEXT,                    -- dossiersLegislatifsRefs.dossierRef; joins votes.dossier_id
    reunion_etat    TEXT NOT NULL,           -- réunion cycleDeVie.etat (Confirmé | Annulé | Supprimé | Eventuel)
    point_etat      TEXT,                    -- point cycleDeVie.etat
    published_at    DATE,                    -- cycleDeVie.chrono.creation, when the item was scheduled
    cancelled_at    DATE,                    -- cycleDeVie.chrono.cloture, set when cancelled
    objet_hash      TEXT,                    -- sha256 of objet; drives summary regeneration
    summary_plain   TEXT,                    -- Groq one-liner; NULL for stubs, by design
    theme           TEXT,                    -- one of VALID_THEMES, or NULL
    last_seen_at    TIMESTAMPTZ NOT NULL,    -- stamped on every ingestion run
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every API query is a date window (MON-212's GET /agenda).
CREATE INDEX IF NOT EXISTS idx_agenda_items_sitting_start ON agenda_items (sitting_start);

-- Joins to votes.dossier_id (ADR-030 decision 4).
CREATE INDEX IF NOT EXISTS idx_agenda_items_dossier_id ON agenda_items (dossier_id);
