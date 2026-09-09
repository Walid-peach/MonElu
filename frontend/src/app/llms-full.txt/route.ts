import { buildLlmsFullTxt } from '@/lib/llms'

/**
 * `/llms-full.txt` (MON-261) - `/llms.txt` with the calculation definitions
 * from `/methodologie` inlined, so a model gets the formulas behind presence,
 * alignment and the pour/contre percentages without a second fetch.
 */
export const dynamic = 'force-static'
export const revalidate = 86400

export function GET(): Response {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
