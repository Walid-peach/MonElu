import { GEOCODER_URL, searchAddresses } from '@/lib/address'

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => jest.restoreAllMocks())

describe('searchAddresses', () => {
  it('asks only the national geocoder, and returns label, context and the point', async () => {
    mockFetch(200, {
      features: [
        {
          geometry: { type: 'Point', coordinates: [2.290084, 49.897442] },
          properties: { label: '8 Boulevard du Port 80000 Amiens', context: '80, Somme, Hauts-de-France', type: 'housenumber' },
        },
      ],
    })
    const found = await searchAddresses('8 bd du port amiens')
    expect(found).toEqual([
      { label: '8 Boulevard du Port 80000 Amiens', context: '80, Somme, Hauts-de-France', lat: 49.897442, lon: 2.290084 },
    ])
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url.startsWith(`${GEOCODER_URL}?`)).toBe(true)
    expect(GEOCODER_URL).toBe('https://data.geopf.fr/geocodage/search')
    expect(new URL(url).searchParams.get('q')).toBe('8 bd du port amiens')
    // More are asked for than are shown, since streets and towns are dropped.
    expect(new URL(url).searchParams.get('limit')).toBe('15')
  })

  it('does not call the geocoder for fewer than three characters', async () => {
    global.fetch = jest.fn()
    expect(await searchAddresses(' 8 ')).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('drops features without a point or a label', async () => {
    mockFetch(200, {
      features: [
        { geometry: { type: 'Point' }, properties: { label: 'No coordinates', type: 'housenumber' } },
        { geometry: { type: 'Point', coordinates: [2, 48] }, properties: { type: 'housenumber' } },
      ],
    })
    expect(await searchAddresses('rue de la paix')).toEqual([])
  })

  it('keeps only house numbers and lieux-dits: a street or a town is not where someone lives', async () => {
    mockFetch(200, {
      features: [
        { geometry: { type: 'Point', coordinates: [2.29, 49.89] }, properties: { label: 'Boulevard du Port 80000 Amiens', type: 'street' } },
        { geometry: { type: 'Point', coordinates: [2.3, 49.89] }, properties: { label: 'Amiens', type: 'municipality' } },
        { geometry: { type: 'Point', coordinates: [5.1, 45.2] }, properties: { label: 'Le Bourg 38000 X', type: 'locality' } },
      ],
    })
    expect((await searchAddresses('amiens')).map(s => s.label)).toEqual(['Le Bourg 38000 X'])
  })

  it('throws on an HTTP error so the caller can say suggestions are unavailable', async () => {
    mockFetch(503, {})
    await expect(searchAddresses('rue de la paix')).rejects.toThrow('503')
  })
})
