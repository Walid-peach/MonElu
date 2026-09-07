/**
 * @jest-environment node
 */
import type { Alignment, Deputy, DeputyVotesResponse, Scorecard, VoteDetail } from '@/lib/api'
import { canonicalUrl } from '@/lib/site'

const deputiesGet = jest.fn()
const deputiesScorecard = jest.fn()
const deputiesAlignment = jest.fn()
const deputiesVotes = jest.fn()
const votesGet = jest.fn()

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    api: {
      deputies: {
        get: (...args: unknown[]) => deputiesGet(...args),
        scorecard: (...args: unknown[]) => deputiesScorecard(...args),
        alignment: (...args: unknown[]) => deputiesAlignment(...args),
        votes: (...args: unknown[]) => deputiesVotes(...args),
      },
      votes: {
        get: (...args: unknown[]) => votesGet(...args),
      },
    },
  }
})

import { GET as getDeputyMd } from '@/app/md/deputes/[id]/route'
import { GET as getVoteMd } from '@/app/md/votes/[id]/route'
import { GET as getMethodologieMd } from '@/app/md/methodologie/route'

const deputy: Deputy = {
  deputy_id: 'PA720892',
  full_name: 'Mathilde Panot',
  first_name: 'Mathilde',
  last_name: 'Panot',
  party: null,
  department: null,
  photo_url: null,
  mandate_start: '2024-07-07',
  mandate_end: null,
}

const scorecard: Scorecard = {
  deputy_id: 'PA720892',
  full_name: 'Mathilde Panot',
  total_votes: 500,
  present_votes: 480,
  presence_rate: 0.9,
  votes_for: 300,
  votes_against: 150,
  abstentions: 30,
  votes_for_pct: 0.63,
  abstention_pct: 0.06,
  eligible_solennels: 20,
  solennels_cast: 18,
  solennel_participation_rate: 0.9,
  eligible_voting_days: 100,
  voting_days_present: 90,
  voting_days_rate: 0.9,
}

const alignment: Alignment = {
  deputy_id: 'PA720892',
  full_name: 'Mathilde Panot',
  party: null,
  total_votes: 480,
  aligned_votes: 460,
  dissident_votes: 20,
  party_alignment_rate: 0.958,
  dissident_rate: 0.042,
  updated_at: null,
}

const votesResponse: DeputyVotesResponse = { deputy_id: 'PA720892', total: 1, items: [] }

const vote: VoteDetail = {
  vote_id: 'VTANR5L17V1234',
  vote_title: 'Projet de loi de finances',
  result: 'adopté',
  voted_at: '2026-08-01T00:00:00Z',
  votes_for: 300,
  votes_against: 150,
  abstentions: 30,
  total_voters: 480,
  summary_plain: null,
  theme: null,
  dossier_id: null,
}

afterEach(() => jest.clearAllMocks())

describe('GET /md/deputes/[id] (MON-271)', () => {
  it('serves Markdown with the right content type for a known deputy', async () => {
    deputiesGet.mockResolvedValue(deputy)
    deputiesScorecard.mockResolvedValue(scorecard)
    deputiesAlignment.mockResolvedValue(alignment)
    deputiesVotes.mockResolvedValue(votesResponse)

    const res = await getDeputyMd(new Request('http://localhost/md/deputes/PA720892'), {
      params: Promise.resolve({ id: 'PA720892' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    const body = await res.text()
    expect(body.startsWith('# Mathilde Panot')).toBe(true)
  })

  // One extra crawlable URL per deputy carrying the same content as a page we
  // actively SEO-tune. The canonical header consolidates ranking onto the HTML
  // page instead of letting the twin compete with it.
  it('points search engines back at the HTML page via a canonical Link header', async () => {
    deputiesGet.mockResolvedValue(deputy)
    deputiesScorecard.mockResolvedValue(scorecard)
    deputiesAlignment.mockResolvedValue(alignment)
    deputiesVotes.mockResolvedValue(votesResponse)

    const res = await getDeputyMd(new Request('http://localhost/md/deputes/PA720892'), {
      params: Promise.resolve({ id: 'PA720892' }),
    })

    expect(res.headers.get('Link')).toBe(`<${canonicalUrl('/deputes/PA720892')}>; rel="canonical"`)
  })

  it('404s a genuinely unknown deputy rather than rendering an empty page', async () => {
    const { ApiError } = jest.requireActual('@/lib/api')
    deputiesGet.mockRejectedValue(new ApiError(404, 'Not found'))

    const res = await getDeputyMd(new Request('http://localhost/md/deputes/unknown'), {
      params: Promise.resolve({ id: 'unknown' }),
    })

    expect(res.status).toBe(404)
  })
})

describe('GET /md/votes/[id] (MON-271)', () => {
  it('serves Markdown for a known vote', async () => {
    votesGet.mockResolvedValue(vote)

    const res = await getVoteMd(new Request('http://localhost/md/votes/VTANR5L17V1234'), {
      params: Promise.resolve({ id: 'VTANR5L17V1234' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('Link')).toBe(
      `<${canonicalUrl('/votes/VTANR5L17V1234')}>; rel="canonical"`
    )
    const body = await res.text()
    expect(body.startsWith('# Projet de loi de finances')).toBe(true)
  })

  it('404s a genuinely unknown vote', async () => {
    const { ApiError } = jest.requireActual('@/lib/api')
    votesGet.mockRejectedValue(new ApiError(404, 'Not found'))

    const res = await getVoteMd(new Request('http://localhost/md/votes/unknown'), {
      params: Promise.resolve({ id: 'unknown' }),
    })

    expect(res.status).toBe(404)
  })
})

describe('GET /md/methodologie (MON-271)', () => {
  it('serves the static methodology Markdown', async () => {
    const res = getMethodologieMd()
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('Link')).toBe(`<${canonicalUrl('/methodologie')}>; rel="canonical"`)
    const body = await res.text()
    expect(body.startsWith('# Méthodologie')).toBe(true)
  })
})
