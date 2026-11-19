import { render, screen } from '@testing-library/react'

const params = { value: new URLSearchParams() }
jest.mock('next/navigation', () => ({ useSearchParams: () => params.value }))

import { ReportedPageNote } from '@/components/ReportedPageNote'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

const ID = '3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001'

describe('ReportedPageNote (#707)', () => {
  it('names the reported snapshot and pre-fills the email with its URL', () => {
    params.value = new URLSearchParams({ signaler: `verifier-${ID}` })
    render(<ReportedPageNote />)
    const url = `${SITE_URL}/verifier/v/${ID}`
    expect(screen.getByTestId('reported-page')).toHaveTextContent(`Vous signalez un verdict partagé : ${url}`)
    const href = screen.getByRole('link').getAttribute('href') ?? ''
    expect(href.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true)
    expect(decodeURIComponent(href)).toContain(`Page signalée : ${url}`)
  })

  it('renders nothing without a valid parameter', () => {
    params.value = new URLSearchParams({ signaler: '<script>' })
    const { container } = render(<ReportedPageNote />)
    expect(container).toBeEmptyDOMElement()
  })
})
