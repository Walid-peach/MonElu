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
  result: 'rejeté',
  votedAt: '2026-10-20T00:00:00Z',
  theme: 'Économie & Budget',
  votesFor: 200,
  votesAgainst: 1300,
  abstentions: 20,
  totalVoters: 520,
  dossierUrl: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N1',
}

describe('VoteHeroMobile', () => {
  it('is the phone hero only, with the headline as h1 and the tally', () => {
    const { container } = render(<VoteHeroMobile {...hero} />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Le budget 2027')
    expect(screen.getByText('Rejeté')).toBeInTheDocument()
    // fr-FR groups thousands with a narrow no-break space.
    expect(screen.getByText(/^1\s300$/)).toBeInTheDocument()
    expect(screen.getByText(/Titre officiel/).parentElement).toHaveTextContent(hero.voteTitle)
    expect(screen.getByRole('link', { name: /dossier officiel/ })).toHaveAttribute('href', hero.dossierUrl)
  })

  it('leaves out the official title line when the headline already is the title', () => {
    render(<VoteHeroMobile {...hero} summary={null} headline={hero.voteTitle} dossierUrl={null} />)
    expect(screen.queryByText(/Titre officiel/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dossier officiel/ })).not.toBeInTheDocument()
  })
})

describe('GroupBreakdownMobile', () => {
  it('shows each group with its majority and counts, linking known groups', () => {
    render(
      <GroupBreakdownMobile
        groups={[
          { name: 'Les Démocrates', color: '#f90', pour: 30, contre: 2, abst: 1, nonVotant: 2, position: 'Pour' },
          { name: 'Inconnu', color: '#999', pour: 1, contre: 1, abst: 0, nonVotant: 0, position: 'Partagé' },
        ]}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByRole('link', { name: 'Les Démocrates' })).toHaveAttribute('href', '/groupes/les-democrates')
    expect(within(items[0]).getByText('Pour')).toBeInTheDocument()
    expect(within(items[0]).getByText('30 pour · 2 contre · 1 abst. · 2 non-votants')).toBeInTheDocument()
    expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument()
    expect(within(items[1]).getByText('Partagé')).toBeInTheDocument()
  })
})
