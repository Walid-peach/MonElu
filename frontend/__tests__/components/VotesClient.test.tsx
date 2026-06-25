import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Explicit factory mock so useSWR is a controllable jest.fn().
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

import { VotesClient } from '@/app/votes/VotesClient'

const vote = {
  vote_id: 'v1',
  vote_title: 'Test vote',
  result: 'adopté',
  voted_at: '2025-06-01T00:00:00Z',
  votes_for: 300,
  votes_against: 200,
  abstentions: 10,
  total_voters: 510,
}

const makeList = (total = 120, offset = 0) => ({
  total,
  items: [vote],
  limit: 50,
  offset,
})

const heroStats = [
  { value: '1 248', label: 'scrutins' },
  { value: '68 %', label: "taux d'adoption" },
  { value: '82 %', label: 'participation' },
  { value: '17ᵉ', label: 'législature' },
]

afterEach(() => jest.clearAllMocks())

describe('VotesClient pagination', () => {
  it('disables Précédent when offset is 0', () => {
    mockUseSWR.mockReturnValue({ data: makeList(), isLoading: false })
    render(<VotesClient initial={makeList()} heroStats={heroStats} />)
    expect(screen.getByText('← Précédent')).toBeDisabled()
  })

  it('hides pagination when total fits on one page', () => {
    mockUseSWR.mockReturnValue({ data: makeList(30), isLoading: false })
    render(<VotesClient initial={makeList(30)} heroStats={heroStats} />)
    expect(screen.queryByText('Suivant →')).not.toBeInTheDocument()
  })

  it('enables Suivant when there are more pages', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: false })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    expect(screen.getByText('Suivant →')).not.toBeDisabled()
  })

  it('disables both pagination buttons while loading', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: true })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    expect(screen.getByText('← Précédent')).toBeDisabled()
    expect(screen.getByText('Suivant →')).toBeDisabled()
  })

  it('advances the page range label when Suivant is clicked', async () => {
    const user = userEvent.setup()
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: false })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    await user.click(screen.getByText('Suivant →'))
    expect(screen.getByText(/51/)).toBeInTheDocument()
  })
})
