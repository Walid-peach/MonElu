/**
 * Single source of truth for the public origin of the site.
 *
 * Everything that emits an absolute URL (metadataBase, canonicals, OG urls,
 * sitemap, robots, JSON-LD, OG card footers) must derive from here so a domain
 * move is a one-line change plus an env var - see MON-254.
 *
 * `NEXT_PUBLIC_*` is inlined by Next at build time, so a domain change takes a
 * rebuild - which is what a Vercel env-var change triggers anyway.
 *
 * Kept in its own module rather than in `seo.ts` so the edge-runtime
 * `opengraph-image` routes can import it without pulling in the department map.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mon-elu.vercel.app'

/** Host only, for display in OG card footers (e.g. `mon-elu.vercel.app`). */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
