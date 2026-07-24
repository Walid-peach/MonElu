import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { WeeklyQuizWidget } from '@/components/home/WeeklyQuizWidget'
import type { QuizWeeklyQuestion } from '@/lib/api'

const QUESTION: QuizWeeklyQuestion = {
  vote_id: 'VTANR5L17V9999',
  question: 'Auriez-vous voté pour ou contre : ce texte prévoit une réforme du sujet ?',
  vote_title: "l'ensemble du projet de loi X",
  votes_for: 300,
  votes_against: 200,
  abstentions: 10,
  result: 'adopté',
  vote_date: '2026-07-10',
}

describe('WeeklyQuizWidget', () => {
  it('renders nothing when there is no qualifying scrutin this week', () => {
    const { container } = render(<WeeklyQuizWidget question={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the question and answer options', () => {
    render(<WeeklyQuizWidget question={QUESTION} />)
    expect(screen.getByText('Le scrutin de la semaine')).toBeInTheDocument()
    expect(screen.getByText(QUESTION.question)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abstention' })).toBeInTheDocument()
  })

  it('reveals the real tallies and a CTA to the full quiz after answering', async () => {
    const user = userEvent.setup()
    render(<WeeklyQuizWidget question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: 'Pour' }))

    expect(screen.getByText(/L’Assemblée a adopté ce texte/)).toBeInTheDocument()
    expect(screen.getByText(/300 pour, 200 contre, 10 abstentions/)).toBeInTheDocument()
    expect(screen.getByText('Vous étiez avec la majorité.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Faire le quiz complet/ })).toHaveAttribute(
      'href',
      '/quiz'
    )
  })

  it('shows the minority outcome when the answer disagrees with the majority', async () => {
    const user = userEvent.setup()
    render(<WeeklyQuizWidget question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: 'Contre' }))

    expect(screen.getByText('Vous étiez avec la minorité.')).toBeInTheDocument()
  })

  it('shows the abstention outcome without a majority/minority judgment', async () => {
    const user = userEvent.setup()
    render(<WeeklyQuizWidget question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: 'Abstention' }))

    expect(screen.getByText("Vous vous êtes abstenu·e sur ce texte.")).toBeInTheDocument()
  })

  it('falls back to a generic line when tallies are unavailable', async () => {
    const user = userEvent.setup()
    render(
      <WeeklyQuizWidget
        question={{ ...QUESTION, votes_for: null, votes_against: null, abstentions: null }}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Pour' }))

    expect(
      screen.getByText('Résultat du scrutin indisponible pour ce texte.')
    ).toBeInTheDocument()
  })
})
