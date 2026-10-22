-- MonÉlu — daily install-flow counters (#598, epic #593, ADR-041 §2 trigger)
-- Idempotent: CREATE TABLE IF NOT EXISTS / ENABLE RLS — safe to re-run.
--
-- One row per Paris day and event, holding nothing but a count. There is no
-- visitor identifier, IP, user agent, URL or timestamp finer than the day, so
-- the table cannot hold personal data by construction. POST /install-events
-- increments it; docs/monitoring.md reads it against the Android trigger.
--
-- The event CHECK mirrors INSTALL_EVENTS in api/routers/install_events.py;
-- tests/unit/test_install_events.py fails when the two lists differ.
CREATE TABLE IF NOT EXISTS install_event_counts (
    day DATE NOT NULL,
    event TEXT NOT NULL CHECK (event IN (
        'install_section_tap',
        'menu_entry_tap',
        'install_prompt_shown',
        'install_prompt_accepted',
        'install_prompt_dismissed',
        'app_installed',
        'app_store_badge_tap',
        'standalone_visit'
    )),
    count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (day, event)
);

-- MON-248: RLS on, no policy. Only the API, connecting as the owner, reads or
-- writes it; an anon key gets nothing.
ALTER TABLE install_event_counts ENABLE ROW LEVEL SECURITY;
