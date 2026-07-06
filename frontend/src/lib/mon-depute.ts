// Persists the visitor's chosen deputy across sessions - no accounts, same
// localStorage-only pattern as the chat conversation history (see
// app/chat/page.tsx). lastSeenAt is per-deputy so switching deputies doesn't
// carry over a stale "since last visit" cutoff.

const DEPUTY_KEY = 'monelu-followed-deputy'
const LAST_SEEN_PREFIX = 'monelu-last-seen-'

export function getFollowedDeputyId(): string | null {
  try {
    return localStorage.getItem(DEPUTY_KEY)
  } catch {
    return null
  }
}

export function setFollowedDeputyId(deputyId: string): void {
  try {
    localStorage.setItem(DEPUTY_KEY, deputyId)
  } catch {}
}

export function clearFollowedDeputyId(): void {
  try {
    localStorage.removeItem(DEPUTY_KEY)
  } catch {}
}

export function getLastSeenAt(deputyId: string): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_PREFIX + deputyId)
  } catch {
    return null
  }
}

export function setLastSeenAt(deputyId: string, iso: string): void {
  try {
    localStorage.setItem(LAST_SEEN_PREFIX + deputyId, iso)
  } catch {}
}
