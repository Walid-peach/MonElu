// Tests for the api client — focused on error handling fixes from PR review.
// fetch is patched globally by jest-environment-jsdom; we override it per-test.

import { HEALTH_REVALIDATE_SECONDS, HEALTH_TAG } from '@/lib/cacheTags'

const API_BASE = 'https://monelu-production.up.railway.app'

// Re-import after setting up env so NEXT_PUBLIC_API_URL falls back to the Railway base.
let api: typeof import('@/lib/api').api
let ApiError: typeof import('@/lib/api').ApiError
let nullIfMissing: typeof import('@/lib/api').nullIfMissing

beforeAll(async () => {
  ;({ api, ApiError, nullIfMissing } = await import('@/lib/api'))
})

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('api.search', () => {
  it('returns parsed JSON on a 200 response', async () => {
    const payload = {
      answer: 'Réponse de test',
      question: 'question',
      chunks_retrieved: 3,
      confidence: 'high',
      data_source: 'rag',
      sources: [],
    }
    mockFetch(200, payload)
    const result = await api.search('question')
    expect(result.answer).toBe('Réponse de test')
    expect(result.confidence).toBe('high')
  })

  it('throws on a non-ok HTTP response (e.g. 500)', async () => {
    mockFetch(500, { detail: 'Internal Server Error' })
    await expect(api.search('question')).rejects.toThrow('API error: 500')
  })

  it('throws on a 422 validation error', async () => {
    mockFetch(422, { detail: 'Unprocessable Entity' })
    await expect(api.search('question')).rejects.toThrow('API error: 422')
  })
})

describe('api.feedback.chat', () => {
  it('posts the vote, question, answer, and sources and returns the response', async () => {
    mockFetch(200, { status: 'ok' })
    const result = await api.feedback.chat('up', 'question', 'answer', [])
    expect(result.status).toBe('ok')
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/feedback/chat`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ vote: 'up', question: 'question', answer: 'answer', sources: [] }),
      })
    )
  })

  it('throws on a non-ok HTTP response', async () => {
    mockFetch(500, { detail: 'Internal Server Error' })
    await expect(api.feedback.chat('down', 'q', 'a', [])).rejects.toThrow('API error: 500')
  })
})

describe('api.feedback.report', () => {
  it('posts the error report and returns the response', async () => {
    mockFetch(200, { status: 'ok' })
    const report = {
      entity_type: 'deputy' as const,
      entity_id: 'PA722990',
      entity_label: 'Jean Dupont',
      page_url: '/deputes/PA722990',
      message: 'Le taux de présence semble erroné.',
      email: null,
    }
    const result = await api.feedback.report(report)
    expect(result.status).toBe('ok')
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/feedback/report`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(report),
      })
    )
  })

  it('throws on a non-ok HTTP response', async () => {
    mockFetch(500, { detail: 'Internal Server Error' })
    await expect(
      api.feedback.report({ entity_type: 'page', message: 'Erreur.' })
    ).rejects.toThrow('API error: 500')
  })
})

describe('api.deputies.votes', () => {
  it('omits since from the query string when not provided', async () => {
    mockFetch(200, { deputy_id: 'PA1', total: 0, items: [] })
    await api.deputies.votes('PA1', 10)
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('limit=10')
    expect(url).not.toContain('since=')
  })

  it('includes since in the query string when provided', async () => {
    mockFetch(200, { deputy_id: 'PA1', total: 0, items: [] })
    await api.deputies.votes('PA1', 50, '2026-07-01T00:00:00.000Z')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('since=2026-07-01T00%3A00%3A00.000Z')
  })
})

describe('apiFetch 429 backoff (via api.health)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  function mockResponse(status: number, body: unknown = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response
  }

  it('retries a 429 with backoff and succeeds once the limiter clears', async () => {
    jest.useFakeTimers()
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, { deputies: 577 }))
    const promise = api.health()
    await jest.runAllTimersAsync()
    const result = await promise
    expect(result.deputies).toBe(577)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting 429 retries', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn().mockResolvedValue(mockResponse(429))
    const promise = api.health()
    const assertion = expect(promise).rejects.toThrow('API error: 429')
    await jest.runAllTimersAsync()
    await assertion
    // 1 initial attempt + 2 backoff retries. Jest runs with NEXT_PHASE unset,
    // i.e. the request-time ladder - a visitor must not wait out the build's
    // patient one (MON-275).
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})

