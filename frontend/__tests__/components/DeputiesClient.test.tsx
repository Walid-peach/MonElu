import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))
import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

import { DeputiesClient } from '@/app/deputes/DeputiesClient'

const makeDeputy = (overrides = {}) => ({
  deputy_id: 'PA001',
  full_name: 'Jean Dupont',
  first_name: 'Jean',
  last_name: 'Dupont',
  party: 'Rassemblement National',
  department: 'Paris',
  photo_url: null,
  mandate_start: null,
  mandate_end: null,
  ...overrides,
})

const makeList = (items = [makeDeputy()], total = 50) => ({
  total,
  items,
  limit: 50,
  offset: 0,
})

// useSWR is called twice per render: once for paginated browse, once for full-list search.
// Dispatch by whether the key contains 'all' so null-keyed (disabled) calls return undefined data.
function setupSWR({
  pageData = makeList(),
  allData = undefined as unknown[] | undefined,
  isLoading = false,
} = {}) {
  mockUseSWR.mockImplementation((key: string | null) => {
    if (!key) return { data: undefined, isLoading: false }
    if (key.includes('all')) return { data: allData, isLoading }
    return { data: pageData, isLoading }
  })
}

afterEach(() => jest.clearAllMocks())

describe('DeputiesClient browse mode', () => {
  it('renders deputy cards from initial data', () => {
    setupSWR()
    render(<DeputiesClient initial={makeList()} />)
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
  })

  it('shows total count in browse mode', () => {
    setupSWR({ pageData: makeList([makeDeputy()], 120) })
    render(<DeputiesClient initial={makeList([makeDeputy()], 120)} />)
    expect(screen.getByText(/120 député/)).toBeInTheDocument()
  })

  it('shows pagination when total exceeds page size', () => {
    setupSWR({ pageData: makeList([makeDeputy()], 120) })
    render(<DeputiesClient initial={makeList([makeDeputy()], 120)} />)
    expect(screen.getByText('Suivant →')).toBeInTheDocument()
  })

  it('disables Précédent on the first page', () => {
    setupSWR({ pageData: makeList([makeDeputy()], 120) })
    render(<DeputiesClient initial={makeList([makeDeputy()], 120)} />)
    expect(screen.getByText('← Précédent')).toBeDisabled()
  })
})

describe('DeputiesClient search mode', () => {
  it('filters deputies by name and hides pagination', async () => {
    const user = userEvent.setup()
    const allDeputies = [
      makeDeputy({ deputy_id: 'PA001', full_name: 'Jean Dupont' }),
      makeDeputy({ deputy_id: 'PA002', full_name: 'Marie Martin', department: 'Lyon' }),
    ]
    setupSWR({ pageData: makeList(allDeputies, 2), allData: allDeputies })

    render(<DeputiesClient initial={makeList(allDeputies, 2)} />)
    await user.type(screen.getByPlaceholderText(/Rechercher/), 'Dupont')

    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.queryByText('Marie Martin')).not.toBeInTheDocument()
    // Pagination should be hidden while searching
    expect(screen.queryByText('Suivant →')).not.toBeInTheDocument()
  })

  it('shows result count when searching', async () => {
    const user = userEvent.setup()
    const allDeputies = [makeDeputy({ full_name: 'Yaël Braun-Pivet', department: 'Paris' })]
    setupSWR({ pageData: makeList(allDeputies, 1), allData: allDeputies })

    render(<DeputiesClient initial={makeList(allDeputies, 1)} />)
    await user.type(screen.getByPlaceholderText(/Rechercher/), 'Braun')

    expect(screen.getByText(/1 résultat/)).toBeInTheDocument()
  })

  it('shows "Aucun résultat" when nothing matches', async () => {
    const user = userEvent.setup()
    const allDeputies = [makeDeputy({ full_name: 'Jean Dupont', department: 'Paris' })]
    setupSWR({ pageData: makeList(allDeputies, 1), allData: allDeputies })

    render(<DeputiesClient initial={makeList(allDeputies, 1)} />)
    await user.type(screen.getByPlaceholderText(/Rechercher/), 'zzzzz')

    expect(screen.getByText('Aucun résultat')).toBeInTheDocument()
  })
})
