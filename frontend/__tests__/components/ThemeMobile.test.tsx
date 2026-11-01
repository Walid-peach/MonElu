import { render, screen, within } from '@testing-library/react'

import { THEME_VOTES_SHOWN, ThemeMobile } from '@/app/themes/[slug]/ThemeMobile'
import type { ThemeDetail } from '@/lib/api'

const data: ThemeDetail = {
  slug: 'sante-social',
  name: 'Santé & Social',
  vote_count: 412,
  adoption_rate: 0.38,
  most_divided_vote: { vote_id: 'V9', voted_at: '2026-10-01', vote_title: 'La réforme des retraites', votes_for: 280, votes_against: 270 },
  party_positions: [{ party_short: 'RN', pour: 40, contre: 10, abstention: 0, expressed: 50, pour_rate: 0.8 }],
  limit: 50,
  offset: 0,
  votes: Array.from({ length: THEME_VOTES_SHOWN + 2 }, (_, i) => ({
    vote_id: `V${i}`, voted_at: '2026-10-20', vote_title: `Titre ${i}`, result: 'adopté', summary_plain: i === 0 ? 'Le budget de la Sécu' : null,
  })),
}

describe('ThemeMobile', () => {
  it('is the phone layout only, with the theme figures', () => {
    const { container } = render(<ThemeMobile data={data} canonicalSlug="sante-social" />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Santé & Social')
    expect(screen.getByText('412')).toBeInTheDocument()
    expect(screen.getByText('38 %')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /La réforme des retraites/ })).toHaveAttribute('href', '/votes/V9')
    expect(screen.getByText('80 % pour · 50 exprimés')).toBeInTheDocument()
  })

  it('lists votes by their plain summary, folding the rest', () => {
    render(<ThemeMobile data={data} canonicalSlug="sante-social" />)
    const first = screen.getByRole('link', { name: /Le budget de la Sécu/ })
    expect(within(first).getByText('Adopté')).toBeInTheDocument()
    expect(screen.getByText('Voir les 2 autres').tagName).toBe('SUMMARY')
  })

  it('links the other themes but not this one', () => {
    render(<ThemeMobile data={data} canonicalSlug="sante-social" />)
    expect(screen.queryByRole('link', { name: 'Santé & Social' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agriculture' })).toHaveAttribute('href', '/themes/agriculture')
  })
})
