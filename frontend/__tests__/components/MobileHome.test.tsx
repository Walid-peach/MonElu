import { fireEvent, render, screen } from '@testing-library/react'

import { MobileHome, heroHemicycleDots } from '@/components/home/MobileHome'

const stats = { deputies: 577, votes: 5000, positions: 700000, lastUpdated: 'Mis à jour : 22 octobre' }
const leadVote = {
  title: 'Projet de loi de financement de la sécurité sociale',
  result: 'Adopté',
  votesFor: 300,
  votesAgainst: 200,
  abstentions: 50,
  href: '/votes/VTANR5L17V1234',
  votedAt: '22 OCTOBRE 2026',
}
const deputyInfo = {
  name: 'Marie Exemple',
  party: 'Groupe Exemple',
  department: 'Rhône',
  photoUrl: null,
  deputyId: 'PA1',
  totalVotes: 1000,
  solennelParticipationRate: 80,
  votesFor: 400,
  votesAgainst: 500,
  abstentions: 20,
  votePosition: 'pour' as const,
}

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

beforeEach(() => mockMatchMedia(false))

describe('heroHemicycleDots', () => {
  it('fills the chamber left to right in the vote proportions', () => {
    const dots = heroHemicycleDots(300, 200, 50)
    const count = (kind: string) => dots.filter(d => d.kind === kind).length
    expect(count('pour') / dots.length).toBeCloseTo(300 / 550, 1)
    expect(count('contre') / dots.length).toBeCloseTo(200 / 550, 1)
    expect(count('abstention')).toBeGreaterThan(0)
    // Pour sits on the left, contre on the right.
    const meanX = (kind: string) => {
      const xs = dots.filter(d => d.kind === kind).map(d => d.x)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(meanX('pour')).toBeLessThan(meanX('contre'))
  })

  it('stays inside its 300 by 158 frame and draws something without votes', () => {
    const dots = heroHemicycleDots(0, 0, 0)
    expect(dots.length).toBeGreaterThan(100)
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.x).toBeLessThanOrEqual(300)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeLessThanOrEqual(158)
    }
  })
})

describe('MobileHome', () => {
  it('carries the page h1 and the lead vote figures', () => {
    render(<MobileHome stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('La vie politique française, enfin lisible.')
    expect(screen.getByText('Pour 300')).toBeInTheDocument()
    expect(screen.getByText('Contre 200')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Adopté · Projet de loi/ })).toHaveAttribute('href', leadVote.href)
  })

  it('links the four features to their pages', () => {
    render(<MobileHome stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />)
    const feature = (name: RegExp) => screen.getByRole('link', { name })
    expect(feature(/Suivre votre député/)).toHaveAttribute('href', '/mon-depute')
    expect(feature(/Comprendre chaque vote/)).toHaveAttribute('href', '/votes')
    expect(feature(/Vérifier ce qu'on entend/)).toHaveAttribute('href', '/chat?mode=verify')
    expect(feature(/Trouver qui vote comme vous/)).toHaveAttribute('href', '/quiz')
  })

  it('counts a tap on the install button', () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock
    render(<MobileHome stats={stats} leadVote={leadVote} deputyInfo={null} />)
    const install = screen.getByRole('link', { name: /Installer l'application/ })
    expect(install).toHaveAttribute('href', '/application')
    fireEvent.click(install)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ event: 'install_section_tap' })
  })

  it('offers no install button inside the installed web app', () => {
    mockMatchMedia(true)
    render(<MobileHome stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />)
    expect(screen.queryByRole('link', { name: /Installer l'application/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Trouver mon député/ })).toBeInTheDocument()
  })
})
