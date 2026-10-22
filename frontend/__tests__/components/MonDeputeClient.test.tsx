import { render, screen } from '@testing-library/react'

import { MonDeputeClient } from '@/app/mon-depute/MonDeputeClient'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

jest.mock('@/lib/api', () => ({
  api: { deputies: { get: jest.fn(), scorecard: jest.fn(), alignment: jest.fn(), votes: jest.fn() } },
}))

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
