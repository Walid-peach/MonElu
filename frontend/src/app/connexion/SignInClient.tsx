'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import {
  CODE_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  authErrorMessage,
  isPlausibleEmail,
  isWellFormedCode,
} from '@/lib/auth'

/**
 * The two sign-in screens (#415, ADR-040 §2): enter an email, then type the
 * six-digit code.
 *
 * Every call goes to a same-origin `/api/auth/*` handler; the session they set
 * is an httpOnly cookie this component never sees. Errors come back as codes
 * and render through `authErrorMessage` - a raw Supabase or API body is never
 * shown.
 */

type Step = 'email' | 'code'

const inputStyle = {
  width: '100%',
  border: '1px solid var(--dp-border)',
  borderRadius: 8,
  padding: '11px 13px',
  fontSize: 16, // at least 16px, or iOS zooms the page on focus
  color: 'var(--dp-text)',
  background: 'var(--dp-card-bg)',
  fontFamily: 'inherit',
} as const

const primaryButton = (disabled: boolean) =>
  ({
    background: 'var(--dp-active-bg)',
    color: '#fff',
    border: 'none',
    padding: '11px 18px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 15,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }) as const

const linkButton = (disabled: boolean) =>
  ({
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 14,
    fontWeight: 600,
    color: disabled ? 'var(--dp-text-muted)' : 'var(--dp-text)',
    textDecoration: disabled ? 'none' : 'underline',
    cursor: disabled ? 'default' : 'pointer',
  }) as const

const labelStyle = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--dp-text)',
  marginBottom: 8,
} as const

const hintStyle = { fontSize: 14, lineHeight: 1.6, color: 'var(--dp-text-secondary)', margin: 0 } as const

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data: data && typeof data === 'object' ? data : {} }
  } catch {
    return { ok: false, data: { error: 'unavailable' } }
  }
}

/**
 * Seconds left before another code may be requested. `start` sets the deadline
 * and the clock together, so the first render already shows the right count;
 * the interval runs only while a cooldown is active and clears itself.
 */
function useCooldown() {
  const [until, setUntil] = useState<number | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (until === null) return
    const id = window.setInterval(() => {
      const t = Date.now()
      if (t >= until) setUntil(null)
      else setNow(t)
    }, 1000)
    return () => window.clearInterval(id)
  }, [until])

  const start = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setUntil(t + seconds * 1000)
  }, [])
  const clear = useCallback(() => setUntil(null), [])
  const remaining = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000))
  return { remaining, start, clear }
}

