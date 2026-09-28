/**
 * The sign-in vocabulary shared by the browser and the auth route handlers
 * (#415, ADR-040).
 *
 * Deliberately free of any Supabase import: this module ships to the client,
 * and the browser never talks to Supabase. It holds no token, no key and no
 * cookie name - only the error codes the route handlers answer with and the
 * French sentence each one renders as. A raw Supabase error never reaches the
 * page: the auth handlers reduce it to one of these codes first. The account
 * proxy does the same for a 401 or 5xx and relays other 4xx bodies for the
 * account page to map (see `app/api/account/[...path]/route.ts`).
 */

/** Length of the emailed code. Supabase's default OTP length. */
export const CODE_LENGTH = 6

/**
 * Seconds before the visitor may ask for another code.
 *
 * Matches Supabase's default per-address send interval, so the client-side
 * cooldown is what a visitor meets first rather than the provider's 429. When
 * Supabase does answer 429 with its own remaining wait, that value wins.
 */
export const RESEND_COOLDOWN_SECONDS = 60

export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_code'
  | 'rate_limited'
  | 'signed_out'
  | 'unavailable'
  | 'unknown'

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_email: 'Cette adresse e-mail ne semble pas valide. Vérifiez-la et réessayez.',
  // Supabase answers a wrong code and an expired one with the same error, so
  // the sentence names both and points at the one action that fixes either.
  invalid_code:
    'Ce code est incorrect ou a expiré. Vérifiez les six chiffres, ou demandez un nouveau code.',
  rate_limited: 'Trop de tentatives en peu de temps. Patientez quelques instants avant de réessayer.',
  signed_out: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  unavailable:
    'La connexion est momentanément indisponible. La consultation du site reste possible sans compte.',
  unknown: 'Une erreur inattendue est survenue. Réessayez dans quelques instants.',
}

export function authErrorMessage(code: unknown): string {
  return typeof code === 'string' && code in AUTH_ERROR_MESSAGES
    ? AUTH_ERROR_MESSAGES[code as AuthErrorCode]
    : AUTH_ERROR_MESSAGES.unknown
}

/** Loose on purpose: Supabase does the real validation, this only spares it the obvious typos. */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isWellFormedCode(value: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value)
}

/** What `GET /api/auth/session` answers. `enabled` is false until Supabase is configured. */
export type SessionPayload = {
  enabled: boolean
  user: { email: string | null } | null
}
