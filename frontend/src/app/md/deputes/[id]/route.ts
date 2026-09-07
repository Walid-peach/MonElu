import { api, nullIfMissing } from '@/lib/api'
import { buildDeputyMarkdown } from '@/lib/markdown'
import { canonicalUrl } from '@/lib/site'

/**
 * Backs the public `/deputes/{id}.md` URL - `next.config.mjs` rewrites that
 * literal path here rather than negotiating on `Accept` (MON-271), so there is
 * no `Vary` risk on a heavily ISR-cached site.
 *
 * The twin is one extra crawlable URL per deputy carrying the same content as
 * a page we actively SEO-tune, so it ships a `Link: rel="canonical"` header
 * pointing back at the HTML page - the documented mechanism for a non-HTML
 * duplicate, and the one that consolidates ranking onto the original rather
 * than merely suppressing the copy. It does not restrict AI crawlers, which
 * gate on robots.txt rather than on indexing directives.
 */
export const dynamicParams = true
export const revalidate = 86400

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const deputy = await api.deputies.get(id).catch(nullIfMissing)
  if (!deputy) return new Response('Not found', { status: 404 })

  const [scorecard, alignment, votes] = await Promise.all([
    api.deputies.scorecard(id).catch(() => null),
    api.deputies.alignment(id).catch(() => null),
    api.deputies.votes(id, 10).catch(() => null),
  ])

  const body = buildDeputyMarkdown({
    deputy,
    scorecard,
    alignment,
    recentVotes: votes?.items ?? [],
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      Link: `<${canonicalUrl(`/deputes/${id}`)}>; rel="canonical"`,
    },
  })
}
