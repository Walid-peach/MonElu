/**
 * @jest-environment node
 */
import { GET } from '@/app/api/portraits/[id]/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = new Request('http://localhost/api/portraits/1')

const imageResponse = (body = 'jpeg-bytes') =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(body.length),
      // Forwarded so the CDN can revalidate with a 304 instead of re-transferring.
      etag: '"abc"',
      'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
    },
  })

describe('GET /api/portraits/[id]', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('proxies the AN portrait and caches it at the edge', async () => {
    fetchMock.mockResolvedValue(imageResponse())

    const res = await GET(req, params('718942.jpg'))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/718942.jpg',
      expect.anything(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800')
    expect(res.headers.get('etag')).toBe('"abc"')
    expect(res.headers.get('last-modified')).toBe('Wed, 21 Oct 2026 07:28:00 GMT')
    await expect(res.text()).resolves.toBe('jpeg-bytes')
  })

  it('rejects non-numeric ids without touching the upstream', async () => {
    for (const id of ['..%2F..%2Fetc', 'PA718942.jpg', '718942.png', '']) {
      const res = await GET(req, params(id))
      expect(res.status).toBe(404)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the upstream answers with an HTML error page', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } }))

    const res = await GET(req, params('999999.jpg'))

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toContain('max-age=300')
  })

  it('returns 404 when the upstream 404s', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(GET(req, params('999999.jpg')).then(r => r.status)).resolves.toBe(404)
  })

  it('forwards the caller validators upstream and passes a 304 straight back', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }))

    const conditional = new Request('http://localhost/api/portraits/718942.jpg', {
      headers: { 'if-none-match': '"abc"', 'if-modified-since': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    })
    const res = await GET(conditional, params('718942.jpg'))

    const sent = fetchMock.mock.calls[0][1].headers as Headers
    expect(sent.get('if-none-match')).toBe('"abc"')
    expect(sent.get('if-modified-since')).toBe('Wed, 21 Oct 2026 07:28:00 GMT')
    expect(res.status).toBe(304)
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800')
  })

  it('releases the upstream body when it rejects the response', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined)
    const body = { cancel } as unknown as ReadableStream
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      body,
      headers: new Headers({ 'content-type': 'text/html' }),
    })

    const res = await GET(req, params('999999.jpg'))

    expect(res.status).toBe(404)
    expect(cancel).toHaveBeenCalled()
  })

  it('returns an uncached 502 when the upstream times out', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'))

    const res = await GET(req, params('718942.jpg'))

    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
