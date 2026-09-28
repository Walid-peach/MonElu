/**
 * @jest-environment node
 */
import { AUTH_ERROR_MESSAGES } from '@/lib/auth'

/**
 * The sign-in and account route handlers (#415, ADR-040), against a fake
 * Supabase client and a fake Next cookie store. What matters here is what
 * crosses to the browser: an error code rather than a Supabase body, cookies
 * written httpOnly, no token in any response, and `private, no-store` on all
 * of it.
 */

type Cookie = { name: string; value: string; options?: Record<string, unknown> }

const jar = new Map<string, Cookie>()
const store = {
  getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
  set: jest.fn((name: string, value: string, options?: Record<string, unknown>) => {
    jar.set(name, { name, value, options })
  }),
}
jest.mock('next/headers', () => ({ cookies: async () => store }))

const auth = {
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signOut: jest.fn(),
  getClaims: jest.fn(),
  getSession: jest.fn(),
}
let cookieMethods: { setAll: (c: Array<{ name: string; value: string; options: object }>) => void }
jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof cookieMethods }) => {
    cookieMethods = options.cookies
    return { auth }
  },
}))

const fetchMock = jest.fn()

const ORIGIN = 'http://localhost'
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const TOKEN = 'header.payload.signature' // pragma: allowlist secret
const SESSION = { access_token: TOKEN, refresh_token: 'refresh' } // pragma: allowlist secret

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test' // pragma: allowlist secret
  jar.clear()
  jest.clearAllMocks()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

async function expectNoStore(res: Response) {
  expect(res.headers.get('cache-control')).toBe('private, no-store')
}

