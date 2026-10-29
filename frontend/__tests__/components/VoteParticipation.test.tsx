import { render, screen } from '@testing-library/react'

import { VoteParticipationCard, percent } from '@/app/votes/[id]/VoteParticipation'
import type { VoteParticipation } from '@/lib/api'

const participation: VoteParticipation = {
  participants: 128,
  non_voting: 2,
  seats: 577,
  rate: 0.2218,
  typical_rate: 0.2305,
  comparison: 'usual',
  groups: [],
}

describe('VoteParticipationCard', () => {
  it('leads with the rate and marks the median for the vote type (#627)', () => {
    render(<VoteParticipationCard participation={participation} voteType="spo" />)
    expect(screen.getByText(/^22\s%$/)).toBeInTheDocument()
    expect(screen.getByText(/des 577 députés ont pris part au vote/)).toBeInTheDocument()
    expect(screen.getByText('128 députés, dont 2 non-votants.')).toBeInTheDocument()
    expect(screen.getByText(/médiane des scrutins ordinaires : 23/)).toBeInTheDocument()
    expect(screen.getByText('Dans l’habitude')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(
      '22 % de participation, médiane des scrutins ordinaires : 23 %',
    )
    expect(screen.getByText(/Des votes, pas des présences/)).toBeInTheDocument()
  })

  it('flags a turnout well below the usual one', () => {
    render(<VoteParticipationCard participation={{ ...participation, rate: 0.07, comparison: 'below' }} voteType="spo" />)
    expect(screen.getByText('Nettement sous l’habitude')).toBeInTheDocument()
  })

  it('explains that only supporters vote on a censure motion', () => {
    render(<VoteParticipationCard participation={participation} voteType="moc" />)
    expect(screen.getByText(/seuls les députés qui la soutiennent votent/)).toBeInTheDocument()
  })

  it('drops the median and the badge when the API has no typical rate', () => {
    render(
      <VoteParticipationCard
        participation={{ ...participation, non_voting: 0, typical_rate: null, comparison: null }}
        voteType={null}
      />,
    )
    expect(screen.queryByText(/médiane/)).not.toBeInTheDocument()
    expect(screen.queryByText(/habitude/)).not.toBeInTheDocument()
    expect(screen.getByText('128 députés.')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName('22 % de participation')
  })
})

describe('percent', () => {
  it('rounds to a whole percentage and never shows a real turnout as 0', () => {
    expect(percent(0.2218)).toBe('22')
    expect(percent(0.003)).toBe('< 1')
    expect(percent(0)).toBe('0')
    expect(percent(1)).toBe('100')
  })
})
