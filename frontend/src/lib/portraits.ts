/**
 * Deputy portrait URLs (MON-198).
 *
 * Portraits are hosted by the Assemblée Nationale, one immutable JPEG per
 * deputy. Pointing `next/image` straight at that host made the cost of serving
 * them scale with *runtime* combinations (deputy x rendered width x format x
 * DPR), which exhausted Vercel's image-transformation quota (MON-197).
 *
 * Every consumer now goes through `portraitSrc()`, which rewrites the upstream
 * URL to a same-origin proxy (`/api/portraits/<id>`). That collapses the
 * address space to exactly one cacheable URL per deputy, so the served cost is
 * bounded by deputy count (~577) whatever the rendered size happens to be.
 */

/** Upstream prefix for 17th-legislature square portraits. */
export const AN_PORTRAIT_PREFIX =
  'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/'

/** The only ids the proxy will fetch: the numeric part of an AN deputy id. */
const PORTRAIT_ID = /^\d{1,9}$/

/**
 * Extract the AN portrait id from a stored `photo_url`.
 * Returns null for anything that is not an AN square-portrait URL.
 */
export function portraitId(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || !photoUrl.startsWith(AN_PORTRAIT_PREFIX)) return null
  const id = photoUrl.slice(AN_PORTRAIT_PREFIX.length).replace(/\.jpg$/i, '')
  return PORTRAIT_ID.test(id) ? id : null
}

/**
 * Same-origin, CDN-cacheable URL for a deputy portrait.
 *
 * Falls back to the raw value for anything that is not a recognised AN
 * portrait URL, so an upstream path change degrades to today's behaviour
 * instead of breaking every avatar.
 */
export function portraitSrc(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null
  const id = portraitId(photoUrl)
  return id ? `/api/portraits/${id}` : photoUrl
}

/** Upstream URL the proxy fetches for a validated id. */
export function portraitUpstream(id: string): string | null {
  return PORTRAIT_ID.test(id) ? `${AN_PORTRAIT_PREFIX}${id}.jpg` : null
}
