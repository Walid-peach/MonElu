import {
  SITE_URL,
  SITE_DESCRIPTION,
  ORGANIZATION_ID,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
  buildPersonJsonLd,
  buildVoteJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo'
import type { Deputy, Vote } from '@/lib/api'

const deputy: Deputy = {
  deputy_id: 'PA123',
  full_name: 'Jeanne Dupont',
  first_name: 'Jeanne',
  last_name: 'Dupont',
  party: 'Renaissance',
  department: '69',
  photo_url: 'https://example.com/photo.jpg',
  mandate_start: '2024-07-07',
  mandate_end: null,
}

const vote: Vote = {
  vote_id: 'VTANR5L17V1',
  vote_title: 'Motion de censure',
  result: 'rejeté',
  voted_at: '2026-01-15T00:00:00',
  votes_for: 100,
  votes_against: 300,
  abstentions: 20,
  total_voters: 420,
  summary_plain: 'Rejetée par 300 voix contre 100.',
  theme: null,
}

describe('buildOrganizationJsonLd', () => {
  it('is an Organization carrying the shared @id', () => {
    const data = buildOrganizationJsonLd()
    expect(data['@type']).toBe('Organization')
    expect(data['@id']).toBe(ORGANIZATION_ID)
    expect(ORGANIZATION_ID).toBe(`${SITE_URL}/#organization`)
  })

  it('derives every absolute URL from SITE_URL so a domain move carries (MON-254)', () => {
    const data = buildOrganizationJsonLd()
    expect(data.url).toBe(SITE_URL)
    expect(data.logo.url).toBe(`${SITE_URL}/icon-512.png`)
    // Nothing may hardcode an origin: every http(s) URL in the block is either
    // SITE_URL-derived or an explicit external sameAs entry.
    const urls = JSON.stringify(data).match(/https?:\/\/[^"]+/g) ?? []
    const allowed = new Set<string>([...data.sameAs, 'https://schema.org'])
    for (const url of urls) {
      if (allowed.has(url)) continue
      expect(url.startsWith(SITE_URL)).toBe(true)
    }
  })

  it('omits contactPoint and foundingDate rather than inventing them', () => {
    const data = buildOrganizationJsonLd()
    expect(data).not.toHaveProperty('contactPoint')
    expect(data).not.toHaveProperty('foundingDate')
  })

  it('lists only origins the project controls in sameAs', () => {
    const data = buildOrganizationJsonLd()
    expect(data.sameAs).toEqual(['https://github.com/Walid-peach/MonElu'])
  })

  it('describes the site with the same text as the page meta description', () => {
    // The root layout feeds metadata.description from SITE_DESCRIPTION, so a
    // crawler must never read one description in <meta> and another in JSON-LD.
    expect(buildOrganizationJsonLd().description).toBe(SITE_DESCRIPTION)
  })
})

describe('buildWebsiteJsonLd', () => {
  it('includes a SearchAction targeting /chat', () => {
    const data = buildWebsiteJsonLd()
    expect(data['@type']).toBe('WebSite')
    expect(data.url).toBe(SITE_URL)
    expect(data.potentialAction.target.urlTemplate).toBe(`${SITE_URL}/chat?q={search_term_string}`)
  })

  it('references the Organization by @id instead of re-declaring it', () => {
    const data = buildWebsiteJsonLd()
    expect(data.publisher).toEqual({ '@id': ORGANIZATION_ID })
    expect(data.publisher).not.toHaveProperty('name')
  })
})

describe('buildPersonJsonLd', () => {
  it('includes memberOf and image when present', () => {
    const data = buildPersonJsonLd(deputy)
    expect(data['@type']).toBe('Person')
    expect(data.jobTitle).toBe('Député')
    expect(data.memberOf).toEqual({ '@type': 'Organization', name: 'Renaissance' })
    expect(data.image).toBe(deputy.photo_url)
  })

  it('omits memberOf and image when party/photo are null', () => {
    const data = buildPersonJsonLd({ ...deputy, party: null, photo_url: null })
    expect(data).not.toHaveProperty('memberOf')
    expect(data).not.toHaveProperty('image')
  })

  it('links the deputy to their official AN profile via sameAs (MON-267)', () => {
    const data = buildPersonJsonLd(deputy)
    expect(data.sameAs).toEqual(['https://www.assemblee-nationale.fr/dyn/deputes/PA123'])
  })

  it('omits sameAs rather than guessing a URL from an unrecognised id', () => {
    const data = buildPersonJsonLd({ ...deputy, deputy_id: "{'uid': 'PA123'}" })
    expect(data).not.toHaveProperty('sameAs')
  })
})

describe('buildVoteJsonLd', () => {
  it('builds an Event with the vote title and summary', () => {
    const data = buildVoteJsonLd(vote)
    expect(data['@type']).toBe('Event')
    expect(data.name).toBe(vote.vote_title)
    expect(data.description).toBe(vote.summary_plain)
    expect(data.url).toBe(`${SITE_URL}/votes/${vote.vote_id}`)
  })

  it('omits description when summary_plain is missing', () => {
    const data = buildVoteJsonLd({ ...vote, summary_plain: null })
    expect(data).not.toHaveProperty('description')
  })

  it('points at the official dossier when dossier_id is present (MON-267)', () => {
    const data = buildVoteJsonLd({ ...vote, dossier_id: 'DLR5L17N53980' })
    expect(data.about).toEqual({
      '@type': 'Legislation',
      url: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N53980',
    })
  })

  it('omits about when dossier_id is missing or corrupted', () => {
    expect(buildVoteJsonLd(vote)).not.toHaveProperty('about')
    // The stringified-dict shape some legacy rows carry (ADR-035).
    expect(
      buildVoteJsonLd({ ...vote, dossier_id: "{'@xsi:type': 'DossierRef'}" })
    ).not.toHaveProperty('about')
  })
})

describe('buildBreadcrumbJsonLd', () => {
  it('numbers items starting at 1', () => {
    const data = buildBreadcrumbJsonLd([
      { name: 'Accueil', url: SITE_URL },
      { name: 'Votes', url: `${SITE_URL}/votes` },
    ])
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Votes', item: `${SITE_URL}/votes` },
    ])
  })
})
