import { fireEvent, render, screen } from '@testing-library/react'

import { InfoTooltip } from '@/components/InfoTooltip'

describe('InfoTooltip', () => {
  it('shows the tooltip text on click and hides it on a second click', () => {
    render(<InfoTooltip text="Non-votant : présent mais sans position." />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Non-votant : présent mais sans position.')

    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders a link to the given href when provided', () => {
    render(<InfoTooltip text="Explication" href="/a-propos#nonvotant-abstention" />)
    fireEvent.click(screen.getByRole('button'))

    const link = screen.getByRole('link', { name: /en savoir plus/i })
    expect(link).toHaveAttribute('href', '/a-propos#nonvotant-abstention')
  })

  it('does not render a link when href is omitted', () => {
    render(<InfoTooltip text="Explication" />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
