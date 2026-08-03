import { render, screen } from '@testing-library/react'

import VotesLoading from '@/app/votes/loading'

describe('VotesLoading (route skeleton)', () => {
  it('exposes aria-busy and a status role for the list region', () => {
    render(<VotesLoading />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('announces a screen-reader label for the vote list', () => {
    render(<VotesLoading />)
    expect(screen.getByText('Chargement des scrutins…')).toHaveClass('sr-only')
  })

  it('renders row skeletons matching the real row grid, all decorative', () => {
    const { container } = render(<VotesLoading />)
    const blocks = container.querySelectorAll('.dp-skeleton-block')
    expect(blocks.length).toBeGreaterThan(0)
    blocks.forEach(block => expect(block).toHaveAttribute('aria-hidden', 'true'))
  })
})
