import { render, screen, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import ContactPage from '@/app/contact/page'

describe('/contact report section (#707)', () => {
  it('has the #signaler-un-contenu section the share pages link to', () => {
    const { container } = render(<ContactPage />)
    const section = container.querySelector('section#signaler-un-contenu') as HTMLElement
    expect(section).not.toBeNull()
    expect(within(section).getByRole('heading', { name: 'Signaler un contenu partagé' })).toBeInTheDocument()
    // Without the parameter, the static text still says what to send.
    expect(section).toHaveTextContent("avec l'adresse de la page et la raison du signalement")
    expect(screen.queryByTestId('reported-page')).not.toBeInTheDocument()
  })
})
