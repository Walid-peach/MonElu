import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Explicit factory mock so useSWR is a controllable jest.fn().
jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

jest.mock('@/app/votes/VotesMobile', () => ({ VotesMobile: () => null }))

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

// SWR answers a null key with no data and no request in flight; the mocks
// below follow that so the initial view behaves as it does in a browser.
const fetching = (list: ReturnType<typeof makeList>) => (key: string | null) =>
  key === null ? { data: undefined, isLoading: false } : { data: list, isLoading: true }

describe('VotesClient initial view', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('does not refetch the server-rendered first page', () => {
    mockUseSWR.mockImplementation(fetching(makeList(120)))
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    expect(mockUseSWR.mock.calls.every(([key]) => key === null)).toBe(true)
  })

  // The CI smoke tier opens a vote from this list: the rows the server
  // rendered must still be there however long the API takes to answer.
  it('keeps the server-rendered rows past every loading threshold', () => {
    mockUseSWR.mockImplementation(fetching(makeList(120)))
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    act(() => {
      jest.advanceTimersByTime(LOADING_INLINE_MS + 50)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Test vote/ })).toHaveAttribute('href', '/votes/v1')
  })

  it('shows the initial list again, not the last filtered one, once filters are cleared', () => {
    const filtered = { ...makeList(3), items: [{ ...vote, vote_id: 'v2', vote_title: 'Filtered vote' }] }
    // What keepPreviousData returns for a null key after a filtered fetch.
    mockUseSWR.mockReturnValue({ data: filtered, isLoading: false })
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    expect(screen.getByRole('link', { name: /Test vote/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Filtered vote/ })).not.toBeInTheDocument()
  })
})

describe('VotesClient loading treatment (MON-215)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('does not show a loader for a fast completion under the no-indicator threshold', () => {
    mockUseSWR.mockImplementation(fetching(makeList(120)))
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adoptés' }))

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS - 50)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows subtle inline activity between the no-indicator and skeleton thresholds', () => {
    mockUseSWR.mockImplementation(fetching(makeList(120)))
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adoptés' }))

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS + 50)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Chargement…')
    // Inline phase, not the full row-skeleton treatment.
    expect(status.querySelector('.dp-skeleton-block')).not.toBeInTheDocument()
  })

  it('shows the layout-matched row skeleton for a delayed completion', () => {
    mockUseSWR.mockImplementation(fetching(makeList(120)))
    render(<VotesClient initial={makeList(120)} heroStats={heroStats} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adoptés' }))

    act(() => {
      jest.advanceTimersByTime(LOADING_INLINE_MS + 50)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('.dp-skeleton-block').length).toBeGreaterThan(0)
  })
})
