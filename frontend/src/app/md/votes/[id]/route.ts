import { api, nullIfMissing } from '@/lib/api'
import { buildVoteMarkdown } from '@/lib/markdown'

/**
 * Backs the public `/votes/{id}.md` URL - see `md/deputes/[id]/route.ts` for
 * why this is an explicit rewrite rather than `Accept` negotiation (MON-271).
 */
export const dynamicParams = true
export const revalidate = 86400

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const vote = await api.votes.get(id).catch(nullIfMissing)
  if (!vote) return new Response('Not found', { status: 404 })

  return new Response(buildVoteMarkdown(vote), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
