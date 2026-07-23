import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { QuizClient } from '@/app/quiz/QuizClient'
import type { QuizMatchResponse, QuizQuestionsResponse } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    quiz: {
      questions: jest.fn(),
      match: jest.fn(),
      share: jest.fn(),
    },
  },
}))

jest.mock('@/lib/postal', () => ({
  resolvePostalCodeToDepartment: jest.fn(),
}))

import { api } from '@/lib/api'
import { resolvePostalCodeToDepartment } from '@/lib/postal'

const mockQuestions = api.quiz.questions as jest.Mock
const mockMatch = api.quiz.match as jest.Mock
const mockShare = api.quiz.share as jest.Mock
const mockResolve = resolvePostalCodeToDepartment as jest.Mock

const QUESTIONS: QuizQuestionsResponse = {
  version: '2026-Q3-test',
  count: 3,
  questions: [
    {
      vote_id: 'V1',
      theme: 'Fin de vie',
      question: 'Auriez-vous voté pour ou contre la question 1 ?',
      context: 'Contexte 1.',
    },
    {
      vote_id: 'V2',
      theme: 'Budget',
      question: 'Auriez-vous voté pour ou contre la question 2 ?',
      context: 'Contexte 2.',
    },
    {
      vote_id: 'V3',
      theme: 'Écologie',
      question: 'Auriez-vous voté pour ou contre la question 3 ?',
      context: 'Contexte 3.',
    },
  ],
}

const BEST = {
  deputy_id: 'PA100',
  full_name: 'Jeanne Martin',
  party: 'Socialistes et apparentés',
  party_short: 'SOC',
  department: 'Gironde',
  photo_url: null,
  agreement_pct: 83.3,
  matches: 5,
  compared: 6,
  detail: null,
}

const MATCH: QuizMatchResponse = {
  version: '2026-Q3-test',
  answered: 3,
  eligible_deputies: 540,
  top_matches: [
    BEST,
    { ...BEST, deputy_id: 'PA101', full_name: 'Paul Durand', agreement_pct: 80, matches: 4, compared: 5 },
  ],
  opposite: { ...BEST, deputy_id: 'PA200', full_name: 'Luc Petit', agreement_pct: 10, matches: 0, compared: 5 },
  groups: [
    {
      party: 'Socialistes et apparentés',
      party_short: 'SOC',
      agreement_pct: 75,
      matches: 3,
      compared: 4,
      deputy_count: 66,
    },
  ],
  my_department: null,
}

const MATCH_WITH_DEPT: QuizMatchResponse = {
  ...MATCH,
  my_department: {
    code: '33',
    name: 'Gironde',
    deputies: [
      { ...BEST, deputy_id: 'PA300', full_name: 'Marie Bordeaux', agreement_pct: 66.7, matches: 2, compared: 3 },
      { ...BEST, deputy_id: 'PA301', full_name: 'Jean Absent', agreement_pct: null, matches: 0, compared: 0 },
    ],
  },
}

async function answerAllQuestions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))
  for (let i = 0; i < QUESTIONS.questions.length; i++) {
    await user.click(screen.getByRole('button', { name: 'Pour' }))
  }
}

