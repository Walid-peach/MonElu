// Install-flow counters (#598, epic #593): what feeds the ADR-041 §2 Android
// trigger. Each call adds one to today's total for that event on the API
// (POST /install-events); nothing about the visitor is sent or stored.

import { API_BASE } from '@/lib/api'

// Mirrors INSTALL_EVENTS in api/routers/install_events.py and the CHECK in
// data/migrations/014_install_events.sql (tests/unit/test_install_events.py).
export const INSTALL_EVENTS = [
  'install_section_tap',
  'menu_entry_tap',
  'install_prompt_shown',
  'install_prompt_accepted',
  'install_prompt_dismissed',
  'app_installed',
  'app_store_badge_tap',
  'standalone_visit',
] as const

export type InstallEvent = (typeof INSTALL_EVENTS)[number]

/**
 * Counts one install-flow event. Fire and forget: `keepalive` lets the request
 * finish when the tap navigates away, and a failure is swallowed, because a
 * missed count must never get in the way of the page.
 */
export function recordInstallEvent(event: InstallEvent): void {
  try {
    void fetch(`${API_BASE}/install-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

const STANDALONE_SESSION_KEY = 'monelu-standalone-visit-counted'

/**
 * Counts a visit opened as the installed web app, once per browsing session,
 * so the number tracks sessions rather than page views.
 */
export function recordStandaloneVisitOnce(): void {
  try {
    if (sessionStorage.getItem(STANDALONE_SESSION_KEY)) return
    sessionStorage.setItem(STANDALONE_SESSION_KEY, '1')
  } catch {
    // No session storage (private mode, blocked storage): skip rather than
    // count every page view.
    return
  }
  recordInstallEvent('standalone_visit')
}
