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

/** Validators forwarded in both directions so a revalidation stays a 304. */
const CONDITIONAL = ['if-none-match', 'if-modified-since'] as const

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const upstream = portraitUpstream(id)
  if (!upstream) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': CACHE_MISS } })

  // Forward the caller's validators so a CDN revalidation after s-maxage
  // lapses costs a 304 from the AN rather than a full body transfer.
  const forwarded = new Headers()
  for (const h of CONDITIONAL) {
    const v = req.headers.get(h)
    if (v) forwarded.set(h, v)
  }

  let res: Response
  try {
    res = await fetch(upstream, { headers: forwarded, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch {
    // Timeout or network failure: never cached, so the next request retries.
    return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  // Checked before `res.ok`, which excludes 304.
  if (res.status === 304) return new Response(null, { status: 304, headers: { 'Cache-Control': CACHE_HIT } })

  const contentType = res.headers.get('content-type') ?? ''
  // The AN answers unknown ids with an HTML error page rather than a 404 -
  // treat anything that isn't an image as a missing portrait so the avatar
  // falls back to initials instead of rendering a broken image.
  if (!res.ok || !contentType.startsWith('image/')) {
    // Release the connection back to the pool: an undrained body holds it open.
    res.body?.cancel()
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': CACHE_MISS } })
  }

  const headers = new Headers({ 'Content-Type': contentType, 'Cache-Control': CACHE_HIT })
  // Emit the upstream validators so the CDN can answer browser revalidations
  // with a 304, and so our own next revalidation can send them back upstream.
  for (const h of ['content-length', 'etag', 'last-modified'] as const) {
    const v = res.headers.get(h)
    if (v) headers.set(h, v)
  }

  return new Response(res.body, { status: 200, headers })
}
