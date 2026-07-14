import { render, screen } from '@testing-library/react'

import { VerdictCard } from '@/components/VerdictCard'
import type { VerifyResult } from '@/lib/api'

const BASE: VerifyResult = {
  id: '3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001',
  claim: "Gabriel Attal a voté contre l'augmentation du SMIC",
  verdict: 'faux',
  explanation: 'Le scrutin cité montre un vote pour.',
  deputy: { deputy_id: 'PA2', name: 'Gabriel Attal', party: 'EPR' },
  citations: [
    {
      vote_id: 'VTANR5L17V1',
      title: "Vote sur l'augmentation du SMIC",
      voted_at: '2025-09-01',
      result: 'rejeté',
      deputy_position: 'pour',
    },
  ],
  confidence: 'ÉLEVÉ',
  data_horizon: '2025-07-01',
  verified_at: '2026-07-14T12:00:00',
  share_url: 'https://mon-elu.vercel.app/verifier/v/3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001',
}

describe('VerdictCard', () => {
  it.each([
    ['vrai', 'Vrai'],
    ['faux', 'Faux'],
    ['trompeur', 'Trompeur'],
    ['inverifiable', 'Invérifiable avec nos données'],
  ] as const)('renders the %s verdict badge', (verdict, label) => {
    render(<VerdictCard result={{ ...BASE, verdict }} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('links each cited scrutin to its vote page', () => {
    render(<VerdictCard result={BASE} />)
    const link = screen.getByRole('link', { name: /Vote sur l'augmentation du SMIC/ })
    expect(link).toHaveAttribute('href', '/votes/VTANR5L17V1')
  })

  it('shows the deputy recorded position on the citation', () => {
    render(<VerdictCard result={BASE} />)
    expect(screen.getByText(/position de Gabriel Attal : pour/)).toBeInTheDocument()
  })

  it('links the deputy to their profile', () => {
    render(<VerdictCard result={BASE} />)
    expect(screen.getByRole('link', { name: 'Gabriel Attal' })).toHaveAttribute(
      'href',
      '/deputes/PA2'
    )
  })

  it('always shows the data horizon, including on inverifiable verdicts', () => {
    render(
      <VerdictCard
        result={{ ...BASE, verdict: 'inverifiable', citations: [], confidence: 'FAIBLE' }}
      />
    )
    expect(screen.getByText(/depuis le 1 juillet 2025/)).toBeInTheDocument()
    expect(screen.getByText(/Confiance faible/)).toBeInTheDocument()
  })
})
