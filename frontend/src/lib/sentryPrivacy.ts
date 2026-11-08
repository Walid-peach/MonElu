// Keeps what a visitor types to find their deputy out of Sentry (ADR-047 §4).
//
// The address goes to the Base Adresse Nationale's geocoder and the postal code
// to geo.api.gouv.fr, both as a GET query string. The Sentry browser SDK records
// every fetch URL in its breadcrumbs and in `http.client` spans, so without this
// an error report or a sampled page load would carry the address to a service
// MonÉlu runs, which the privacy page says never happens.
import type { Breadcrumb } from '@sentry/nextjs'

export const PRIVATE_QUERY_HOSTS = ['data.geopf.fr', 'geo.api.gouv.fr']

/** The URL without its query and fragment when it goes to one of those hosts. */
export function scrubPrivateUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (!PRIVATE_QUERY_HOSTS.includes(parsed.hostname)) return url
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

function scrubText(text: string): string {
  return text.replace(/https?:\/\/[^\s"']+/g, scrubPrivateUrl)
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data
  if (data && typeof data.url === 'string') {
    return { ...breadcrumb, data: { ...data, url: scrubPrivateUrl(data.url) } }
  }
  return breadcrumb
}

type SpanLike = { description?: string; data?: Record<string, unknown> }

export function scrubSpan<T extends SpanLike>(span: T): T {
  const data = span.data ? { ...span.data } : undefined
  if (data) {
    for (const key of ['url', 'http.url', 'url.full', 'http.query', 'url.query']) {
      const value = data[key]
      if (typeof value !== 'string') continue
      if (key === 'http.query' || key === 'url.query') {
        const target = String(data['url.full'] ?? data['http.url'] ?? data.url ?? '')
        if (PRIVATE_QUERY_HOSTS.some(host => target.includes(host))) delete data[key]
      } else {
        data[key] = scrubPrivateUrl(value)
      }
    }
  }
  return {
    ...span,
    ...(span.description ? { description: scrubText(span.description) } : {}),
    ...(data ? { data } : {}),
  }
}
