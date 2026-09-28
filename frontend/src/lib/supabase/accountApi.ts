import 'server-only'

import { API_BASE } from '@/lib/api'

/**
 * Server-side calls to FastAPI's `/account/*` routes (#415, ADR-040 §4).
 *
 * The access token travels as a bearer from the Next server to the API and
 * nowhere else. FastAPI verifies it itself (#413) - this layer is a courier,
 * not the authorizer, so it never asserts a user id of its own.
 */

const ACCOUNT_API_TIMEOUT_MS = 8_000

export function accountApiFetch(
  path: string,
  accessToken: string,
  init: { method?: string; body?: BodyInit | null; contentType?: string | null } = {}
): Promise<Response> {
  const headers = new Headers({ Authorization: `Bearer ${accessToken}`, Accept: 'application/json' })
  if (init.contentType) headers.set('Content-Type', init.contentType)
  return fetch(`${API_BASE}/account${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ?? null,
    // Per-user data: must never enter Next's data cache (GH #352 covers
    // public reads only).
    cache: 'no-store',
    signal: AbortSignal.timeout(ACCOUNT_API_TIMEOUT_MS),
  })
}

/**
 * Create the MonÉlu profile row on sign-in (`POST /account/me` is idempotent).
 *
 * Best effort: a failure here must not undo a sign-in that Supabase already
 * completed. Every account route answers 401 until the row exists, and the
 * account page (#416) calls the same endpoint again before its first read, so
 * a missed creation is recovered rather than stranded. Logs the error class
 * only - never the token or the response body.
 */
export async function ensureProfile(accessToken: string): Promise<boolean> {
  try {
    const res = await accountApiFetch('/me', accessToken, { method: 'POST' })
    res.body?.cancel()
    if (!res.ok) console.error(`[auth] profile creation answered ${res.status}`)
    return res.ok
  } catch (err) {
    console.error(`[auth] profile creation failed: ${err instanceof Error ? err.name : 'unknown'}`)
    return false
  }
}
