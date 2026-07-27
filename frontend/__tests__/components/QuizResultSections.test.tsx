import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QuizResultSections } from '@/app/quiz/QuizResultSections'
import type { QuizDeputyMatch, QuizMatchResponse } from '@/lib/api'

function makeMatch(deputy_id: string, agreement_pct: number): QuizDeputyMatch {
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

// MON-191: the ranked "other matches" list shows the top 3 matches overall
// (hero card + 2 rows) initially, revealing the rest behind a button.
function makeResult(matchCount: number): QuizMatchResponse {
  const top_matches = Array.from({ length: matchCount }, (_, i) =>
    makeMatch(`d${i + 1}`, 90 - i)
  )
  return {
    version: '1',
    answered: 10,
    eligible_deputies: 577,
    top_matches,
    opposite: null,
    groups: [],
    my_department: null,
    focus: null,
  }
}

describe('QuizResultSections - top matches expand (MON-191)', () => {
  it('shows only the top 3 matches and a "Voir tous les députés" button when there are more', () => {
    render(<QuizResultSections result={makeResult(6)} />)

    expect(screen.getByText('Deputy d1')).toBeInTheDocument()
    expect(screen.getByText('Deputy d2')).toBeInTheDocument()
    expect(screen.getByText('Deputy d3')).toBeInTheDocument()
    expect(screen.queryByText('Deputy d4')).not.toBeInTheDocument()
    expect(screen.queryByText('Deputy d5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir tous les députés' })).toBeInTheDocument()
  })

  it('reveals the remaining matches after clicking the expand button', async () => {
    const user = userEvent.setup()
    render(<QuizResultSections result={makeResult(6)} />)

    await user.click(screen.getByRole('button', { name: 'Voir tous les députés' }))

    expect(screen.getByText('Deputy d4')).toBeInTheDocument()
    expect(screen.getByText('Deputy d5')).toBeInTheDocument()
    expect(screen.getByText('Deputy d6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voir tous les députés' })).not.toBeInTheDocument()
  })

  it('does not show the expand button when there are 3 or fewer total matches', () => {
    render(<QuizResultSections result={makeResult(3)} />)

    expect(screen.getByText('Deputy d2')).toBeInTheDocument()
    expect(screen.getByText('Deputy d3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voir tous les députés' })).not.toBeInTheDocument()
  })
})
