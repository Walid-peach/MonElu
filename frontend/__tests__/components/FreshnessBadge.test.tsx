import { render, screen } from '@testing-library/react'

import { FreshnessBadge } from '@/components/FreshnessBadge'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { health: jest.fn() },
}))

afterEach(() => jest.clearAllMocks())

describe('FreshnessBadge', () => {
  it('renders a fresh state for a recent ingestion date', async () => {
    ;(api.health as jest.Mock).mockResolvedValue({ last_ingestion: new Date().toISOString() })
    render(await FreshnessBadge())
    expect(screen.getByText(/Données à jour au/)).toBeInTheDocument()
  })

  it('renders a stale state when ingestion is older than 4 days', async () => {
    const old = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    ;(api.health as jest.Mock).mockResolvedValue({ last_ingestion: old })
    const { container } = render(await FreshnessBadge())
    expect(container.querySelector('.bg-amber-50')).toBeInTheDocument()
  })

  it('renders nothing when the health check fails', async () => {
    ;(api.health as jest.Mock).mockRejectedValue(new Error('API error: 503'))
    const result = await FreshnessBadge()
    expect(result).toBeNull()
  })

  it('renders nothing when last_ingestion is missing', async () => {
    ;(api.health as jest.Mock).mockResolvedValue({})
    const result = await FreshnessBadge()
    expect(result).toBeNull()
  })
})
