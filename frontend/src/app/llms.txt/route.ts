import { buildLlmsTxt } from '@/lib/llms'

/**
 * `/llms.txt` (MON-261) - the orientation an LLM crawler gets before it reads
 * any page. A route handler rather than a file in `public/` so every absolute
 * URL in it derives from `SITE_URL`, and so the group/theme index cannot drift
 * from the maps the rest of the site routes off.
 */
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
