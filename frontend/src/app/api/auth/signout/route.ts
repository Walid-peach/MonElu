import {
  authConfig,
  clearSupabaseCookies,
  createSupabaseServerClient,
  isSameOrigin,
  noStoreJson,
} from '@/lib/supabase/server'

/**
 * Sign out this browser (#415, ADR-040).
 *
 * `scope: 'local'` revokes this session's refresh token only, so signing out on
 * a laptop leaves the phone signed in. The Supabase call can fail (network,
 * already-expired session), and a sign-out that leaves the cookie behind is
 * not a sign-out, so every `sb-*` cookie is cleared here regardless of how
 * Supabase answered.
 *
 * Per-visitor and state-changing: never cached, no `revalidate` (GH #352).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return noStoreJson({ error: 'unknown' }, 403)

  const config = authConfig()
  if (config) {
    try {
      const supabase = await createSupabaseServerClient(config)
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Fall through: the cookies below are what signs this browser out.
    }
  }

  await clearSupabaseCookies()
  return noStoreJson({ user: null })
}