// Passes through the optional self-perception group step without predicting.
async function skipGroupStep(user: ReturnType<typeof userEvent.setup>) {
  expect(screen.getByText('De quel groupe vous sentez-vous le plus proche ?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Je préfère ne pas dire / passer' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQuestions.mockResolvedValue(QUESTIONS)
})

describe('QuizClient', () => {
  it('walks intro → questions → postal skip → results with no persistence', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    expect(screen.getByText('Quel député vote comme vous ?')).toBeInTheDocument()
    await answerAllQuestions(user)
    await skipGroupStep(user)

    // Optional postal step reached after the last question.
    expect(screen.getByText('Et votre député à vous ?')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
    expect(mockMatch).toHaveBeenCalledWith(
      [
        { vote_id: 'V1', position: 'pour' },
        { vote_id: 'V2', position: 'pour' },
        { vote_id: 'V3', position: 'pour' },
      ],
      undefined
    )
    // Skipping the postal step yields full results minus the department section.
    expect(screen.getByText('Votre alignement par groupe')).toBeInTheDocument()
    expect(screen.queryByText('Les députés de votre département')).not.toBeInTheDocument()
  })

  it('shows a progress indicator and supports going back a question', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    expect(screen.getByText('Question 1 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Contre' }))
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Retour' }))
    expect(screen.getByText('Question 1 / 3')).toBeInTheDocument()
    // The previously selected answer stays highlighted (selected state kept).
    expect(screen.getByRole('button', { name: 'Contre' })).toHaveStyle({
      border: '2px solid var(--dp-red)',
    })
  })

  it('resolves the postal code to a department and passes it to the match call', async () => {
    const user = userEvent.setup()
    mockResolve.mockResolvedValue({ code: '33', nom: 'Gironde' })
    mockMatch.mockResolvedValue(MATCH_WITH_DEPT)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.type(screen.getByLabelText('Code postal'), '33000')
    await user.click(screen.getByRole('button', { name: 'Voir mes résultats' }))

    await screen.findByText('Les députés de votre département')
    expect(mockResolve).toHaveBeenCalledWith('33000')
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), '33')
    expect(screen.getByText('Marie Bordeaux')).toBeInTheDocument()
    // A department deputy with no comparable vote renders gracefully.
    expect(screen.getByText('aucun vote comparable')).toBeInTheDocument()
  })

  it('rejects an unknown postal code with a message and no match call', async () => {
    const user = userEvent.setup()
    mockResolve.mockResolvedValue(null)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.type(screen.getByLabelText('Code postal'), '99999')
    await user.click(screen.getByRole('button', { name: 'Voir mes résultats' }))

    await screen.findByText(/Code postal introuvable/)
    expect(mockMatch).not.toHaveBeenCalled()
  })

  it('requires at least 3 expressed answers before computing', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    await user.click(screen.getByRole('button', { name: 'Pour' }))
    await user.click(screen.getByRole('button', { name: 'Passer cette question' }))
    await user.click(screen.getByRole('button', { name: 'Abstention' }))
    await skipGroupStep(user)

    expect(screen.getByText('Encore quelques réponses')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    ).not.toBeInTheDocument()
  })

  it('allows going back from the postal step to revise answers', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    expect(screen.getByText('Et votre député à vous ?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Revenir aux questions' }))
    // Lands on the last question with the previous selection still highlighted.
    expect(screen.getByText('Question 3 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pour' })).toHaveStyle({
      border: '2px solid var(--dp-green)',
    })
  })

  it('links results to the matched deputy profiles', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findAllByText(/Jeanne Martin/)
    expect(screen.getByRole('link', { name: /Jeanne Martin/ })).toHaveAttribute(
      'href',
      '/deputes/PA100'
    )
    expect(screen.getByRole('link', { name: /Paul Durand/ })).toHaveAttribute(
      'href',
      '/deputes/PA101'
    )
    expect(screen.getByRole('link', { name: /Luc Petit/ })).toHaveAttribute(
      'href',
      '/deputes/PA200'
    )
    expect(screen.getByRole('link', { name: 'Ouvrir Mon député' })).toHaveAttribute(
      'href',
      '/mon-depute'
    )
  })

  it('shows the per-question breakdown with the deputy position and votes/[id] links', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue({
      ...MATCH,
      top_matches: [
        {
          ...BEST,
          detail: [
            { vote_id: 'V1', deputy_position: 'pour' },
            { vote_id: 'V2', deputy_position: 'contre' },
            { vote_id: 'V3', deputy_position: null },
          ],
        },
        MATCH.top_matches[1],
      ],
    })
    render(<QuizClient />)

    await answerAllQuestions(user) // answers pour/pour/pour
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
    await user.click(screen.getByText('Le détail, scrutin par scrutin'))

    expect(screen.getByRole('link', { name: /Auriez-vous voté pour ou contre la question 1/ })).toHaveAttribute(
      'href',
      '/votes/V1'
    )
    expect(screen.getByText('En accord avec Jeanne Martin')).toBeInTheDocument()
    expect(screen.getByText('En désaccord avec Jeanne Martin')).toBeInTheDocument()
    expect(screen.getByText(/non comparable/)).toBeInTheDocument()
  })

  it('shares results by creating a snapshot and copying the URL', async () => {
    const user = userEvent.setup()
    mockResolve.mockResolvedValue({ code: '33', nom: 'Gironde' })
    mockMatch.mockResolvedValue(MATCH_WITH_DEPT)
    mockShare.mockResolvedValue({
      id: 'abc',
      result: MATCH_WITH_DEPT,
      shared_at: '2026-07-18T00:00:00Z',
      share_url: 'https://mon-elu.vercel.app/quiz/s/abc',
    })
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.type(screen.getByLabelText('Code postal'), '33000')
    await user.click(screen.getByRole('button', { name: 'Voir mes résultats' }))
    await screen.findByText('Les députés de votre département')

    await user.click(screen.getByRole('button', { name: 'Partager mes résultats' }))
    await screen.findByText('Lien copié !')
    // The share payload is the answers + department — never the result:
    // the server recomputes before storing (ADR-025).
    expect(mockShare).toHaveBeenCalledWith(
      [
        { vote_id: 'V1', position: 'pour' },
        { vote_id: 'V2', position: 'pour' },
        { vote_id: 'V3', position: 'pour' },
      ],
      '33'
    )
    expect(writeText).toHaveBeenCalledWith('https://mon-elu.vercel.app/quiz/s/abc')
  })

  it('surfaces a share-creation failure with a retry state', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    mockShare.mockRejectedValue(new Error('API error: 500'))
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )
    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)

    await user.click(screen.getByRole('button', { name: 'Partager mes résultats' }))
    await screen.findByText('Échec — réessayer')
  })

  it('surfaces a match-call failure with a retry path', async () => {
    const user = userEvent.setup()
    mockMatch.mockRejectedValueOnce(new Error('API error: 500')).mockResolvedValueOnce(MATCH)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )
    await screen.findByText(/Le calcul a échoué/)

    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )
    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
  })

  it('shows an error state when the question set cannot load', async () => {
    mockQuestions.mockRejectedValue(new Error('API error: 500'))
    render(<QuizClient />)
    await waitFor(() =>
      expect(screen.getByText(/Impossible de charger le questionnaire/)).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /Commencer le quiz/ })).not.toBeInTheDocument()
  })

  it('skips the self-perception step in one tap with no gap line and no group in the payload', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
    // Skipping the prediction renders no gap/confirmation line at all.
    expect(screen.queryByText(/vos réponses vous/)).not.toBeInTheDocument()
    // No network call — match or share — ever carries the predicted group.
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined)
  })

  it('confirms the prediction when the actual top group matches the guess', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    await answerAllQuestions(user)
    expect(screen.getByText('De quel groupe vous sentez-vous le plus proche ?')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Socialistes et apparentés' })
    )
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(
      'Vous aviez vu juste : vos réponses vous placent bien près de Socialistes et apparentés (75%)'
    )
    // The prediction is never sent to the match endpoint (ADR-025: client-side only).
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined)
  })

  it('shows the gap line when the guess and the actual top group differ', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    await answerAllQuestions(user)
    await user.click(
      screen.getByRole('button', { name: 'Rassemblement National' })
    )
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(
      'Vous vous sentiez proche de Rassemblement National - vos réponses vous rapprochent de Socialistes et apparentés (75%)'
    )
  })
})
