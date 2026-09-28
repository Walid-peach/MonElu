import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { AuthErrorCode } from '@/lib/auth'

/**
 * The only place the frontend talks to Supabase (#415, ADR-040 §4).
 *
 * `server-only` makes importing this from a client component a build error, so
 * the Supabase client - and with it every token - stays on the Next server.
 * There is deliberately no browser client and no `NEXT_PUBLIC_SUPABASE_*`
 * variable: the browser reaches auth only through `/api/auth/*`, and account
 * data only through `/api/account/*`.
 */

type AuthConfig = { url: string; key: string }

/**
 * `null` until both variables are set, which is the state every preview and
 * every local checkout starts in: the auth handlers then answer 503 and the
 * session endpoint reports `enabled: false`, so the nav shows no sign-in entry
 * rather than one that cannot work.
 *
 * `SUPABASE_PUBLISHABLE_KEY` is the project's public (anon) key - not a
 * secret, but kept server-side anyway because nothing in the browser needs it.
 */
export function authConfig(): AuthConfig | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  return url && key ? { url, key } : null
}

/**
 * Cookie attributes for the session, forced on every write.
 *
 * `@supabase/ssr` defaults to `httpOnly: false` because its browser client
 * reads the cookie; this project has no browser client, so the cookie is
 * httpOnly and client JavaScript cannot read the token at all. `lax` keeps it
 * off cross-site POSTs, which is half of the CSRF story - `isSameOrigin` below
 * is the other half.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

/**
 * Longest a session cookie may live: 13 months, the CNIL's reference lifetime
 * for cookies, which `/confidentialite` states. `@supabase/ssr` would otherwise
 * write 400 days. A shorter server-side session expiry (#419) ends the session
 * sooner; this only bounds what the browser keeps.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 395 * 24 * 60 * 60

/**
 * A request-scoped Supabase client whose session lives in the Next cookies.
 *
 * Only call this from a route handler: it may refresh an expired access token
 * and write the new cookies, and only route handlers (not server components)
 * can set cookies.
 */
export async function createSupabaseServerClient(config: AuthConfig) {
  const store = await cookies()
  return createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: toSet => {
        for (const { name, value, options } of toSet) {
          // A removal arrives as `maxAge: 0` and must stay one.
          const maxAge =
            options.maxAge === undefined ? undefined : Math.min(options.maxAge, SESSION_COOKIE_MAX_AGE_SECONDS)
          store.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS, maxAge })
        }
      },
    },
  })
}

/**
 * Reduce a Supabase auth error to one of the codes the page knows how to say.
 *
 * `email_address_not_authorized` is what Supabase's built-in sender answers for
 * any address outside the project team - i.e. the custom SMTP of #419 is not
 * configured - so it reads as "unavailable", not as a problem with the
 * visitor's address.
 */
export function toAuthErrorCode(
  error: { code?: string; status?: number; name?: string } | null
): AuthErrorCode {
  // Supabase unreachable (network failure, timeout): not the visitor's fault.
  if (error?.name === 'AuthRetryableFetchError') return 'unavailable'
  switch (error?.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid_email'
    case 'otp_expired':
    case 'invalid_credentials':
      return 'invalid_code'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited'
    case 'email_address_not_authorized':
    case 'email_provider_disabled':
    case 'otp_disabled':
    case 'signup_disabled':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
    case 'request_timeout':
    case 'unexpected_failure':
      return 'unavailable'
  }
  if (error?.status === 429) return 'rate_limited'
  if (error?.status !== undefined && error.status >= 500) return 'unavailable'
  return 'unknown'
}

const STATUS_FOR: Record<AuthErrorCode, number> = {
  invalid_email: 400,
  invalid_code: 400,
  rate_limited: 429,
  signed_out: 401,
  unavailable: 503,
  unknown: 500,
}

/**
 * Every auth and account response is per-visitor: never stored by a CDN, a
 * shared cache or the browser's back-forward cache.
 */
export const NO_STORE = 'private, no-store'

export function noStoreJson(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra)
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', NO_STORE)
  return new Response(JSON.stringify(body), { status, headers })
}

export function authError(code: AuthErrorCode, extra?: Record<string, unknown>): Response {
  return noStoreJson({ error: code, ...extra }, STATUS_FOR[code])
}

/**
 * Supabase states the remaining wait in prose ("... after 42 seconds"). Parsed
 * so the resend button counts down the real interval instead of guessing.
 */
export function retryAfterSeconds(message: string | undefined): number | undefined {
  const match = message?.match(/after (\d+) seconds?/i)
  return match ? Number(match[1]) : undefined
}

/**
 * Reject a state-changing request sent from another origin.
 *
 * The `lax` session cookie already stays off cross-site POSTs; this closes the
 * same-site-but-cross-origin gap and any browser that does not honour
 * SameSite. A browser states where a request came from twice - `Origin`, and
 * `Sec-Fetch-Site` on every modern engine - and either one naming another
 * origin is refused. A request with neither (a non-browser client) carries no
 * ambient cookie to abuse, so it is let through: what bounds a script calling
 * `/api/auth/code` directly is Supabase's own rate limit, not this check.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

/**
 * Read a JSON body, or `null` for anything that is not a JSON object sent as
 * `application/json`. Requiring the content type means a cross-origin page can
 * only reach these handlers through a CORS preflight, which it cannot pass.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/** Supabase's cookie prefix: `sb-<project-ref>-auth-token`, plus its chunks and code verifiers. */
export const SUPABASE_COOKIE_PREFIX = 'sb-'

/**
 * Expire Supabase cookies on this origin - all of them, or only those `match`
 * accepts. Used by sign-out (all) and after a successful sign-in (the PKCE
 * code verifiers, which `@supabase/ssr` writes on every code request but the
 * email-code flow never reads).
 */
export async function clearSupabaseCookies(match: (name: string) => boolean = () => true) {
  const store = await cookies()
  for (const { name } of store.getAll()) {
    if (name.startsWith(SUPABASE_COOKIE_PREFIX) && match(name)) {
      store.set(name, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
    }
  }
}
