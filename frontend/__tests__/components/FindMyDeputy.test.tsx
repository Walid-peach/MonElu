import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FindMyDeputy, SITUATION_ELECTORALE_URL } from '@/components/FindMyDeputy'
import type { Seat } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { circonscriptions: { locate: jest.fn(), abroad: jest.fn() } },
}))
jest.mock('@/lib/address', () => ({
  MIN_ADDRESS_QUERY_LENGTH: 3,
  searchAddresses: jest.fn(),
}))

import { api } from '@/lib/api'
import { searchAddresses } from '@/lib/address'

const mockLocate = api.circonscriptions.locate as jest.Mock
const mockAbroad = api.circonscriptions.abroad as jest.Mock
const mockSearch = searchAddresses as jest.Mock

const ADDRESS = { label: '1 Rue Nationale 59000 Lille', context: '59, Nord', lat: 50.63, lon: 3.06 }

function seat(n: number, deputy: string | null): Seat {
  return {
    department_code: '59',
    department_name: 'Nord',
    circonscription: n,
    label: `Nord, ${n === 1 ? '1re' : `${n}e`} circonscription`,
    vacant: deputy === null,
    ...(deputy
      ? {
          deputy: {
            deputy_id: `PA${n}`, full_name: deputy, party: 'Groupe', party_short: 'G',
            department: 'Nord', circonscription: String(n), photo_url: null,
          },
        }
      : {}),
  }
}

async function pickAddress(user: ReturnType<typeof userEvent.setup>) {
  mockSearch.mockResolvedValue([ADDRESS])
  await user.type(screen.getByLabelText('Votre adresse'), '1 rue nationale')
  await user.click(await screen.findByText(ADDRESS.label))
}

beforeEach(() => jest.clearAllMocks())

it('sends only the coordinates of the chosen address and offers its deputy', async () => {
  const user = userEvent.setup()
  const onChoose = jest.fn()
  mockLocate.mockResolvedValue({ uncertain: false, seats: [seat(1, 'Une Députée')] })
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={onChoose} />)

  await pickAddress(user)
  expect(mockLocate).toHaveBeenCalledWith({ lat: 50.63, lon: 3.06 })
  expect(await screen.findByText('Une Députée')).toBeInTheDocument()
  expect(screen.getByText('Nord, 1re circonscription')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Suivre ce député' }))
  expect(onChoose).toHaveBeenCalledWith(seat(1, 'Une Députée'))
})

it('lists every seat near a boundary and points to the official check', async () => {
  const user = userEvent.setup()
  mockLocate.mockResolvedValue({ uncertain: true, seats: [seat(1, 'Première'), seat(4, 'Quatrième')] })
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  await pickAddress(user)
  expect(await screen.findByText(/tout près de la limite entre 2 circonscriptions/)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Suivre ce député' })).toHaveLength(2)
  expect(screen.getByRole('link', { name: 'Interroger sa situation électorale' })).toHaveAttribute(
    'href',
    SITUATION_ELECTORALE_URL
  )
})

it('says a seat is vacant and offers no action for it', async () => {
  const user = userEvent.setup()
  mockLocate.mockResolvedValue({ uncertain: false, seats: [seat(2, null)] })
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  await pickAddress(user)
  expect(await screen.findByText(/Ce siège est vacant/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Suivre ce député' })).not.toBeInTheDocument()
})

it('explains a point in no circonscription', async () => {
  const user = userEvent.setup()
  mockLocate.mockRejectedValue(new Error('API error: 404'))
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  await pickAddress(user)
  expect(await screen.findByText(/Nous n.avons pas trouvé de circonscription/)).toBeInTheDocument()
})

it('reports a failed lookup', async () => {
  const user = userEvent.setup()
  mockLocate.mockRejectedValue(new Error('API error: 500'))
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  await pickAddress(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('La recherche a échoué')
})

it('lists the seats abroad by region', async () => {
  const user = userEvent.setup()
  mockAbroad.mockResolvedValue([
    { ...seat(4, 'Député Benelux'), department_code: '99', label: 'Français établis hors de France, 4e circonscription', region: 'Benelux' },
  ])
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  await user.click(screen.getByRole('button', { name: "J'habite à l'étranger" }))
  expect(await screen.findByText('Benelux')).toBeInTheDocument()
  expect(screen.getByText('Député Benelux')).toBeInTheDocument()
  expect(mockLocate).not.toHaveBeenCalled()
})

it('can be driven from the keyboard', async () => {
  const user = userEvent.setup()
  mockLocate.mockResolvedValue({ uncertain: false, seats: [seat(1, 'Une Députée')] })
  mockSearch.mockResolvedValue([ADDRESS])
  render(<FindMyDeputy actionLabel="Suivre ce député" onChoose={jest.fn()} />)

  const input = screen.getByRole('combobox', { name: 'Votre adresse' })
  await user.type(input, '1 rue nationale')
  await screen.findByRole('option', { name: /1 Rue Nationale/ })
  await user.keyboard('{ArrowDown}{Enter}')
  expect(mockLocate).toHaveBeenCalledWith({ lat: 50.63, lon: 3.06 })
})
