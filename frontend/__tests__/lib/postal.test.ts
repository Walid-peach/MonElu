import {
  resolvePostalCodeToDepartment,
  resolvePostalCodeToDepartments,
  resolvePostalCodeToNames,
} from '@/lib/postal'

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

describe('resolvePostalCodeToNames', () => {
  it('resolves a valid postal code to its department name', async () => {
    mockFetch(200, [{ departement: { code: '75', nom: 'Paris' } }])
    const result = await resolvePostalCodeToNames('75001')
    expect(result).toEqual(['Paris'])
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('codePostal=75001')
    )
  })

  it('returns nothing for non-postal-code input without calling fetch', async () => {
    global.fetch = jest.fn()
    const result = await resolvePostalCodeToNames('Marine Le Pen')
    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns nothing when the API responds with no communes', async () => {
    mockFetch(200, [])
    const result = await resolvePostalCodeToNames('00000')
    expect(result).toEqual([])
  })

  it('returns nothing on a non-ok HTTP response', async () => {
    mockFetch(500, {})
    const result = await resolvePostalCodeToNames('75001')
    expect(result).toEqual([])
  })

  it('returns nothing when the fetch itself throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'))
    const result = await resolvePostalCodeToNames('75001')
    expect(result).toEqual([])
  })
})

describe('resolvePostalCodeToDepartment', () => {
  it('resolves a valid postal code to its department code and name', async () => {
    mockFetch(200, [{ departement: { code: '33', nom: 'Gironde' } }])
    const result = await resolvePostalCodeToDepartment('33000')
    expect(result).toEqual({ code: '33', nom: 'Gironde' })
  })

  it('returns null when the departement field is missing', async () => {
    mockFetch(200, [{}])
    const result = await resolvePostalCodeToDepartment('33000')
    expect(result).toBeNull()
  })

  it('returns null for non-postal-code input without calling fetch', async () => {
    global.fetch = jest.fn()
    const result = await resolvePostalCodeToDepartment('Gironde')
    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('resolvePostalCodeToDepartments', () => {
  it('returns every department a postal code covers, once each, in order', async () => {
    mockFetch(200, [
      { departement: { code: '33', nom: 'Gironde' } },
      { departement: { code: '24', nom: 'Dordogne' } },
      { departement: { code: '33', nom: 'Gironde' } },
    ])
    expect(await resolvePostalCodeToDepartments('33220')).toEqual([
      { code: '33', nom: 'Gironde' },
      { code: '24', nom: 'Dordogne' },
    ])
  })

  it('gives no single department for a postal code that covers several', async () => {
    mockFetch(200, [
      { departement: { code: '33', nom: 'Gironde' } },
      { departement: { code: '24', nom: 'Dordogne' } },
    ])
    expect(await resolvePostalCodeToDepartment('33220')).toBeNull()
  })
})
