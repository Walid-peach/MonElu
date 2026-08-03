import { fireEvent, render, screen } from '@testing-library/react'

let mockReducedMotion = false

jest.mock('framer-motion', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

import { AsyncStatus } from '@/components/ui/AsyncStatus'

describe('AsyncStatus', () => {
  beforeEach(() => {
    mockReducedMotion = false
  })

  it('renders the contextual status text with aria-busy while in progress', () => {
    render(<AsyncStatus status="Recherche des sources officielles…" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Recherche des sources officielles…')).toBeInTheDocument()
  })

  it('renders a smaller inline treatment for the inline phase', () => {
    render(<AsyncStatus status="Chargement…" phase="inline" />)

    expect(screen.getByText('Chargement…')).toHaveClass('text-xs')
  })

  it('renders the content-phase treatment by default', () => {
    render(<AsyncStatus status="Analyse en cours…" />)

    expect(screen.getByText('Analyse en cours…')).toHaveClass('text-sm')
  })

  it('offers a cancel affordance while in progress, when supported', () => {
    const onCancel = jest.fn()
    render(<AsyncStatus status="Recherche…" onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /annuler/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('switches to the failure state and clears aria-busy on error', () => {
    render(<AsyncStatus status="Recherche…" error="La recherche a échoué." onRetry={jest.fn()} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText('La recherche a échoué.')).toBeInTheDocument()
    expect(screen.queryByText('Recherche…')).not.toBeInTheDocument()
  })

  it('offers a retry affordance only in the failure state', () => {
    const onRetry = jest.fn()
    const { rerender } = render(<AsyncStatus status="Recherche…" onRetry={onRetry} />)
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument()

    rerender(<AsyncStatus status="Recherche…" error="Échec." onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not animate the activity indicator when reduced motion is requested', () => {
    mockReducedMotion = true
    const { container } = render(<AsyncStatus status="Recherche…" />)

    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).not.toHaveClass('animate-pulse')
  })

  it('animates the activity indicator when motion is not reduced', () => {
    mockReducedMotion = false
    const { container } = render(<AsyncStatus status="Recherche…" />)

    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).toHaveClass('animate-pulse')
  })
})
