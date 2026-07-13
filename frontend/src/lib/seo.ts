import type { Deputy, Vote } from '@/lib/api'
import { departmentLabel } from '@/lib/departments'

export const SITE_URL = 'https://mon-elu.vercel.app'
export const SITE_NAME = 'MonÉlu'

export type BreadcrumbItem = { name: string; url: string }

export function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
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
