import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Explicit factory mock so useSWR is a controllable jest.fn().
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

import { VotesClient } from '@/app/votes/VotesClient'
import { LOADING_INLINE_MS, LOADING_NO_INDICATOR_MS } from '@/lib/loadingPolicy'

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
  it('disables prev button when on first page', () => {
    mockUseSWR.mockReturnValue({ data: makeList(), isLoading: false })
    render(<VotesClient initial={makeList()} heroStats={heroStats} />)
    // Pagination only shows when totalPages > 1 (120 items / 50 per page = 3 pages)
    const prevBtn = screen.getByRole('button', { name: '‹' })
    expect(prevBtn).toBeDisabled()
  })

  it('hides pagination when total fits on one page', () => {
    mockUseSWR.mockReturnValue({ data: makeList(30), isLoading: false })
    render(<VotesClient initial={makeList(30)} heroStats={heroStats} />)
    expect(screen.queryByRole('button', { name: '‹' })).not.toBeInTheDocument()
  })

  it('enables next button when there are more pages', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: false })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    expect(screen.getByRole('button', { name: '›' })).not.toBeDisabled()
  })

  it('disables prev button while loading on first page', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: true })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    // Prev is disabled because page === 1 (not because of loading state)
    expect(screen.getByRole('button', { name: '‹' })).toBeDisabled()
  })

  it('advances to page 2 when next is clicked', async () => {
    const user = userEvent.setup()
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: false })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    await user.click(screen.getByRole('button', { name: '›' }))
    // Page 2 button should now be active (highlighted)
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })
})

describe('VotesClient loading treatment (MON-215)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('does not show a loader for a fast completion under the no-indicator threshold', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: true })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS - 50)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows subtle inline activity between the no-indicator and skeleton thresholds', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: true })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS + 50)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Chargement…')
    // Inline phase, not the full row-skeleton treatment.
    expect(status.querySelector('.dp-skeleton-block')).not.toBeInTheDocument()
  })

  it('shows the layout-matched row skeleton for a delayed completion', () => {
    mockUseSWR.mockReturnValue({ data: makeList(120), isLoading: true })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)

    act(() => {
      jest.advanceTimersByTime(LOADING_INLINE_MS + 50)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('.dp-skeleton-block').length).toBeGreaterThan(0)
  })
})
