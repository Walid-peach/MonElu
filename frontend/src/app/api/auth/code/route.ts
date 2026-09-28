import { isPlausibleEmail } from '@/lib/auth'
import {
  authConfig,
  authError,
  createSupabaseServerClient,
  isSameOrigin,
  noStoreJson,
  readJsonObject,
  retryAfterSeconds,
  toAuthErrorCode,
} from '@/lib/supabase/server'

/**
 * Step 1 of sign-in: email a six-digit code (#415, ADR-040 §2).
 *
 * There is no sign-up form - the first code sent to an address creates its
 * Supabase identity. The code, not a link, is what the email carries: that is
 * the Supabase email template's `{{ .Token }}`, configured with the custom SMTP
 * in #419.
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
  if (!isPlausibleEmail(email)) return authError('invalid_email')

  try {
    const supabase = await createSupabaseServerClient(config)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (error) {
      const code = toAuthErrorCode(error)
      return authError(code, code === 'rate_limited' ? { retryAfter: retryAfterSeconds(error.message) } : undefined)
    }
  } catch {
    return authError('unavailable')
  }
  return noStoreJson({ sent: true })
}
