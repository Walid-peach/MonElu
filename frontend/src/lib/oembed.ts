/**
 * oEmbed provider contract (MON-266).
 *
 * The embeddable widget already existed (`/embed/votes/<id>`); what was
 * missing is the *discovery* half. oEmbed is how a pasted URL becomes a rich
 * card automatically: Notion, Slack, Substack, Ghost, WordPress, Discourse and
 * Confluence all look for a `<link rel="alternate" type="application/json+oembed">`
 * on the page, fetch that endpoint, and render the `html` it returns. Without
 * the link tag there is nothing to find, and every one of those platforms
 * falls back to a blue link.
 *
 * Everything here is derived from `SITE_URL`, so a domain move (MON-254,
 * MON-274) carries the endpoint, the discovery link and the iframe src along
 * with it.
 */
import { SITE_URL } from './site'

/** The provider endpoint itself, absolute because consumers fetch it directly. */
export const OEMBED_ENDPOINT = `${SITE_URL}/api/oembed`

export const OEMBED_PROVIDER_NAME = 'MonÉlu'

/**
 * Default widget box, matching the iframe snippet `EmbedButton` copies
 * (`src/components/EmbedButton.tsx`) so the oEmbed card and the hand-pasted
 * iframe render identically.
 */
export const OEMBED_WIDTH = 560
export const OEMBED_HEIGHT = 220

/**
 * Floor for `maxwidth`/`maxheight`. Below this the card's own padding and the
 * three-segment result bar stop being legible, so a consumer asking for a
 * 40px box gets the smallest usable widget rather than an unreadable one.
 */
const MIN_WIDTH = 280
const MIN_HEIGHT = 160

/**
 * Which URLs this provider answers for.
 *
 * Only `/votes/<id>` today - that is the one route with a finished embeddable
 * widget. `/deputes/<id>` is the obvious next entry and needs its own
 * `/embed/deputes/<id>` page first.
 *
 * The id pattern is deliberately narrow (AN scrutin uids are alphanumeric,
 * e.g. `VTANR5L17V1234`). The endpoint interpolates the id into an iframe
 * `src`, so the same discipline `lib/portraits.ts` applies to the portrait
 * proxy applies here: validate against an allowlisted shape before building a
 * URL out of caller-supplied text, rather than trusting the caller's origin
 * check alone.
 */
const EMBEDDABLE_PATHS = [
  { kind: 'vote' as const, pattern: /^\/votes\/([A-Za-z0-9]{1,64})\/?$/, page: '/votes', embed: '/embed/votes' },
]

export type EmbeddableResource = {
  kind: 'vote'
  id: string
  /** Canonical page path, e.g. `/votes/VTANR5L17V1234`. */
  path: string
  /** Widget path the iframe points at, e.g. `/embed/votes/VTANR5L17V1234`. */
  embedPath: string
}

/**
 * Resolve a caller-supplied `url` parameter to an embeddable resource.
 *
 * Returns null - which the route turns into a 404, as the oEmbed spec asks -
 * for anything that is not a parseable URL on our own origin matching an
 * allowlisted path. `requestOrigin` is accepted alongside `SITE_URL` so the
 * endpoint also answers on preview deployments and on localhost, where
 * `NEXT_PUBLIC_SITE_URL` is not the origin the visitor typed. That widens
 * nothing: only the *path* is ever read from the caller's URL, and every URL
 * the response emits is rebuilt from `SITE_URL`.
 */
export function parseEmbeddableUrl(raw: string | null, requestOrigin?: string): EmbeddableResource | null {
  if (!raw) return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  const allowed = new Set([new URL(SITE_URL).origin])
  if (requestOrigin) allowed.add(requestOrigin)
  if (!allowed.has(parsed.origin)) return null

  for (const { kind, pattern, page, embed } of EMBEDDABLE_PATHS) {
    const match = pattern.exec(parsed.pathname)
    if (!match) continue
    const id = match[1]
    return { kind, id, path: `${page}/${id}`, embedPath: `${embed}/${id}` }
  }
  return null
}

/**
 * `href` for the `<link rel="alternate" type="application/json+oembed">` tag a
 * page must emit for consumers to find the endpoint at all.
 */
export function oembedDiscoveryUrl(path: string): string {
  const target = `${SITE_URL}${path}`
  return `${OEMBED_ENDPOINT}?url=${encodeURIComponent(target)}&format=json`
}

/** Clamp a consumer-supplied `maxwidth`/`maxheight` to a usable box. */
export function clampDimension(raw: string | null, fallback: number, min: number): number {
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(min, Math.min(fallback, Math.floor(value)))
}

export function clampWidth(raw: string | null): number {
  return clampDimension(raw, OEMBED_WIDTH, MIN_WIDTH)
}

export function clampHeight(raw: string | null): number {
  return clampDimension(raw, OEMBED_HEIGHT, MIN_HEIGHT)
}

/** Minimal HTML-attribute escaping for the one caller-influenced value in the
 * payload: the vote title, which comes from the API and lands in `title=`. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The `html` field of the oEmbed payload - the markup consumers paste into
 * their own page. Kept byte-identical in shape to `EmbedButton`'s snippet so
 * both paths produce the same widget.
 */
export function oembedIframe(resource: EmbeddableResource, title: string, width: number, height: number): string {
  const src = `${SITE_URL}${resource.embedPath}`
  return (
    `<iframe src="${src}" width="${width}" height="${height}" ` +
    `style="border:1px solid #E4E6EA;border-radius:12px" loading="lazy" ` +
    `title="${escapeHtmlAttribute(title)}"></iframe>`
  )
}
