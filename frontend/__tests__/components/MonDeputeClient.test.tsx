import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MonDeputeClient } from '@/app/mon-depute/MonDeputeClient'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  api: {
    deputies: { get: jest.fn(), scorecard: jest.fn(), alignment: jest.fn(), votes: jest.fn() },
    circonscriptions: { locate: jest.fn(), abroad: jest.fn() },
  },
}))

jest.mock('@/lib/address', () => ({
  MIN_ADDRESS_QUERY_LENGTH: 3,
  searchAddresses: jest.fn(),
}))

import { api } from '@/lib/api'
import { searchAddresses } from '@/lib/address'

beforeEach(() => {
  window.localStorage.clear()
})

// /mon-depute is the installed web app's start_url (#594), so with no followed
// deputy it is the first screen a new user sees: it must offer the search itself.
describe('MonDeputeClient with no followed deputy', () => {
  it('shows the deputy search and a link to the directory', async () => {
    render(<MonDeputeClient />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Choisissez votre député' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rechercher un député ou un département')).toHaveAttribute(
      'id',
      'mon-depute-search',
    )
    expect(screen.getByRole('button', { name: 'Trouver mon député' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Parcourir la liste des députés' })).toHaveAttribute(
      'href',
      '/deputes',
    )
  })
})

describe('MonDeputeClient address search (ADR-047)', () => {
  it('follows the deputy found from the address, keeping only their id', async () => {
    const user = userEvent.setup()
    ;(searchAddresses as jest.Mock).mockResolvedValue([
      { label: '1 Rue Nationale 59000 Lille', context: '59, Nord', lat: 50.63, lon: 3.06 },
    ])
    ;(api.circonscriptions.locate as jest.Mock).mockResolvedValue({
      uncertain: false,
      seats: [{
        department_code: '59', department_name: 'Nord', circonscription: 1,
        label: 'Nord, 1re circonscription', vacant: false,
        deputy: {
          deputy_id: 'PA1', full_name: 'Une Députée', party: 'Groupe', party_short: 'G',
          department: 'Nord', circonscription: '1', photo_url: null,
        },
      }],
    })
    ;(api.deputies.get as jest.Mock).mockResolvedValue({
      deputy_id: 'PA1', full_name: 'Une Députée', first_name: 'Une', last_name: 'Députée',
      party: 'Groupe', department: 'Nord', photo_url: null, mandate_start: null, mandate_end: null,
    })
    ;(api.deputies.scorecard as jest.Mock).mockResolvedValue(null)
    ;(api.deputies.alignment as jest.Mock).mockResolvedValue(null)
    ;(api.deputies.votes as jest.Mock).mockResolvedValue({ items: [] })
    render(<MonDeputeClient />)

    await user.type(await screen.findByRole('combobox'), '1 rue nationale')
    await user.click(await screen.findByText('1 Rue Nationale 59000 Lille'))
    await user.click(await screen.findByRole('button', { name: 'Suivre ce député' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Une Députée' })).toBeInTheDocument()
    const stored = Object.keys(window.localStorage).map(k => window.localStorage.getItem(k)).join(' ')
    expect(stored).toContain('PA1')
    expect(stored).not.toContain('Nationale')
    expect(stored).not.toContain('50.63')
  })
})
