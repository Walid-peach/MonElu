import { portraitUpstream } from '@/lib/portraits'

/**
 * Deputy portrait proxy (MON-198).
 *
 * One URL per deputy, cached at the CDN for a week, so serving portraits costs
 * ~577 upstream fetches per cache generation instead of one transformation per
 * (deputy x width x format x DPR) combination hit at runtime.
 */
export const runtime = 'nodejs'

/** Long enough that the edge absorbs essentially all traffic, short enough
 * that a replaced portrait (by-election, new photo) rolls in on its own. */
const CACHE_HIT = 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400'
/** A missing portrait is normal (deputies without a photo); cache it briefly
 * so a 404 storm can't reach the AN, but re-check often enough to pick one up. */
const CACHE_MISS = 'public, max-age=300, s-maxage=300'

const UPSTREAM_TIMEOUT_MS = 5_000

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const upstream = portraitUpstream(id)
  if (!upstream) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': CACHE_MISS } })

  let res: Response
  try {
    res = await fetch(upstream, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch {
    // Timeout or network failure: never cached, so the next request retries.
    return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const contentType = res.headers.get('content-type') ?? ''
  // The AN answers unknown ids with an HTML error page rather than a 404 -
  // treat anything that isn't an image as a missing portrait so the avatar
  // falls back to initials instead of rendering a broken image.
  if (!res.ok || !contentType.startsWith('image/'))
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': CACHE_MISS } })

  const headers = new Headers({ 'Content-Type': contentType, 'Cache-Control': CACHE_HIT })
  const length = res.headers.get('content-length')
  if (length) headers.set('Content-Length', length)

  return new Response(res.body, { status: 200, headers })
}
