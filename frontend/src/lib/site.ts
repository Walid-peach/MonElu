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

/**
 * Absolute canonical URL for a page path (MON-269).
 *
 * Every route must declare `alternates: { canonical: canonicalUrl(...) }`.
 * Without it, the same document is served - and independently crawlable - on
 * `mon-elu.vercel.app`, on every per-deployment `*-<hash>.vercel.app`, and on
 * any future custom domain, with none of them claiming to be the original;
 * query-string variants (`/quiz?deputy=`, `/quiz?compare=`, `/chat?q=`) fork
 * into distinct URLs for the same page on top of that.
 *
 * Absolute rather than relative-plus-`metadataBase` so the emitted URL is
 * readable as-is in the HTML source. The string must match the corresponding
 * `sitemap.ts` entry exactly, hence no trailing slash - including on the
 * homepage, which the sitemap lists as bare `SITE_URL`.
 */
export function canonicalUrl(path = '/'): string {
  const trimmed = path.replace(/\/+$/, '')
  if (!trimmed) return SITE_URL
  return `${SITE_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

/**
 * Attribution line the Licence Ouverte 2.0 asks reusers to print (MON-261).
 *
 * Derived from `SITE_HOST` rather than written out, because `/donnees`,
 * `/licence-donnees` and `/llms.txt` all publish it and a domain move that
 * updated only some of them would leave the site telling reusers to credit a
 * host it no longer answers on.
 */
export const DATA_ATTRIBUTION = `Données : Assemblée nationale, via ${SITE_HOST} - Licence Ouverte 2.0`
