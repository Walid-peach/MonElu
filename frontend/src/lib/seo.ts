import type { Deputy, Vote } from '@/lib/api'
import { departmentLabel } from '@/lib/departments'
import { SITE_URL } from '@/lib/site'

export { SITE_URL } from '@/lib/site'
export const SITE_NAME = 'MonÉlu'

/**
 * The site's own description, in one place.
 *
 * Consumed by the root layout's `metadata.description` and by
 * `Organization.description` below, so the `<meta name="description">` a
 * crawler reads and the JSON-LD it parses on the same page cannot drift apart.
 * The shorter OG/Twitter card variant in `layout.tsx` is deliberate — card
 * descriptions are truncated by the platforms anyway.
 */
export const SITE_DESCRIPTION =
  "Données officielles de l'Assemblée Nationale. Suivez chaque vote de chaque député français."

/**
 * Stable node id for the publisher (MON-273).
 *
 * Emitted once sitewide by `buildOrganizationJsonLd()` in the root layout, then
 * referenced by `@id` from every other block that needs a publisher — the
 * `WebSite` below today, and `Dataset.publisher` (MON-262) / `ClaimReview.author`
 * (MON-263) once those land. Referencing beats re-declaring: consumers merge the
 * blocks into one graph, so the organization is described in exactly one place.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`

export type BreadcrumbItem = { name: string; url: string }

/**
 * Publisher identity for the site (MON-273).
 *
 * `WebSite` describes the site; this describes who stands behind it. Without it
 * nothing in the graph says who publishes MonÉlu, which weakens every other
 * block — a dataset with no resolvable publisher, or a fact-check with no
 * identifiable author, carries far less weight.
 *
 * Deliberately omitted rather than guessed:
 * - `contactPoint` — waits on the /contact page (MON-272). The only address on
 *   the site today is a personal inbox, which is not a publisher contact point.
 * - `foundingDate` — no verifiable date to hand; an invented one is worse than
 *   an absent field.
 * `sameAs` lists only origins the project actually controls.
 */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/icon-512.png`,
      width: 512,
      height: 512,
    },
    areaServed: {
      '@type': 'Country',
      name: 'France',
    },
    knowsLanguage: 'fr',
    sameAs: ['https://github.com/Walid-peach/MonElu'],
  }
}

export function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'fr',
    publisher: { '@id': ORGANIZATION_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/chat?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function buildPersonJsonLd(deputy: Deputy) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: deputy.full_name,
    givenName: deputy.first_name,
    familyName: deputy.last_name,
    jobTitle: 'Député',
    url: `${SITE_URL}/deputes/${deputy.deputy_id}`,
    ...(deputy.photo_url ? { image: deputy.photo_url } : {}),
    ...(deputy.party ? { memberOf: { '@type': 'Organization', name: deputy.party } } : {}),
    workLocation: {
      '@type': 'Place',
      name: 'Assemblée nationale',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Paris',
        addressCountry: 'FR',
        ...(deputy.department ? { addressRegion: departmentLabel(deputy.department) } : {}),
      },
    },
  }
}

export function buildVoteJsonLd(vote: Vote) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: vote.vote_title,
    startDate: vote.voted_at,
    endDate: vote.voted_at,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Assemblée nationale',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Paris',
        addressCountry: 'FR',
      },
    },
    organizer: {
      '@type': 'GovernmentOrganization',
      name: 'Assemblée nationale',
    },
    ...(vote.summary_plain ? { description: vote.summary_plain } : {}),
    url: `${SITE_URL}/votes/${vote.vote_id}`,
  }
}
