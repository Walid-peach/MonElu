import {
  SITE_URL,
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

describe('buildWebsiteJsonLd', () => {
  it('includes a SearchAction targeting /chat', () => {
    const data = buildWebsiteJsonLd()
    expect(data['@type']).toBe('WebSite')
    expect(data.url).toBe(SITE_URL)
    expect(data.potentialAction.target.urlTemplate).toBe(`${SITE_URL}/chat?q={search_term_string}`)
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
