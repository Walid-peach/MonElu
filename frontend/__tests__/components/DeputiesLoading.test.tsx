import { render, screen } from '@testing-library/react'

import DeputiesLoading from '@/app/deputes/(liste)/loading'
import { PAGE_SIZE } from '@/app/deputes/DeputiesClient'

describe('DeputiesLoading (route skeleton)', () => {
  it('renders one skeleton row per real page row, so the list height does not jump once data lands', () => {
    render(<DeputiesLoading />)
    expect(screen.getAllByTestId('deputy-row-skeleton')).toHaveLength(PAGE_SIZE)
  })

  it('exposes aria-busy and a status role for the list region', () => {
    render(<DeputiesLoading />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('announces a screen-reader label for the deputies list', () => {
    render(<DeputiesLoading />)
    expect(screen.getByText('Chargement des députés…')).toHaveClass('sr-only')
  })

  it('renders row skeletons matching the real row grid, all decorative', () => {
    const { container } = render(<DeputiesLoading />)
    const blocks = container.querySelectorAll('.dp-skeleton-block')
    expect(blocks.length).toBeGreaterThan(0)
    blocks.forEach(block => expect(block).toHaveAttribute('aria-hidden', 'true'))
  })
})