describe('POST /api/auth/code', () => {
  const load = () => import('@/app/api/auth/code/route')

  it('asks Supabase for a code and answers without detail', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: '  Camille@Example.fr ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: true })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'camille@example.fr',
      options: { shouldCreateUser: true },
    })
    await expectNoStore(res)
  })

  it('rejects an implausible address before calling Supabase', async () => {
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_email' })
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('reduces a Supabase rate limit to a code plus the real remaining wait', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this after 42 seconds.',
      },
    })
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: 'a@b.fr' }))
    expect(res.status).toBe(429)
    // The Supabase sentence itself never reaches the browser.
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfter: 42 })
  })

  it('answers 503 while Supabase is not configured', async () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: 'a@b.fr' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('reads the default sender refusing outside addresses as unavailable (#419 not done)', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 400, code: 'email_address_not_authorized', message: 'Email address not authorized' },
    })
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: 'a@b.fr' }))
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('refuses a request a browser marks as cross-site, even without Origin', async () => {
    const { POST } = await load()
    const req = new Request(`${ORIGIN}/api/auth/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ email: 'a@b.fr' }),
    })
    expect((await POST(req)).status).toBe(403)
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('ignores a body not sent as application/json', async () => {
    const { POST } = await load()
    const req = new Request(`${ORIGIN}/api/auth/code`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: ORIGIN },
      body: JSON.stringify({ email: 'a@b.fr' }),
    })
    expect((await POST(req)).status).toBe(400)
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const { POST } = await load()
    const res = await POST(post('/api/auth/code', { email: 'a@b.fr' }, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/verify', () => {
  const load = () => import('@/app/api/auth/verify/route')

  it('signs in, writes an httpOnly cookie, creates the profile, and returns no token', async () => {
    jar.set('sb-project-auth-token-code-verifier', { name: 'sb-project-auth-token-code-verifier', value: 'v' })
    auth.verifyOtp.mockImplementation(async () => {
      cookieMethods.setAll([
        { name: 'sb-project-auth-token', value: 'base64-session', options: { path: '/', maxAge: 400 * 86400 } },
      ])
      return { data: { session: SESSION, user: { email: 'a@b.fr' } }, error: null }
    })
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }))

    const { POST } = await load()
    const res = await POST(post('/api/auth/verify', { email: 'a@b.fr', code: '123 456' }))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ user: { email: 'a@b.fr' } })
    expect(text).not.toContain(TOKEN)
    await expectNoStore(res)
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.fr', token: '123456', type: 'email' })

    const cookie = jar.get('sb-project-auth-token')
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    // Capped at 13 months, which is what /confidentialite states.
    expect(cookie?.options?.maxAge).toBe(395 * 86400)
    // The PKCE verifier the code request left behind is useless to the email-code flow.
    expect(jar.get('sb-project-auth-token-code-verifier')).toMatchObject({ value: '', options: { maxAge: 0 } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/account\/me$/)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(init.cache).toBe('no-store')
  })

  it('still signs in when profile creation fails', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: SESSION, user: { email: 'a@b.fr' } }, error: null })
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await load()
    const res = await POST(post('/api/auth/verify', { email: 'a@b.fr', code: '123456' }))
    expect(res.status).toBe(200)
    // The error class only - never the token.
    expect(spy.mock.calls.flat().join(' ')).not.toContain(TOKEN)
    spy.mockRestore()
  })

  it('answers a wrong or expired code with invalid_code', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' },
    })
    const { POST } = await load()
    const res = await POST(post('/api/auth/verify', { email: 'a@b.fr', code: '000000' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed code without calling Supabase', async () => {
    const { POST } = await load()
    const res = await POST(post('/api/auth/verify', { email: 'a@b.fr', code: '12ab' }))
    expect(await res.json()).toEqual({ error: 'invalid_code' })
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('reduces a verify rate limit to rate_limited', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' },
    })
    const { POST } = await load()
    const res = await POST(post('/api/auth/verify', { email: 'a@b.fr', code: '123456' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  })
})

describe('POST /api/auth/signout', () => {
  it('clears every Supabase cookie even when Supabase fails', async () => {
    jar.set('sb-project-auth-token.0', { name: 'sb-project-auth-token.0', value: 'x' })
    jar.set('sb-project-auth-token.1', { name: 'sb-project-auth-token.1', value: 'y' })
    jar.set('unrelated', { name: 'unrelated', value: 'keep' })
    auth.signOut.mockRejectedValue(new Error('network'))

    const { POST } = await import('@/app/api/auth/signout/route')
    const res = await POST(post('/api/auth/signout'))

    expect(res.status).toBe(200)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    for (const name of ['sb-project-auth-token.0', 'sb-project-auth-token.1']) {
      expect(jar.get(name)).toMatchObject({ value: '', options: { maxAge: 0, httpOnly: true } })
    }
    expect(jar.get('unrelated')?.value).toBe('keep')
    await expectNoStore(res)
  })
})

describe('GET /api/auth/session', () => {
  const load = () => import('@/app/api/auth/session/route')

  it('reports accounts disabled while Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL
    const { GET } = await load()
    const res = await GET()
    expect(await res.json()).toEqual({ enabled: false, user: null })
    await expectNoStore(res)
  })

  it('returns the verified email and nothing else', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@b.fr' } }, error: null })
    const { GET } = await load()
    const res = await GET()
    expect(await res.json()).toEqual({ enabled: true, user: { email: 'a@b.fr' } })
  })

  it('reads a token that fails verification as signed out', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { code: 'bad_jwt' } })
    const { GET } = await load()
    expect(await (await GET()).json()).toEqual({ enabled: true, user: null })
  })
})

describe('/api/account/[...path]', () => {
  const load = () => import('@/app/api/account/[...path]/route')
  const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) })

  it('forwards the session token as a bearer and relays the answer uncached', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    fetchMock.mockResolvedValue(
      new Response('{"id":"p1"}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'upstream=1' },
      })
    )
    const { GET } = await load()
    const res = await GET(new Request(`${ORIGIN}/api/account/me`), ctx('me'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'p1' })
    await expectNoStore(res)
    expect(res.headers.get('set-cookie')).toBeNull()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/account\/me$/)
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('forwards method and body on a write', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { PUT } = await load()
    const req = new Request(`${ORIGIN}/api/account/follows/deputies/PA1`, {
      method: 'PUT',
      headers: { origin: ORIGIN },
    })
    const res = await PUT(req, ctx('follows', 'deputies', 'PA1'))
    expect(res.status).toBe(204)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/account\/follows\/deputies\/PA1$/)
    expect(init.method).toBe('PUT')
  })

  it('answers signed_out without calling the API when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    const { GET } = await load()
    const res = await GET(new Request(`${ORIGIN}/api/account/me`), ctx('me'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([[['..']], [['me', '..', 'health']], [['me%2F..']], [[] as string[]]])(
    'refuses the path %j before any I/O',
    async (path: string[]) => {
      const { GET } = await load()
      const res = await GET(new Request(`${ORIGIN}/api/account/x`), ctx(...path))
      expect(res.status).toBe(404)
      expect(auth.getSession).not.toHaveBeenCalled()
    }
  )

  it('replaces an API 5xx body with its own code', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    fetchMock.mockResolvedValue(new Response('Traceback: psycopg2...', { status: 500 }))
    const { GET } = await load()
    const res = await GET(new Request(`${ORIGIN}/api/account/me`), ctx('me'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('maps an API 401 to signed_out', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    fetchMock.mockResolvedValue(new Response('{"detail":"Account not found"}', { status: 401 }))
    const { GET } = await load()
    const res = await GET(new Request(`${ORIGIN}/api/account/me`), ctx('me'))
    expect(await res.json()).toEqual({ error: 'signed_out' })
  })

  it('refuses a cross-origin write', async () => {
    const { DELETE } = await load()
    const req = new Request(`${ORIGIN}/api/account/me`, {
      method: 'DELETE',
      headers: { origin: 'https://evil.example' },
    })
    const res = await DELETE(req, ctx('me'))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('error messages', () => {
  it('has a French sentence for every code, none of them raw', () => {
    for (const message of Object.values(AUTH_ERROR_MESSAGES)) {
      expect(message).toMatch(/^[A-ZÀ-Ý]/)
      expect(message).not.toMatch(/error|token|supabase/i)
    }
  })
})