export function SignInClient() {
  const session = useSession()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { remaining: cooldown, start: startCooldown, clear: clearCooldown } = useCooldown()

  async function requestCode(address: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    setNotice(null)
    const { ok, data } = await postJson('/api/auth/code', { email: address })
    setBusy(false)
    if (ok) {
      startCooldown(RESEND_COOLDOWN_SECONDS)
      return true
    }
    if (data.error === 'rate_limited') {
      const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : RESEND_COOLDOWN_SECONDS
      startCooldown(retryAfter)
    }
    setError(authErrorMessage(data.error))
    return false
  }

  async function onSubmitEmail(e: FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!isPlausibleEmail(address)) {
      setError(authErrorMessage('invalid_email'))
      return
    }
    if (cooldown > 0 || busy) return
    if (await requestCode(address)) {
      setCode('')
      setStep('code')
    }
  }

  async function onResend() {
    if (cooldown > 0 || busy) return
    if (await requestCode(email.trim())) setNotice('Un nouveau code vient de vous être envoyé.')
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!isWellFormedCode(digits)) {
      setError(authErrorMessage('invalid_code'))
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const { ok, data } = await postJson('/api/auth/verify', { email: email.trim(), code: digits })
    if (ok) {
      await session.refresh()
      setCode('')
      setStep('email')
      clearCooldown()
    } else {
      setError(authErrorMessage(data.error))
    }
    setBusy(false)
  }

  function onChangeEmail() {
    setStep('email')
    setCode('')
    setError(null)
    setNotice(null)
    clearCooldown()
  }

  async function onSignOut() {
    setBusy(true)
    await session.signOut()
    setBusy(false)
  }

  if (session.status === 'loading') {
    return <p style={hintStyle} aria-live="polite">Chargement…</p>
  }

  if (session.status === 'disabled') {
    return (
      <section aria-labelledby="signin-heading">
        <h2 id="signin-heading" style={{ fontWeight: 700, fontSize: 17, color: 'var(--dp-text)', margin: '0 0 12px' }}>
          Connexion indisponible
        </h2>
        <p style={hintStyle}>
          La connexion n&apos;est pas ouverte pour le moment. Tout MonÉlu reste consultable sans compte.
        </p>
      </section>
    )
  }

  if (session.status === 'signed-in') {
    return (
      <section aria-labelledby="signin-heading">
        <h2 id="signin-heading" style={{ fontWeight: 700, fontSize: 17, color: 'var(--dp-text)', margin: '0 0 12px' }}>
          Vous êtes connecté·e
        </h2>
        <p style={{ ...hintStyle, marginBottom: 16, overflowWrap: 'anywhere' }}>
          {session.email ? (
            <>
              Adresse utilisée : <strong style={{ color: 'var(--dp-text)' }}>{session.email}</strong>
            </>
          ) : (
            'Votre session est active sur cet appareil.'
          )}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <button type="button" onClick={onSignOut} disabled={busy} style={primaryButton(busy)}>
            {busy ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
          <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: 'var(--dp-text)' }}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </section>
    )
  }

  const errorBox = error && (
    <p role="alert" style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--dp-red)', margin: '12px 0 0' }}>
      {error}
    </p>
  )

  if (step === 'code') {
    return (
      <section aria-labelledby="signin-heading">
        <h2 id="signin-heading" style={{ fontWeight: 700, fontSize: 17, color: 'var(--dp-text)', margin: '0 0 12px' }}>
          Saisissez le code reçu
        </h2>
        <p style={{ ...hintStyle, marginBottom: 16, overflowWrap: 'anywhere' }}>
          Un code à {CODE_LENGTH} chiffres a été envoyé à <strong style={{ color: 'var(--dp-text)' }}>{email.trim()}</strong>.
          Pensez à vérifier vos courriers indésirables.
        </p>
        <form onSubmit={onSubmitCode} noValidate>
          <label htmlFor="signin-code" style={labelStyle}>
            Code de connexion
          </label>
          <input
            id="signin-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${CODE_LENGTH}}`}
            maxLength={CODE_LENGTH}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            autoFocus
            style={{ ...inputStyle, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums', maxWidth: 220 }}
          />
          {errorBox}
          {notice && !error && (
            <p role="status" style={{ ...hintStyle, marginTop: 12 }}>
              {notice}
            </p>
          )}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy} style={primaryButton(busy)}>
              {busy ? 'Vérification…' : 'Valider'}
            </button>
          </div>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 20 }}>
          <button type="button" onClick={onResend} disabled={cooldown > 0 || busy} style={linkButton(cooldown > 0 || busy)}>
            {cooldown > 0 ? `Renvoyer un code (${cooldown} s)` : 'Renvoyer un code'}
          </button>
          <button type="button" onClick={onChangeEmail} disabled={busy} style={linkButton(busy)}>
            Changer d&apos;adresse
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="signin-heading">
      <h2 id="signin-heading" style={{ fontWeight: 700, fontSize: 17, color: 'var(--dp-text)', margin: '0 0 12px' }}>
        Recevoir un code
      </h2>
      <form onSubmit={onSubmitEmail} noValidate>
        <label htmlFor="signin-email" style={labelStyle}>
          Adresse e-mail
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ ...inputStyle, maxWidth: 420 }}
        />
        {errorBox}
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={busy || cooldown > 0} style={primaryButton(busy || cooldown > 0)}>
            {busy ? 'Envoi…' : cooldown > 0 ? `Patientez (${cooldown} s)` : 'Recevoir un code'}
          </button>
        </div>
      </form>
    </section>
  )
}
