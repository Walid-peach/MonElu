'use client'

import Link from 'next/link'
import { useSession } from './SessionProvider'

/** Where the account entry points. `/mon-compte` (#416) takes over once it exists. */
export const ACCOUNT_HREF = '/connexion'

/**
 * Sign-in entry for the nav and the mobile menu (#415).
 *
 * Renders nothing until the session is known, and nothing at all on a
 * deployment where accounts are not configured - a sign-in link that can only
 * answer "indisponible" is worse than no link. Reading the site never depends
 * on it (ADR-040 §6).
 */
export function AccountLink({ onNavigate }: { onNavigate?: () => void }) {
  const { status } = useSession()
  if (status !== 'signed-in' && status !== 'signed-out') return null

  const signedIn = status === 'signed-in'
  return (
    <Link
      href={ACCOUNT_HREF}
      onClick={onNavigate}
      className="flex items-center gap-1.5 text-xs font-semibold text-navy dark:text-gray-100 border border-gray-border dark:border-[color:var(--dp-border)] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity whitespace-nowrap"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
      </svg>
      {signedIn ? 'Mon compte' : 'Se connecter'}
    </Link>
  )
}
