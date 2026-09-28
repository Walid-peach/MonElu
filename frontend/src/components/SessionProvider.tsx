'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { SessionPayload } from '@/lib/auth'

/**
 * The one source of "who is signed in" for client components (#415, ADR-040).
 *
 * Same shape as `ThemeProvider` (MON-168): a component that needs the session
 * reads it through `useSession()` and never keeps its own copy, storage key or
 * cookie. There is nothing to store anyway - the session is an httpOnly cookie
 * this code cannot read. What the provider holds is the answer of
 * `GET /api/auth/session`, fetched once after hydration.
 *
 * Deliberately a client-side fetch rather than a server read in the root
 * layout: reading cookies there would make every page dynamic and undo the
 * site-wide ISR policy (GH #352, GH #354).
 *
 * - `loading`   - the first answer has not arrived yet; render nothing auth-related.
 * - `disabled`  - accounts are not configured on this deployment (or the check
 *                 failed); render no sign-in entry at all.
 * - `signed-out` / `signed-in` - as named.
 */
export type SessionStatus = 'loading' | 'disabled' | 'signed-out' | 'signed-in'

type SessionContextValue = {
  status: SessionStatus
  email: string | null
  /** Re-read the session. A failed read keeps the state already known. */
  refresh: () => Promise<void>
  /**
   * Record a sign-in the verify handler just confirmed. Its answer is
   * authoritative, so no second read is needed - and a failed second read
   * must not tell someone who just signed in that sign-in is unavailable.
   */
  confirmSignedIn: (email: string | null) => void
  /** Sign this browser out. Resolves once the cookie is cleared. */
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

async function fetchSession(): Promise<SessionPayload | null> {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
    return res.ok ? ((await res.json()) as SessionPayload) : null
  } catch {
    return null
  }
}

type State = Pick<SessionContextValue, 'status' | 'email'>

/**
 * `null` is a failed read, not an answer. Before anything is known it hides
 * the sign-in entry (`disabled`); once a state is known it is kept, so one
 * dropped request does not sign the visitor out on screen or hide sign-in.
 */
function toState(payload: SessionPayload | null, previous: State): State {
  if (payload === null) return previous.status === 'loading' ? { status: 'disabled', email: null } : previous
  if (!payload.enabled) return { status: 'disabled', email: null }
  if (!payload.user) return { status: 'signed-out', email: null }
  return { status: 'signed-in', email: payload.user.email }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    status: 'loading',
    email: null,
  })

  const refresh = useCallback(async () => {
    const payload = await fetchSession()
    setState(previous => toState(payload, previous))
  }, [])

  const confirmSignedIn = useCallback((email: string | null) => {
    setState({ status: 'signed-in', email })
  }, [])

  useEffect(() => {
    // /embed/* is iframed into third-party sites with no site chrome, so no
    // account entry renders there - skip the request rather than spend a
    // function invocation per embed view.
    if (window.location.pathname.startsWith('/embed')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'disabled', email: null })
      return
    }
    let cancelled = false
    fetchSession().then(payload => {
      if (!cancelled) setState(previous => toState(payload, previous))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    let cleared = false
    try {
      const res = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      })
      cleared = res.ok
    } catch {
      cleared = false
    }
    if (cleared) setState(previous => (previous.status === 'disabled' ? previous : { status: 'signed-out', email: null }))
    // Not confirmed: the cookie may still be there, so ask rather than assume.
    else await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ ...state, refresh, confirmSignedIn, signOut }),
    [state, refresh, confirmSignedIn, signOut]
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
