import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

afterEach(() => jest.clearAllMocks())

describe('DeputiesClient browse mode', () => {
  it('renders deputy cards from initial data', () => {
    render(<DeputiesClient initial={makeList()} />)
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
  })

  it('shows count of deputies from initial items', () => {
    const items = [makeDeputy(), makeDeputy({ deputy_id: 'PA002', full_name: 'Marie Martin' })]
    render(<DeputiesClient initial={makeList(items, 2)} />)
    expect(screen.getByText(/2 député/)).toBeInTheDocument()
  })

  it('renders a single deputy card without plural suffix', () => {
    render(<DeputiesClient initial={makeList([makeDeputy()], 1)} />)
    expect(screen.getByText('1 député')).toBeInTheDocument()
  })
})

describe('DeputiesClient search mode', () => {
  it('filters deputies by name', async () => {
    const user = userEvent.setup()
    const allDeputies = [
      makeDeputy({ deputy_id: 'PA001', full_name: 'Jean Dupont' }),
      makeDeputy({ deputy_id: 'PA002', full_name: 'Marie Martin', department: 'Lyon' }),
    ]

    render(<DeputiesClient initial={makeList(allDeputies, 2)} />)
    await user.type(screen.getByPlaceholderText(/Nom, département/), 'Dupont')

    await waitFor(() => {
      expect(screen.queryByText('Marie Martin')).not.toBeInTheDocument()
    }, { timeout: 2000 })
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
  })

  it('shows updated count when searching', async () => {
    const user = userEvent.setup()
    const allDeputies = [makeDeputy({ full_name: 'Yaël Braun-Pivet', department: 'Paris' })]

    render(<DeputiesClient initial={makeList(allDeputies, 1)} />)
    await user.type(screen.getByPlaceholderText(/Nom, département/), 'Braun')

    await waitFor(() => {
      expect(screen.getByText(/1 député/)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('shows "Aucun résultat" when nothing matches', async () => {
    const user = userEvent.setup()
    const allDeputies = [makeDeputy({ full_name: 'Jean Dupont', department: 'Paris' })]

    render(<DeputiesClient initial={makeList(allDeputies, 1)} />)
    await user.type(screen.getByPlaceholderText(/Nom, département/), 'zzzzz')

    await screen.findByText('Aucun résultat')
  })
})
