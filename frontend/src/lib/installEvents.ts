// Install-flow counters (#598, epic #593): what feeds the ADR-041 §2 Android
// trigger. Each call adds one to today's total for that event and a coarse
// platform on the API (POST /install-events); nothing about the visitor is
// sent or stored.

import { API_BASE } from '@/lib/api'
import { isIOS } from '@/lib/installState'

// Mirrors INSTALL_EVENTS in api/routers/install_events.py and the CHECK in
// data/migrations/014_install_events.sql (tests/unit/test_install_events.py).
export const INSTALL_EVENTS = [
  'install_section_tap',
  'menu_entry_tap',
  'install_prompt_available',
  'install_prompt_shown',
  'install_prompt_accepted',
  'install_prompt_dismissed',
  'app_installed',
  'app_store_badge_tap',
  'standalone_visit',
] as const

export type InstallEvent = (typeof INSTALL_EVENTS)[number]

/** Mirrors PLATFORMS in api/routers/install_events.py. */
export type Platform = 'android' | 'ios' | 'other'

/**
 * Android, iPhone/iPad or anything else, so the Android figures the ADR-041
 * trigger needs can be read apart: installed-app sessions and installs also
 * happen on iPhone (home-screen web apps) and on desktop.
 */
export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  if (isIOS()) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'other'
}

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
      body: JSON.stringify({ event, platform: currentPlatform() }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

/**
 * Counts an event at most once per browsing session, so the number tracks
 * sessions rather than page views.
 */
function recordOncePerSession(event: InstallEvent): void {
  const key = `monelu-install-event-${event}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    // No session storage (private mode, blocked storage): skip rather than
    // count every page view.
    return
  }
  recordInstallEvent(event)
}

/** A session opened as the installed web app. */
export function recordStandaloneVisitOnce(): void {
  recordOncePerSession('standalone_visit')
}

/** A session in which the browser offered installation (`beforeinstallprompt`). */
export function recordPromptAvailableOnce(): void {
  recordOncePerSession('install_prompt_available')
}
