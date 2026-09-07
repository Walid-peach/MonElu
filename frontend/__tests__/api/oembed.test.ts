/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GET } from '@/app/api/oembed/route'
import { ApiError, api } from '@/lib/api'
import { oembedDiscoveryUrl, parseEmbeddableUrl } from '@/lib/oembed'
import { SITE_URL } from '@/lib/site'

const VOTE_ID = 'VTANR5L17V1234'

const vote = {
  vote_id: VOTE_ID,
  vote_title: 'Proposition de loi "sécurité" & <libertés>',
  result: 'adopté',
  voted_at: '2026-03-04',
  votes_for: 200,
  votes_against: 100,
  abstentions: 10,
  total_voters: 310,
}

const request = (query: string) => new Request(`https://mon-elu.vercel.app/api/oembed?${query}`)
const forVote = (id = VOTE_ID) => `url=${encodeURIComponent(`${SITE_URL}/votes/${id}`)}`

describe('GET /api/oembed', () => {
  const get = jest.spyOn(api.votes, 'get')

  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue(vote as never)
  })

  it('returns a standard rich payload whose html embeds the widget', async () => {
    const res = await GET(request(forVote()))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body).toMatchObject({
      version: '1.0',
      type: 'rich',
      provider_name: 'MonÉlu',
      provider_url: SITE_URL,
      title: vote.vote_title,
      author_name: 'Assemblée nationale',
      width: 560,
      height: 220,
    })
    expect(body.html).toContain(`src="${SITE_URL}/embed/votes/${VOTE_ID}"`)
    expect(body.html).toContain('width="560"')
  })

  // The title is the one caller-influenced value that lands inside an HTML
  // attribute, and consumers inject `html` into their own page verbatim.
  it('escapes the vote title inside the iframe title attribute', async () => {
    const body = await (await GET(request(forVote()))).json()
    expect(body.html).toContain('title="Proposition de loi &quot;sécurité&quot; &amp; &lt;libertés&gt;"')
  })

  it('honours maxwidth and maxheight, clamped to a usable box', async () => {
    const wide = await (await GET(request(`${forVote()}&maxwidth=400&maxheight=180`))).json()
    expect(wide).toMatchObject({ width: 400, height: 180 })
    expect(wide.html).toContain('width="400"')

    // Never larger than the widget's own layout, never unreadably small.
    const silly = await (await GET(request(`${forVote()}&maxwidth=9000&maxheight=10`))).json()
    expect(silly).toMatchObject({ width: 560, height: 160 })

    const junk = await (await GET(request(`${forVote()}&maxwidth=abc`))).json()
    expect(junk.width).toBe(560)
  })

  it('caches hits at the edge', async () => {
    const res = await GET(request(forVote()))
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  // Server-side unfurlers do not need this, but browser-side oEmbed libraries
  // and CMS preview panes fetch the endpoint from the page. The payload is
  // public data behind a credential-less GET.
  it('is readable cross-origin, on success and on rejection alike', async () => {
    expect((await GET(request(forVote()))).headers.get('access-control-allow-origin')).toBe('*')
    expect((await GET(request('url=nope'))).headers.get('access-control-allow-origin')).toBe('*')
  })

  it.each([
    ['a foreign origin', `url=${encodeURIComponent('https://evil.example/votes/' + VOTE_ID)}`],
    ['an unsupported path', `url=${encodeURIComponent(`${SITE_URL}/deputes/PA1`)}`],
    ['an id outside the allowlisted shape', `url=${encodeURIComponent(`${SITE_URL}/votes/../../etc/passwd`)}`],
    ['a non-URL', 'url=not-a-url'],
    ['no url at all', ''],
  ])('404s on %s without touching the API', async (_label, query) => {
    const res = await GET(request(query))
    expect(res.status).toBe(404)
    expect(get).not.toHaveBeenCalled()
  })

  // An unknown vote can become known at the next ingestion, unlike a URL shape
  // this provider does not support - so it must not inherit the day-long
  // rejection TTL, or the edge keeps serving a stale 404 for a real scrutin.
  it('404s on a vote the API does not know, without caching it for a day', async () => {
    get.mockRejectedValue(new ApiError(404, '/votes/x/'))
    const unknownVote = await GET(request(forVote()))
    expect(unknownVote.status).toBe(404)
    expect(unknownVote.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300')

    const unsupportedShape = await GET(request(`url=${encodeURIComponent(`${SITE_URL}/deputes/PA1`)}`))
    expect(unsupportedShape.headers.get('cache-control')).toContain('s-maxage=86400')
  })

  // A rate limit or a 5xx is our failure, not a permanent "not embeddable" -
  // caching it would freeze the widget out of every consumer for a day.
  it('502s and refuses to cache when the API is unavailable', async () => {
    get.mockRejectedValue(new ApiError(500, '/votes/x/'))
    const res = await GET(request(forVote()))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('501s on a format it does not emit, whatever the case', async () => {
    expect((await GET(request(`${forVote()}&format=xml`))).status).toBe(501)
    expect((await GET(request(`${forVote()}&format=XML`))).status).toBe(501)
    expect((await GET(request(`${forVote()}&format=JSON`))).status).toBe(200)
  })
})

describe('oEmbed URL helpers', () => {
  it('accepts the request origin as well as SITE_URL, for previews and localhost', () => {
    expect(parseEmbeddableUrl(`http://localhost:3000/votes/${VOTE_ID}`, 'http://localhost:3000')).toMatchObject({
      kind: 'vote',
      id: VOTE_ID,
      embedPath: `/embed/votes/${VOTE_ID}`,
    })
    expect(parseEmbeddableUrl(`http://localhost:3000/votes/${VOTE_ID}`)).toBeNull()
  })

  // The discovery link is the whole mechanism: without it no consumer ever
  // calls the endpoint. It must round-trip through the parser.
  it('builds a discovery URL the endpoint itself accepts', () => {
    const href = oembedDiscoveryUrl(`/votes/${VOTE_ID}`)
    expect(href.startsWith(`${SITE_URL}/api/oembed?url=`)).toBe(true)
    const url = new URL(href)
    expect(url.searchParams.get('format')).toBe('json')
    expect(parseEmbeddableUrl(url.searchParams.get('url'))).toMatchObject({ id: VOTE_ID })
  })
})

describe('oEmbed discovery link', () => {
  // Asserted against the source rather than by rendering the page: the check
  // that matters is that the tag is declared at all, and `page.tsx` pulls in
  // the whole client tree. Same discipline as canonical.test.ts (MON-269).
  it('is declared on the vote detail page', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'app', 'votes', '[id]', 'page.tsx'),
      'utf8',
    )
    expect(source).toContain("'application/json+oembed': oembedDiscoveryUrl(")
  })
})
