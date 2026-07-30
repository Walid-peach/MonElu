import { render, screen } from '@testing-library/react'

import { QuizResultCard } from '@/app/quiz/QuizResultCard'
import type { QuizDeputyMatch, QuizMatchResponse } from '@/lib/api'

function makeMatch(deputy_id: string, agreement_pct: number | null): QuizDeputyMatch {
  return {
    deputy_id,
    full_name: `Deputy ${deputy_id}`,
    party: 'Parti Test',
    party_short: 'PT',
    department: '75',
    photo_url: null,
    agreement_pct,
    matches: 8,
    compared: 10,
    detail: null,
  }
}

function makeResult(overrides: Partial<QuizMatchResponse> = {}): QuizMatchResponse {
  return {
    version: '1',
    answered: 10,
    eligible_deputies: 577,
    top_matches: [makeMatch('d1', 82), makeMatch('d2', 79), makeMatch('d3', 77)],
    opposite: makeMatch('d9', 21),
    groups: [],
    my_department: null,
    focus: null,
    ...overrides,
  }
}

describe('QuizResultCard (MON-203)', () => {
  it('headlines the best match and lists the top 3 as allies', () => {
    render(<QuizResultCard result={makeResult()} />)

    expect(screen.getByText('Vous votez à 82% comme Deputy d1.')).toBeInTheDocument()
    expect(screen.getByText('Vos alliés')).toBeInTheDocument()
    for (const id of ['d1', 'd2', 'd3']) {
      expect(screen.getByText(`Deputy ${id}`)).toBeInTheDocument()
    }
    expect(screen.getByText('MonÉlu · 17ᵉ législature')).toBeInTheDocument()
  })

  it('falls back to the "pas assez de votes comparables" headline with no matches', () => {
    render(<QuizResultCard result={makeResult({ top_matches: [], opposite: null })} />)

    expect(
      screen.getByText('Pas assez de votes comparables pour désigner un député.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Vos alliés')).not.toBeInTheDocument()
    expect(screen.queryByText('À l’opposé')).not.toBeInTheDocument()
  })

  it('omits the theme and département blocks when the snapshot carries neither', () => {
    render(<QuizResultCard result={makeResult()} />)

    expect(screen.queryByText('Vous votez pour')).not.toBeInTheDocument()
    expect(screen.queryByText(/Vos députés/)).not.toBeInTheDocument()
  })

  it('renders the theme block when the snapshot carries themes', () => {
    render(
      <QuizResultCard
        result={makeResult({ themes: { supported: ['Justice', 'Logement'], opposed: ['Sécurité'] } })}
      />
    )

    expect(screen.getByText('Vous votez pour')).toBeInTheDocument()
    expect(screen.getByText('Justice · Logement')).toBeInTheDocument()
    expect(screen.getByText('et contre : Sécurité')).toBeInTheDocument()
  })

  it('flips the theme block to "contre" when nothing was voted for', () => {
    render(<QuizResultCard result={makeResult({ themes: { supported: [], opposed: ['Sécurité'] } })} />)

    expect(screen.getByText('Vous votez contre')).toBeInTheDocument()
    expect(screen.queryByText(/et contre :/)).not.toBeInTheDocument()
  })

  it('drops the theme block when every question was abstained', () => {
    render(<QuizResultCard result={makeResult({ themes: { supported: [], opposed: [] } })} />)

    expect(screen.queryByText('Vous votez pour')).not.toBeInTheDocument()
    expect(screen.queryByText('Vous votez contre')).not.toBeInTheDocument()
  })

  // MON-175 regression guard: a card must never name a département the sharer
  // declined to publish — the block is gated on my_department being present.
  it('never names a département absent from the snapshot', () => {
    render(<QuizResultCard result={makeResult({ focus: makeMatch('f1', 64) })} />)

    expect(screen.queryByText(/Gironde/)).not.toBeInTheDocument()
    expect(screen.getByText('Le député que vous suiviez')).toBeInTheDocument()
    expect(screen.getByText('Deputy f1')).toBeInTheDocument()
  })

  it('shows the best-matching local deputy when the département was opted in', () => {
    render(
      <QuizResultCard
        result={makeResult({
          my_department: {
            code: '33',
            name: 'Gironde',
            deputies: [makeMatch('low', 30), makeMatch('high', 88), makeMatch('none', null)],
          },
        })}
      />
    )

    expect(screen.getByText('Vos députés · Gironde')).toBeInTheDocument()
    expect(screen.getByText('Deputy high')).toBeInTheDocument()
    expect(screen.queryByText('Deputy low')).not.toBeInTheDocument()
  })

  it('renders the axis only once two groups are comparable', () => {
    const oneGroup = [
      { party: 'Parti A', party_short: 'A', agreement_pct: 84, matches: 8, compared: 10, deputy_count: 70 },
    ]
    const { rerender } = render(<QuizResultCard result={makeResult({ groups: oneGroup })} />)
    expect(screen.queryByText('Votre axe')).not.toBeInTheDocument()

    rerender(
      <QuizResultCard
        result={makeResult({
          groups: [
            ...oneGroup,
            { party: 'Parti B', party_short: 'B', agreement_pct: 18, matches: 2, compared: 10, deputy_count: 88 },
          ],
        })}
      />
    )
    expect(screen.getByText('Votre axe')).toBeInTheDocument()
    expect(screen.getByText('84% d’accord')).toBeInTheDocument()
    expect(screen.getByText('18% d’accord')).toBeInTheDocument()
  })
})
