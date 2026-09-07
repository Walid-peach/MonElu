import type { Alignment, Deputy, DeputyVoteItem, Scorecard, VoteDetail } from '@/lib/api'
import { buildDeputyMarkdown, buildMethodologieMarkdown, buildVoteMarkdown } from '@/lib/markdown'

const deputy: Deputy = {
  deputy_id: 'PA720892',
  full_name: 'Mathilde Panot',
  first_name: 'Mathilde',
  last_name: 'Panot',
  party: 'La France insoumise - Nouveau Front Populaire',
  department: 'Val-de-Marne',
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
  party: 'La France insoumise',
  total_votes: 480,
  aligned_votes: 460,
  dissident_votes: 20,
  party_alignment_rate: 0.958,
  dissident_rate: 0.042,
  updated_at: null,
}

const recentVotes: DeputyVoteItem[] = [
  {
    vote_id: 'VTANR5L17V1234',
    voted_at: '2026-08-01T00:00:00Z',
    vote_title: 'Projet de loi de finances',
    result: 'adopté',
    position: 'contre',
    summary_plain: 'Le texte a été adopté malgré son opposition.',
  },
]

const vote: VoteDetail = {
  vote_id: 'VTANR5L17V1234',
  vote_title: 'Projet de loi de finances',
  result: 'adopté',
  voted_at: '2026-08-01T00:00:00Z',
  votes_for: 300,
  votes_against: 150,
  abstentions: 30,
  total_voters: 480,
  summary_plain: 'Le texte a été adopté malgré son opposition.',
  theme: 'Finances',
  dossier_id: 'DLR5L17N53980',
}

describe('buildDeputyMarkdown (MON-271)', () => {
  const md = buildDeputyMarkdown({ deputy, scorecard, alignment, recentVotes })

  it('leads with the deputy name and links back to the HTML page', () => {
    expect(md.startsWith('# Mathilde Panot')).toBe(true)
    expect(md).toContain('/deputes/PA720892)')
  })

  it('includes identity, mandate figures and group alignment', () => {
    expect(md).toContain('La France insoumise')
    expect(md).toContain('Val-de-Marne')
    expect(md).toContain('90%')
    expect(md).toContain('96%')
  })

  it('carries the nonVotant and data-horizon caveats inline', () => {
    expect(md).toContain('nonVotant')
    expect(md).toContain('1er juillet 2025')
  })

  it('lists recent votes with a link to the vote page', () => {
    expect(md).toContain('Projet de loi de finances')
    expect(md).toContain('/votes/VTANR5L17V1234')
  })

  it('degrades gracefully when scorecard and alignment are unavailable', () => {
    const partial = buildDeputyMarkdown({ deputy, scorecard: null, alignment: null, recentVotes: [] })
    expect(partial).toContain('Scorecard indisponible')
    expect(partial).not.toContain('Alignement avec son groupe')
  })

  // `formatDate` is `new Date(s)`, and `new Date('')` is `Invalid Date` - so a
  // null mandate date coerced to `''` would print the literal string
  // "Invalid Date" into a document built to be quoted verbatim by a model.
  // Every schema field is Optional to match DB NULLs, so this path is real.
  it('never prints "Invalid Date" when a mandate date is missing', () => {
    for (const dates of [
      { mandate_start: null, mandate_end: null },
      { mandate_start: null, mandate_end: '2026-01-15' },
      { mandate_start: '2024-07-07', mandate_end: null },
    ]) {
      const md = buildDeputyMarkdown({
        deputy: { ...deputy, ...dates },
        scorecard,
        alignment,
        recentVotes,
      })
      expect(md).not.toContain('Invalid Date')
      expect(md).toContain('- **Mandat :**')
    }
  })

  it('states when both mandate dates are missing rather than inventing one', () => {
    const md = buildDeputyMarkdown({
      deputy: { ...deputy, mandate_start: null, mandate_end: null },
      scorecard,
      alignment,
      recentVotes,
    })
    expect(md).toContain('dates non renseignées')
  })

  it('marks a finished mandate as terminated', () => {
    const md = buildDeputyMarkdown({
      deputy: { ...deputy, mandate_end: '2026-01-15' },
      scorecard,
      alignment,
      recentVotes,
    })
    expect(md).toContain('mandat terminé')
    expect(md).toContain('15 janvier 2026')
  })
})

describe('buildVoteMarkdown (MON-271)', () => {
  const md = buildVoteMarkdown(vote)

  it('leads with the vote title and states the result and tallies', () => {
    expect(md.startsWith('# Projet de loi de finances')).toBe(true)
    expect(md).toContain('adopté')
    expect(md).toContain('300')
  })

  it('includes the plain-French summary and the dossier link', () => {
    expect(md).toContain('Le texte a été adopté malgré son opposition.')
    expect(md).toContain('assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N53980')
  })

  it('carries the caveats inline', () => {
    expect(md).toContain('nonVotant')
  })

  it('omits the dossier line when there is no linkable dossier', () => {
    const noDossier = buildVoteMarkdown({ ...vote, dossier_id: null })
    expect(noDossier).not.toContain('Dossier législatif')
  })
})

describe('buildMethodologieMarkdown (MON-271)', () => {
  const md = buildMethodologieMarkdown()

  it('leads with the title and inlines both the caveats and the calculation definitions', () => {
    expect(md.startsWith('# Méthodologie')).toBe(true)
    expect(md).toContain('nonVotant')
    expect(md).toContain('mart_deputy_scorecard.sql')
  })
})
