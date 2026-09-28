import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInClient } from '@/app/connexion/SignInClient'
import { AccountLink } from '@/components/AccountLink'
import { SessionProvider } from '@/components/SessionProvider'
import { AUTH_ERROR_MESSAGES, RESEND_COOLDOWN_SECONDS } from '@/lib/auth'

/**
 * The two sign-in screens and the session provider (#415). The route handlers
 * are faked at `fetch`: this suite checks what the visitor sees, and that the
 * page only ever talks to same-origin `/api/auth/*`.
 */

type Reply = { status: number; body?: unknown }

let session: { enabled: boolean; user: { email: string | null } | null }
let replies: Record<string, Reply[]>
const fetchMock = jest.fn()

/** jsdom has no `Response`; the components only read `ok`, `status` and `json()`. */
const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

function reply(url: string, r: Reply) {
  ;(replies[url] ??= []).push(r)
}

beforeEach(() => {
  session = { enabled: true, user: null }
  replies = {}
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/session') return respond(200, session)
    if (url === '/api/auth/signout') {
      session = { enabled: true, user: null }
      return respond(200, { user: null })
    }
    const next = replies[url]?.shift() ?? { status: 500, body: { error: 'unknown' } }
    if (url === '/api/auth/verify' && next.status === 200) session = { enabled: true, user: { email: 'a@b.fr' } }
    return respond(next.status, next.body ?? {})
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => jest.useRealTimers())

function renderSignIn() {
  return render(
    <SessionProvider>
      <AccountLink />
      <SignInClient />
    </SessionProvider>
  )
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>, email = 'a@b.fr') {
  await user.type(await screen.findByLabelText('Adresse e-mail'), email)
  await user.click(screen.getByRole('button', { name: 'Recevoir un code' }))
}

describe('sign-in flow', () => {
  it('signs in with an emailed code, then signs out', async () => {
    const user = userEvent.setup()
    reply('/api/auth/code', { status: 200, body: { sent: true } })
    reply('/api/auth/verify', { status: 200, body: { user: { email: 'a@b.fr' } } })
    renderSignIn()

    expect(await screen.findByRole('link', { name: /Se connecter/ })).toHaveAttribute('href', '/connexion')
    await submitEmail(user)

    await user.type(await screen.findByLabelText('Code de connexion'), '123456')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByText('Vous êtes connecté·e')).toBeInTheDocument()
    expect(screen.getByText('a@b.fr')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mon compte/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Se connecter/ })).toBeInTheDocument()

    const verifyCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/verify')
    expect(JSON.parse(verifyCall?.[1].body)).toEqual({ email: 'a@b.fr', code: '123456' })
    // Same-origin only: the browser never calls Supabase or the API directly.
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('/api/auth/'))).toBe(true)
  })

  it('offers no password field', async () => {
    const { container } = renderSignIn()
    await screen.findByLabelText('Adresse e-mail')
    expect(container.querySelector('input[type="password"]')).toBeNull()
  })

  it('says a wrong or expired code in French, and keeps the visitor on the code screen', async () => {
    const user = userEvent.setup()
    reply('/api/auth/code', { status: 200, body: { sent: true } })
    reply('/api/auth/verify', { status: 400, body: { error: 'invalid_code' } })
    renderSignIn()
    await submitEmail(user)
    await user.type(await screen.findByLabelText('Code de connexion'), '000000')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(AUTH_ERROR_MESSAGES.invalid_code)
    expect(screen.getByLabelText('Code de connexion')).toBeInTheDocument()
  })

  it('says a rate-limited request in French and never shows the raw body', async () => {
    const user = userEvent.setup()
    reply('/api/auth/code', {
      status: 429,
      body: { error: 'rate_limited', retryAfter: 30, message: 'For security purposes…' },
    })
    renderSignIn()
    await submitEmail(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(AUTH_ERROR_MESSAGES.rate_limited)
    expect(screen.queryByText(/security purposes/)).toBeNull()
    expect(screen.getByRole('button', { name: /Patientez \(30 s\)/ })).toBeDisabled()
  })

  it('holds the resend button for the cooldown, then allows another code', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    reply('/api/auth/code', { status: 200, body: { sent: true } })
    reply('/api/auth/code', { status: 200, body: { sent: true } })
    renderSignIn()
    await submitEmail(user)

    const resend = await screen.findByRole('button', { name: /Renvoyer un code \(\d+ s\)/ })
    expect(resend).toBeDisabled()

    await act(async () => {
      jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000)
    })
    const ready = screen.getByRole('button', { name: 'Renvoyer un code' })
    expect(ready).toBeEnabled()
    await user.click(ready)
    expect(await screen.findByRole('status')).toHaveTextContent('Un nouveau code vient de vous être envoyé.')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/code')).toHaveLength(2)
  })

  it('rejects an obviously invalid address without a request', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await submitEmail(user, 'pas-une-adresse')
    expect(await screen.findByRole('alert')).toHaveTextContent(AUTH_ERROR_MESSAGES.invalid_email)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/code')).toBe(false)
  })
})

describe('SessionProvider', () => {
  it('shows no sign-in entry where accounts are not configured', async () => {
    session = { enabled: false, user: null }
    renderSignIn()
    expect(await screen.findByText('Connexion indisponible')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Se connecter|Mon compte/ })).toBeNull()
  })

  it('reads the session once for every consumer', async () => {
    renderSignIn()
    await screen.findByLabelText('Adresse e-mail')
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/session')).toHaveLength(1)
    )
  })
})
