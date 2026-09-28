import type { SessionPayload } from '@/lib/auth'
import { authConfig, createSupabaseServerClient, noStoreJson } from '@/lib/supabase/server'

/**
 * Who is signed in, for `SessionProvider` (#415, ADR-040).
 *
 * The only thing the browser learns about its session is this payload: whether
 * accounts are enabled, and the signed-in email. `getClaims()` verifies the
 * access token's signature against the project's published keys (refreshing an
 * expired token through the refresh cookie first), so a forged or stale cookie
 * reads as signed out rather than as whoever it claims to be.
 *
 * Read by a client component after hydration - never by a server component
 * in the root layout, where a per-request read would opt every page out of
 * ISR (GH #354). Per-visitor: never cached, no `revalidate` (GH #352).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const config = authConfig()
  if (!config) return noStoreJson({ enabled: false, user: null } satisfies SessionPayload)

  try {
    const supabase = await createSupabaseServerClient(config)
    const { data, error } = await supabase.auth.getClaims()
    const claims = error ? null : data?.claims
    const email = typeof claims?.email === 'string' ? claims.email : null
    return noStoreJson({ enabled: true, user: claims ? { email } : null } satisfies SessionPayload)
  } catch {
    return noStoreJson({ enabled: true, user: null } satisfies SessionPayload)
  }
}
