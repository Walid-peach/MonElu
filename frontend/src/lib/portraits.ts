/**
 * Deputy portrait URLs (MON-198).
 *
 * Portraits are hosted by the Assemblée Nationale, one immutable JPEG per
 * deputy. Pointing `next/image` straight at that host made the cost of serving
 * them scale with *runtime* combinations (deputy x rendered width x format x
 * DPR), which exhausted Vercel's image-transformation quota (MON-197).
 *
 * Every consumer now goes through `portraitSrc()`, which rewrites the upstream
 * URL to a same-origin proxy (`/api/portraits/<id>.jpg`). That collapses the
 * address space to exactly one cacheable URL per deputy, so the served cost is
 * bounded by deputy count (~577) whatever the rendered size happens to be.
 *
 * The `.jpg` suffix is load-bearing: the service worker registers its
 * StaleWhileRevalidate image rule (`static-image-assets`, 64 entries, 30 days)
 * by file extension and *before* its `/api/*` rule, so an extensionless proxy
 * path would fall into the 16-entry NetworkFirst `apis` cache instead - which
 * thrashes on any page rendering more than 16 avatars and breaks the offline
 * deputy pages MON-115 exists to keep readable.
 */

// Server-only in practice: `portraitUpstream()` is the sole consumer and only
// the route handler calls it, so tree-shaking keeps these ~8 KB out of every
// client bundle (verified against .next/static after a build). Using
// PORTRAIT_IDS from `portraitId()` or `portraitSrc()` - which client
// components do import - would ship the whole list to the browser.
import { PORTRAIT_IDS } from './portraitIds'

/** Upstream prefix for 17th-legislature square portraits. */
export const AN_PORTRAIT_PREFIX =
  'https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/'

/** Shape pre-filter: the numeric part of an AN deputy id. Cheap, and it keeps
 * `portraitId()` (which only parses a stored photo_url) independent of the
 * allowlist below. */
const PORTRAIT_ID = /^\d{1,9}$/

/**
 * Extract the AN portrait id from a stored `photo_url`.
 *
 * Returns null for anything that is not an AN square-portrait URL - including
 * one carrying a query string or fragment. That is deliberate: such a URL
 * falls through to `portraitSrc()`'s pass-through branch and keeps working,
 * rather than being rewritten to a proxy path the route would then reject.
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
  return id ? `/api/portraits/${id}.jpg` : photoUrl
}

/**
 * Upstream URL the proxy fetches for a route segment.
 *
 * Accepts the `<id>.jpg` form `portraitSrc()` emits (and a bare id), and
 * returns null for anything else, so the route can never be pointed at an
 * arbitrary upstream path.
 *
 * The id must also be a *real* deputy's (MON-251). The shape check alone
 * admits a billion ids, and the route acts on every one of them: one Vercel
 * function invocation plus one outbound fetch to the Assemblée Nationale, with
 * no ceiling. MON-198 bounded the legitimate serving cost by deputy count;
 * membership in PORTRAIT_IDS bounds the abusive cost the same way, so a loop
 * over invented ids gets a cheap 404 and the AN is never touched on its behalf.
 */
export function portraitUpstream(segment: string): string | null {
  const id = segment.replace(/\.jpg$/i, '')
  if (!PORTRAIT_ID.test(id) || !PORTRAIT_IDS.has(id)) return null
  return `${AN_PORTRAIT_PREFIX}${id}.jpg`
}
