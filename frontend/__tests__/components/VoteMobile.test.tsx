import { render, screen, within } from '@testing-library/react'

import { GroupBreakdownMobile, VoteHeroMobile } from '@/app/votes/[id]/VoteMobile'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/votes/1234',
}))

const hero = {
  voteId: '1234',
  voteTitle: "L'ensemble du projet de loi de finances pour 2027",
  headline: 'Le budget 2027',
  summary: 'Le budget 2027',
  summaryBasis: 'official_text',
  result: 'rejeté',
  votedAt: '2026-10-20T00:00:00Z',
  theme: 'Économie & Budget',
  votesFor: 200,
  votesAgainst: 1300,
  abstentions: 20,
  pourPct: 13,
  contrePct: 86,
  abstPct: 1,
  majorityRequired: 751,
  dossierUrl: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N1',
}

describe('VoteHeroMobile', () => {
  it('is the phone hero only, with the headline as h1 and the tally', () => {
    const { container } = render(<VoteHeroMobile {...hero} />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Le budget 2027')
    expect(screen.getByText('Rejeté')).toBeInTheDocument()
    // fr-FR groups thousands with a narrow no-break space.
    expect(screen.getByText(/^1\s300 voix$/)).toBeInTheDocument()
    // Percentages lead and the majority is the one computed by the API (#627).
    expect(screen.getByText(/^86\s%$/)).toBeInTheDocument()
    expect(screen.getByText(/Majorité requise : 751 voix/)).toBeInTheDocument()
    expect(screen.queryByText(/289/)).not.toBeInTheDocument()
    expect(screen.getByText(/Résumé généré par IA à partir du texte officiel/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Méthode' })).toHaveAttribute('href', '/methodologie#resumes')
    expect(screen.getByRole('link', { name: /dossier officiel/ })).toHaveAttribute('href', hero.dossierUrl)
  })

  it('shows no disclosure when the vote has no summary', () => {
    render(<VoteHeroMobile {...hero} summary={null} summaryBasis={null} headline={hero.voteTitle} dossierUrl={null} />)
    expect(screen.queryByText(/Titre officiel/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dossier officiel/ })).not.toBeInTheDocument()
  })
})

describe('GroupBreakdownMobile', () => {
  it('shows each group with its majority and counts, linking known groups', () => {
    render(
      <GroupBreakdownMobile
        groups={[
          {
            name: 'Les Démocrates', color: '#f90', pour: 30, contre: 2, abst: 1, nonVotant: 2, position: 'Pour',
            forPct: 91, agtPct: 6, abstPct: 3, participants: 35, members: 36, participationPct: 97,
          },
          {
            name: 'Inconnu', color: '#999', pour: 1, contre: 1, abst: 0, nonVotant: 0, position: 'Partagé',
            forPct: 50, agtPct: 50, abstPct: 0, participants: 2, members: null, participationPct: null,
          },
        ]}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByRole('link', { name: 'Les Démocrates' })).toHaveAttribute('href', '/groupes/les-democrates')
    expect(within(items[0]).getByText('Pour')).toBeInTheDocument()
    expect(
      within(items[0]).getByText('91 % pour (30) · 6 % contre (2) · 3 % abst. (1) · 2 non-votants'),
    ).toBeInTheDocument()
    expect(items[0]).toHaveTextContent('Participation : 97 % (35 sur 36 membres)')
    expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument()
    expect(within(items[1]).getByText('Partagé')).toBeInTheDocument()
    expect(items[1]).not.toHaveTextContent('Participation')
  })
})

describe('the link to the bill (#371)', () => {
  it('opens the bill page when the API gives the dossier one', () => {
    render(<VoteHeroMobile {...hero} billUrl="/lois/DLR5L17N1" billTitle="Budget 2027" />)
    const link = screen.getByRole('link', { name: /Ce vote fait partie du texte « Budget 2027 » - voir le parcours complet/ })
    expect(link).toHaveAttribute('href', '/lois/DLR5L17N1')
    expect(screen.queryByRole('link', { name: /dossier officiel/ })).not.toBeInTheDocument()
  })

  it('keeps only the official dossier link when the bill has no page', () => {
    render(<VoteHeroMobile {...hero} billUrl={null} />)
    expect(screen.getByRole('link', { name: /dossier officiel/ })).toHaveAttribute('href', hero.dossierUrl)
    expect(screen.queryByRole('link', { name: /parcours complet/ })).not.toBeInTheDocument()
  })

  it('shows neither link when the vote names no bill', () => {
    render(<VoteHeroMobile {...hero} dossierUrl={null} billUrl={null} />)
    expect(screen.queryByRole('link', { name: /dossier officiel|parcours complet/ })).not.toBeInTheDocument()
  })
})
