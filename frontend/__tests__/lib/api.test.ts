// Tests for the api client — focused on error handling fixes from PR review.
// fetch is patched globally by jest-environment-jsdom; we override it per-test.

const API_BASE = 'https://monelu-production.up.railway.app'

// Re-import after setting up env so NEXT_PUBLIC_API_URL falls back to the Railway base.
let api: typeof import('@/lib/api').api

beforeAll(async () => {
  ;({ api } = await import('@/lib/api'))
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
    // 1 initial attempt + 4 backoff retries
    expect(global.fetch).toHaveBeenCalledTimes(5)
  })
})

describe('apiFetch (via api.health)', () => {
  it('throws on a non-ok response', async () => {
    mockFetch(503, { detail: 'Service Unavailable' })
    await expect(api.health()).rejects.toThrow('API error: 503')
  })

  it('returns parsed JSON on success', async () => {
    const payload = { deputies: 577, votes: 1200, positions: 715000 }
    mockFetch(200, payload)
    const result = await api.health()
    expect(result.deputies).toBe(577)
  })
})
