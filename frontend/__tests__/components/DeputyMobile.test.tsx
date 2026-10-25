import { render, screen, within } from '@testing-library/react'

import { DeputyMobile } from '@/app/deputes/[id]/DeputyMobile'
import type { Alignment, Deputy, DeputyStats, DeputyVotesResponse, DissidentVotesResponse, Scorecard } from '@/lib/api'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/deputes/PA1',
}))

const deputy: Deputy = {
  deputy_id: 'PA1',
  full_name: 'Marie Exemple',
  first_name: 'Marie',
  last_name: 'Exemple',
  party: 'Les Démocrates',
  department: 'Rhône',
  photo_url: null,
  mandate_start: '2024-07-07',
  mandate_end: null,
}

const scorecard = {
  deputy_id: 'PA1',
  full_name: 'Marie Exemple',
  total_votes: 1200,
  present_votes: 1100,
  presence_rate: 0.4,
  votes_for: 600,
  votes_against: 450,
  abstentions: 50,
  votes_for_pct: 0.5,
  abstention_pct: 0.05,
  solennel_participation_rate: 0.82,
} as unknown as Scorecard

const stats = { avg_presence_rate: 0.3, avg_solennel_participation_rate: 0.7, avg_voting_days_rate: null, avg_votes_for_pct: null, avg_abstention_pct: null } as DeputyStats

const alignment: Alignment = {
  deputy_id: 'PA1', full_name: 'Marie Exemple', party: 'Les Démocrates', total_votes: 1000, aligned_votes: 900,
  dissident_votes: 100, party_alignment_rate: 0.9, dissident_rate: 0.1, updated_at: null,
}

const recentVotes: DeputyVotesResponse = {
  deputy_id: 'PA1', total: 1200,
  items: [{ vote_id: 'V1', voted_at: '2026-10-22', vote_title: 'Titre officiel', result: 'adopté', position: 'pour', summary_plain: 'Le budget de la Sécurité sociale' }],
}

const dissidentVotes: DissidentVotesResponse = {
  deputy_id: 'PA1', total: 1,
  items: [{ vote_id: 'V2', voted_at: '2026-10-20', vote_title: "L'amendement n° 12", result: 'rejeté', position: 'contre', majority_position: 'pour' }],
}

function renderPage(overrides: Partial<Parameters<typeof DeputyMobile>[0]> = {}) {
  return render(
    <DeputyMobile
      deputy={deputy}
      scorecard={scorecard}
      stats={stats}
      recentVotes={recentVotes}
      alignment={alignment}
      dissidentVotes={dissidentVotes}
      departmentLabel="Rhône (69)"
      departmentCode="69"
      groupHref="les-democrates"
      {...overrides}
    />
  )
}

describe('DeputyMobile', () => {
  it('is the phone layout only, named after the deputy', () => {
    const { container } = renderPage()
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marie Exemple')
    expect(screen.getByRole('link', { name: 'Les Démocrates' })).toHaveAttribute('href', '/groupes/les-democrates')
    expect(screen.getByRole('link', { name: 'Rhône (69)' })).toHaveAttribute('href', '/departements/69')
  })

  it('shows the tally, including non-votants, and solemn participation against the average', () => {
    renderPage()
    // fr-FR groups thousands with a narrow no-break space.
    expect(screen.getByRole('heading', { name: /^1\s200 scrutins sur ce mandat$/ })).toBeInTheDocument()
    expect(screen.getByText('Non-votant')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('82 %')).toBeInTheDocument()
    expect(screen.getByText('au-dessus de la moyenne')).toBeInTheDocument()
    expect(screen.getByText('Moyenne des députés : 70 %')).toBeInTheDocument()
  })

  it('lists votes against the group and recent votes with their positions', () => {
    renderPage()
    const dissent = screen.getByRole('link', { name: /L'amendement n° 12/ })
    expect(dissent).toHaveAttribute('href', '/votes/V2')
    expect(within(dissent).getByText('Lui · Contre')).toBeInTheDocument()
    expect(within(dissent).getByText('Groupe · Pour')).toBeInTheDocument()
    const recent = screen.getByRole('link', { name: /Le budget de la Sécurité sociale/ })
    expect(within(recent).getByText('Adopté')).toBeInTheDocument()
  })

  it('drops the sections the API could not provide', () => {
    renderPage({ scorecard: null, alignment: null, recentVotes: null, dissidentVotes: null })
    expect(screen.queryByText('Bilan de mandat')).not.toBeInTheDocument()
    expect(screen.queryByText('Alignement avec son groupe')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Votez-vous comme Marie Exemple/ })).toHaveAttribute('href', '/quiz?deputy=PA1')
  })
})
