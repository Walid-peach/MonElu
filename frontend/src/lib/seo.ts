import { anDeputyUrl, anDossierUrl } from '@/lib/an'
import type { Deputy, Vote, VoteDetail } from '@/lib/api'
import type { FaqItem } from '@/lib/faq'
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

/**
 * Question/answer pairs as `FAQPage` (MON-268).
 *
 * The pairs come from `@/lib/faq`, which is also what renders the visible
 * question and answer on the page - schema.org requires both to be visible to
 * the reader, and a builder fed by separate copy would drift out of that
 * requirement the first time someone edited the page.
 *
 * Q&A is the shape LLM crawlers lift most reliably, which is the point: the
 * definitions a model gets wrong about French parliamentary data (non-votant
 * versus abstention, what presence counts, why the Présidente shows 100 %) are
 * already written on `/methodologie` - this makes them extractable.
 */
export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'fr',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

/**
 * A deputy as an entity, not just a page (MON-267).
 *
 * `sameAs` is what lets a consumer confirm that this "Marie Dupont" is the same
 * person as the one on the Assemblée nationale's own site - without it the 577
 * deputy pages float unattached to the entity graph. The AN profile URL is
 * derived from `deputy_id`, which is the AN acteur uid, so it needs no new data.
 *
 * Wikidata deliberately absent: it is the second-strongest link available, but
 * it needs a one-off reconciliation and a `wikidata_id` column, scoped
 * separately rather than guessed from a name match.
 */
export function buildPersonJsonLd(deputy: Deputy) {
  const officialUrl = anDeputyUrl(deputy.deputy_id)
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: deputy.full_name,
    givenName: deputy.first_name,
    familyName: deputy.last_name,
    jobTitle: 'Député',
    url: `${SITE_URL}/deputes/${deputy.deputy_id}`,
    ...(officialUrl ? { sameAs: [officialUrl] } : {}),
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

/**
 * A scrutin as an `Event` (MON-267).
 *
 * The event type carries the sitting - when it happened, where, who convened
 * it. What the vote is *about* is the legislative text, so when the scrutin
 * carries a usable `dossier_id` the block also points at the official dossier
 * page, linking the vote into the same entity graph the deputy pages join
 * through `Person.sameAs`.
 *
 * The `Legislation` node carries a url and no name on purpose: `vote_title` is
 * the scrutin's own wording ("l'ensemble du projet de loi…", "amendement
 * n°45"), not the name of the text, and naming the entity wrongly is worse than
 * leaving a consumer to resolve it from the url. Most scrutins have no
 * `dossier_id` at all (ADR-035), so `about` is absent far more often than not.
 */
export function buildVoteJsonLd(vote: Vote | VoteDetail) {
  const dossierUrl = anDossierUrl('dossier_id' in vote ? vote.dossier_id : null)
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
    ...(dossierUrl ? { about: { '@type': 'Legislation', url: dossierUrl } } : {}),
    url: `${SITE_URL}/votes/${vote.vote_id}`,
  }
}
