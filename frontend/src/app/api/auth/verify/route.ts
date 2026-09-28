import { isPlausibleEmail, isWellFormedCode } from '@/lib/auth'
import { ensureProfile } from '@/lib/supabase/accountApi'
import {
  authConfig,
  authError,
  clearSupabaseCookies,
  createSupabaseServerClient,
  isSameOrigin,
  noStoreJson,
  readJsonObject,
  toAuthErrorCode,
} from '@/lib/supabase/server'

/**
 * Step 2 of sign-in: exchange the emailed code for a session (#415, ADR-040).
 *
 * On success the session is written to httpOnly cookies on this origin by the
 * Supabase server client, and the response body carries the email only - the
 * access token never appears in a body the browser can read.
 *
 * Per-visitor and state-changing: never cached, no `revalidate` (GH #352).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return noStoreJson({ error: 'unknown' }, 403)
  const config = authConfig()
  if (!config) return authError('unavailable')

  const body = await readJsonObject(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : ''
  if (!isPlausibleEmail(email)) return authError('invalid_email')
  if (!isWellFormedCode(code)) return authError('invalid_code')

  try {
    const supabase = await createSupabaseServerClient(config)
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error || !data.session) return authError(toAuthErrorCode(error))

    await clearSupabaseCookies(name => name.endsWith('-code-verifier'))
    await ensureProfile(data.session.access_token)
    return noStoreJson({ user: { email: data.user?.email ?? email } })
  } catch {
    return authError('unavailable')
  }
}
