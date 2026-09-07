import { buildMethodologieMarkdown } from '@/lib/markdown'
import { canonicalUrl } from '@/lib/site'

/**
 * Backs the public `/methodologie.md` URL (MON-271) - the calculation
 * definitions are static repo content, so this is `force-static` unlike the
 * per-entity twins. Carries the same `Link: rel="canonical"` back to the HTML
 * page as the other twins; see `md/deputes/[id]/route.ts` for why.
 */
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  return new Response(buildMethodologieMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      Link: `<${canonicalUrl('/methodologie')}>; rel="canonical"`,
    },
  })
}
