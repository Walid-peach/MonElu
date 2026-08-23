/**
 * @jest-environment node
 */
import { GET } from '@/app/api/portraits/[id]/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = new Request('http://localhost/api/portraits/1')

const imageResponse = (body = 'jpeg-bytes') =>
  new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) } })

describe('GET /api/portraits/[id]', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('proxies the AN portrait and caches it at the edge', async () => {
    fetchMock.mockResolvedValue(imageResponse())

    const res = await GET(req, params('718942'))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/718942.jpg',
      expect.anything(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800')
    await expect(res.text()).resolves.toBe('jpeg-bytes')
  })

  it('rejects non-numeric ids without touching the upstream', async () => {
    for (const id of ['..%2F..%2Fetc', 'PA718942', '']) {
      const res = await GET(req, params(id))
      expect(res.status).toBe(404)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the upstream answers with an HTML error page', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } }))

    const res = await GET(req, params('999999'))

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toContain('max-age=300')
  })

  it('returns 404 when the upstream 404s', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(GET(req, params('999999')).then(r => r.status)).resolves.toBe(404)
  })

  it('returns an uncached 502 when the upstream times out', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'))

    const res = await GET(req, params('718942'))

    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
