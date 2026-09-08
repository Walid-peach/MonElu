import { render, screen } from '@testing-library/react'
import ComparerPage, { metadata } from '@/app/deputes/comparer/page'

// The interactive half is a client component driven by `useSearchParams`; what
// this test cares about is exactly the part that renders without it.
jest.mock('@/app/deputes/comparer/ComparerClient', () => ({
  ComparerClient: () => <div data-testid="comparer-client" />,
}))

describe('/deputes/comparer metadata (MON-265)', () => {
  it('declares its own title, description and social card', () => {
    expect(metadata.title).toContain('Comparer')
    expect(String(metadata.description ?? '')).toMatch(/présence/i)
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
    expect(metadata.twitter).toBeTruthy()
  })

  it('canonicalises to the query-less route', () => {
    expect(metadata.alternates?.canonical).toContain('/deputes/comparer')
  })
})

describe('/deputes/comparer server-rendered content (MON-265)', () => {
  // Without this the page is the string "Chargement…" to any crawler that does
  // not run JavaScript — which is most of the LLM crawlers the site is for.
  it('renders an h1 and an explanation before the client half hydrates', () => {
    render(<ComparerPage />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Comparer deux bilans')
    expect(screen.getByText(/Ce que compare cet outil/)).toBeInTheDocument()
  })

  it('links out of the page so it is not a dead end', () => {
    render(<ComparerPage />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/deputes', '/votes', '/methodologie']))
  })
})