describe('apiFetch (via api.health)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('throws on a non-ok response', async () => {
    jest.useFakeTimers()
    mockFetch(503, { detail: 'Service Unavailable' })
    const promise = api.health()
    const assertion = expect(promise).rejects.toThrow('API error: 503')
    await jest.runAllTimersAsync()
    await assertion
  })

  // MON-275: the ladders are phase-split. This is the request-time one - a
  // visitor gets a fast failure and ISR re-renders on the next request, rather
  // than waiting out 47 s of sleeps that Next's fetch dedup turns into no
  // extra network attempts anyway. The build keeps the patient ladder, which
  // this suite cannot exercise without NEXT_PHASE set.
  it('retries a 500 briefly at request time, then gives up', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response)
    const promise = api.health()
    const assertion = expect(promise).rejects.toThrow(ApiError)
    await jest.runAllTimersAsync()
    await assertion
    // 1 initial attempt + 2 backoff retries
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('returns parsed JSON on success', async () => {
    const payload = { deputies: 577, votes: 1200, positions: 715000 }
    mockFetch(200, payload)
    const result = await api.health()
    expect(result.deputies).toBe(577)
  })
})

// MON-275: the detail pages decide `notFound()` from this, so it is the line
// between "no such deputy" (404) and "the API is unwell" (server error). A
// bare `.catch(() => null)` conflated the two, which under ISR meant a
// rate-limited API could get a 404 cached for up to `revalidate` seconds.
describe('nullIfMissing', () => {
  it('swallows a 404 so the caller can render notFound()', () => {
    expect(nullIfMissing(new ApiError(404, '/deputies/NOPE/'))).toBeNull()
  })

  it('swallows a 422 - FastAPI rejects an unparseable path param before the handler', () => {
    // /quiz/s/garbage: the share id is not a UUID, so there is no such page.
    expect(nullIfMissing(new ApiError(422, '/quiz/share/garbage'))).toBeNull()
  })

  it.each([429, 500, 502, 503])('rethrows %i rather than reporting a missing page', (status) => {
    expect(() => nullIfMissing(new ApiError(status, '/votes/X/'))).toThrow(ApiError)
  })

  it('rethrows a non-ApiError, such as a network failure', () => {
    const boom = new TypeError('fetch failed')
    expect(() => nullIfMissing(boom)).toThrow(boom)
  })

  it('carries the status and the path on the error itself', () => {
    const error = new ApiError(503, '/deputies/PA1592/')
    expect(error.status).toBe(503)
    expect(error.message).toContain('/deputies/PA1592/')
  })
})

// GH #354: `FreshnessBadge` renders from the root layout, and Next.js takes the
// lowest `revalidate` across a route and its layouts - so a 300 s health fetch
// made every otherwise-static route regenerate every five minutes and blew past
// the Vercel Hobby ISR write allowance. The badge is refreshed by tag from
// `/api/revalidate` after ingestion instead, with a bounded time fallback.
describe('api.health cache contract', () => {
  it('tags the fetch so /api/revalidate can invalidate it on demand', async () => {
    mockFetch(200, { last_ingestion: '2026-09-04T06:00:00Z' })
    await api.health()
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/health/`,
      expect.objectContaining({
        next: expect.objectContaining({ tags: [HEALTH_TAG] }),
      })
    )
  })

  it('falls back to a bounded interval well above five minutes', async () => {
    mockFetch(200, { last_ingestion: '2026-09-04T06:00:00Z' })
    await api.health()
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit & {
      next: { revalidate: number }
    }
    expect(init.next.revalidate).toBe(HEALTH_REVALIDATE_SECONDS)
    // 6-24 h: long enough that the layout cannot recreate the write volume,
    // short enough that the badge still recovers on its own if the ingestion
    // revalidate call never fires.
    expect(HEALTH_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(6 * 60 * 60)
    expect(HEALTH_REVALIDATE_SECONDS).toBeLessThanOrEqual(24 * 60 * 60)
  })
})
