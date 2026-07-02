import { resolvePostalCode } from '@/lib/postal'

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

describe('resolvePostalCode', () => {
  it('resolves a valid postal code to its department name', async () => {
    mockFetch(200, [{ departement: { code: '75', nom: 'Paris' } }])
    const result = await resolvePostalCode('75001')
    expect(result).toBe('Paris')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('codePostal=75001')
    )
  })

  it('returns null for non-postal-code input without calling fetch', async () => {
    global.fetch = jest.fn()
    const result = await resolvePostalCode('Marine Le Pen')
    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns null when the API responds with no communes', async () => {
    mockFetch(200, [])
    const result = await resolvePostalCode('00000')
    expect(result).toBeNull()
  })

  it('returns null on a non-ok HTTP response', async () => {
    mockFetch(500, {})
    const result = await resolvePostalCode('75001')
    expect(result).toBeNull()
  })

  it('returns null when the fetch itself throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'))
    const result = await resolvePostalCode('75001')
    expect(result).toBeNull()
  })
})
