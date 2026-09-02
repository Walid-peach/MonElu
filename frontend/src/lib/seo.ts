import { anDeputyUrl, anDossierUrl } from '@/lib/an'
import { API_BASE, type Deputy, type Vote, type VoteDetail } from '@/lib/api'
import { CSV_EXPORTS, type CsvExport } from '@/lib/exports'
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

/**
 * Licence the published data is under (MON-262).
 *
 * `/donnees` and `/licence-donnees` both say "Licence Ouverte 2.0 (Etalab)" in
 * French prose. `license` as a URL is what makes the same statement legible to
 * a crawler or an agent without parsing legal French, and it is one of the
 * fields Google Dataset Search reads.
 */
export const DATA_LICENSE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence'

/** The open-data portal every export ultimately derives from. */
export const AN_OPEN_DATA_URL = 'https://data.assemblee-nationale.fr'

/** Stable node id for the catalog, so `/licence-donnees` can point at it. */
export const DATA_CATALOG_ID = `${SITE_URL}/donnees#catalog`

/**
 * Coverage of the production database, as an ISO 8601 open-ended interval.
 *
 * The horizon is 2025-07-01, not the start of the legislature (2024-07-07):
 * production runs on a free database tier that cannot hold the full history
 * (CLAUDE.md decision 7). Claiming the wider range would be a coverage promise
 * the downloads do not keep, which is worse than advertising less.
 */
export const DATA_TEMPORAL_COVERAGE = '2025-07-01/..'

function buildDatasetJsonLd(entry: CsvExport) {
  return {
    '@type': 'Dataset',
    '@id': `${SITE_URL}/donnees#${entry.id}`,
    name: entry.name,
    description: entry.what,
    url: `${SITE_URL}/donnees`,
    inLanguage: 'fr',
    license: DATA_LICENSE_URL,
    isAccessibleForFree: true,
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    includedInDataCatalog: { '@id': DATA_CATALOG_ID },
    isBasedOn: AN_OPEN_DATA_URL,
    temporalCoverage: DATA_TEMPORAL_COVERAGE,
    spatialCoverage: { '@type': 'Country', name: 'France' },
    keywords: entry.keywords,
    variableMeasured: entry.columns.split(', ').map(name => ({
      '@type': 'PropertyValue',
      name,
    })),
    // A parameterized export has no single file to point at, so it is described
    // by the url template a consumer fills in rather than by a `contentUrl`
    // that would 404 on the braces.
    ...(entry.href
      ? {
          distribution: {
            '@type': 'DataDownload',
            encodingFormat: 'text/csv',
            contentUrl: entry.href,
          },
        }
      : {
          potentialAction: {
            '@type': 'DownloadAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${API_BASE}${entry.pattern}`,
              contentType: 'text/csv',
              httpMethod: 'GET',
            },
          },
        }),
  }
}

/**
 * The CSV exports as a `DataCatalog` of `Dataset` nodes (MON-262).
 *
 * `/donnees` documents three exports, their columns, their freshness and their
 * reuse terms - all of it prose until now, on the one page whose entire purpose
 * is machine consumption. `Dataset` is the vocabulary for that, and the type
 * Google Dataset Search indexes on.
 *
 * Publisher and creator are `@id` references to the sitewide `Organization`
 * (MON-273) rather than repeated inline: consumers merge the blocks into a
 * single graph, and a dataset whose publisher resolves to a described entity
 * counts for considerably more than one carrying a bare name.
 */
export function buildDataCatalogJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    '@id': DATA_CATALOG_ID,
    name: `Données ouvertes ${SITE_NAME}`,
    description:
      "Exports CSV du relevé de vote de l'Assemblée nationale : bilans par député, historique de vote individuel et positions complètes par scrutin.",
    url: `${SITE_URL}/donnees`,
    inLanguage: 'fr',
    license: DATA_LICENSE_URL,
    usageInfo: `${SITE_URL}/licence-donnees`,
    isAccessibleForFree: true,
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isBasedOn: AN_OPEN_DATA_URL,
    dataset: CSV_EXPORTS.map(buildDatasetJsonLd),
  }
}

/**
 * The reuse terms page, as the licence node of the catalog (MON-262).
 *
 * `/licence-donnees` is the page an agent lands on when it asks "may I reuse
 * this?". Answering in French prose alone leaves the answer to a parser; this
 * states the licence as a URL, names the publisher, and points back at the
 * catalog the terms govern.
 */
export function buildDataLicenseJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${SITE_URL}/licence-donnees#page`,
    url: `${SITE_URL}/licence-donnees`,
    name: 'Licence des données',
    description:
      "Conditions de réutilisation des données MonÉlu : Licence Ouverte 2.0 (Etalab), réutilisation commerciale autorisée, attribution obligatoire.",
    inLanguage: 'fr',
    license: DATA_LICENSE_URL,
    publisher: { '@id': ORGANIZATION_ID },
    about: { '@id': DATA_CATALOG_ID },
  }
}
