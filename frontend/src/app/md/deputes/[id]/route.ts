import { api, nullIfMissing } from '@/lib/api'
import { buildDeputyMarkdown } from '@/lib/markdown'

/**
 * Backs the public `/deputes/{id}.md` URL - `next.config.mjs` rewrites that
 * literal path here rather than negotiating on `Accept` (MON-271), so there is
 * no `Vary` risk on a heavily ISR-cached site.
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
    },
  })
}
