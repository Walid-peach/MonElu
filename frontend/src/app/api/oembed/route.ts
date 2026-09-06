import { api, ApiError } from '@/lib/api'
import { SITE_URL } from '@/lib/site'
import {
  OEMBED_PROVIDER_NAME,
  clampHeight,
  clampWidth,
  oembedIframe,
  parseEmbeddableUrl,
} from '@/lib/oembed'

/**
 * oEmbed provider endpoint (MON-266).
 *
 * `GET /api/oembed?url=<page url>&format=json&maxwidth=&maxheight=` returns the
 * standard `rich` payload whose `html` is the `/embed/votes/<id>` iframe. This
 * is what turns a MonÉlu link pasted into Notion, Slack, Substack, Ghost,
 * WordPress or Discourse into the live vote widget instead of a blue link -
 * the widget already existed, only the discovery contract was missing.
 *
 * Status codes follow the oEmbed spec: 404 when this provider has no
 * representation for the URL (wrong origin, unsupported path, unknown vote),
 * 501 for a format we do not implement.
 */
export const runtime = 'nodejs'

/** The payload only changes when the vote title changes, i.e. essentially
 * never after ingestion. Cached hard at the edge so a viral link costs one
 * function invocation, with a short browser TTL so a correction still lands. */
const CACHE_HIT = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400'
/** An unsupported URL is a permanent answer for this deploy - nothing about it
 * becomes embeddable without a redeploy - so absorb repeats at the edge. */
const CACHE_REJECT = 'public, max-age=3600, s-maxage=86400'

function error(status: number, message: string, cache = CACHE_REJECT) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cache },
  })
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams

  // XML is the other format the spec defines. We do not emit it; the spec's
  // answer for that is 501, not a JSON body the consumer did not ask for.
  const format = params.get('format')
  if (format !== null && format !== 'json') return error(501, 'Not Implemented')

  const resource = parseEmbeddableUrl(params.get('url'), new URL(req.url).origin)
  if (!resource) return error(404, 'Not Found')

  let vote
  try {
    vote = await api.votes.get(resource.id)
  } catch (err) {
    // A vote that does not exist is a URL this provider has no representation
    // for. Anything else - rate limit, 5xx, network - is our failure, and must
    // not be cached as a permanent "not embeddable".
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) {
      return error(404, 'Not Found')
    }
    return error(502, 'Bad Gateway', 'no-store')
  }

  const width = clampWidth(params.get('maxwidth'))
  const height = clampHeight(params.get('maxheight'))

  return Response.json(
    {
      version: '1.0',
      type: 'rich',
      provider_name: OEMBED_PROVIDER_NAME,
      provider_url: SITE_URL,
      title: vote.vote_title,
      author_name: 'Assemblée nationale',
      author_url: 'https://www.assemblee-nationale.fr',
      cache_age: 86400,
      width,
      height,
      html: oembedIframe(resource, vote.vote_title, width, height),
    },
    { headers: { 'Cache-Control': CACHE_HIT } },
  )
}
