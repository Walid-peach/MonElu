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
      getShare: jest.fn(),
    },
    deputies: {
      get: jest.fn(),
    },
  },
}))

jest.mock('@/lib/postal', () => ({
  resolvePostalCodeToDepartment: jest.fn(),
}))

// MON-186: the swipe deck animates via framer-motion, whose rAF-driven
// springs and AnimatePresence exit delays are nondeterministic in jsdom.
// Render plain elements instead: motion.* becomes its tag with the motion
// props stripped (MotionValue style entries dropped), AnimatePresence
// renders its children synchronously, and the hooks return inert values.
jest.mock('framer-motion', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const MOTION_ONLY_PROPS = new Set([
    'drag', 'dragSnapToOrigin', 'dragElastic', 'onDragEnd', 'whileTap',
    'initial', 'animate', 'exit', 'transition', 'layout', 'layoutId',
  ])
  function clean(props: Record<string, unknown>) {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      if (MOTION_ONLY_PROPS.has(key)) continue
      if (key === 'style' && value && typeof value === 'object') {
        const style: Record<string, unknown> = {}
        for (const [sk, sv] of Object.entries(value as Record<string, unknown>)) {
          if (sv !== null && typeof sv === 'object') continue // MotionValue
          style[sk] = sv
        }
        out.style = style
        continue
      }
      out[key] = value
    }
    return out
  }
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const Component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) =>
          React.createElement(tag, { ...clean(props), ref })
        )
        Component.displayName = `motion.${tag}`
        return Component
      },
    }
  )
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useMotionValue: (initial: number) => ({ get: () => initial, set: () => {} }),
    useTransform: () => 0,
    useReducedMotion: () => false,
  }
})

// Overrides jest.setup.ts's blanket next/navigation mock so individual tests
// can simulate arriving at /quiz?deputy=<id> (MON-183) or /quiz?compare=<id> (MON-184).
const mockSearchParamsGet = jest.fn<string | null, [string]>(() => null)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
  usePathname: () => '/',
}))

import { api } from '@/lib/api'
import { resolvePostalCodeToDepartment } from '@/lib/postal'
import { track } from '@vercel/analytics/react'

const mockTrack = track as jest.Mock

const mockQuestions = api.quiz.questions as jest.Mock
const mockMatch = api.quiz.match as jest.Mock
const mockShare = api.quiz.share as jest.Mock
const mockDeputyGet = api.deputies.get as jest.Mock
const mockGetShare = api.quiz.getShare as jest.Mock
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
      votes_for: 291,
      votes_against: 241,
      abstentions: 12,
      result: 'adopté',
      vote_date: '2026-07-15',
    },
    {
      vote_id: 'V2',
      theme: 'Budget',
      question: 'Auriez-vous voté pour ou contre la question 2 ?',
      context: 'Contexte 2.',
      votes_for: 200,
      votes_against: 300,
      abstentions: 5,
      result: 'rejeté',
      vote_date: '2026-06-01',
    },
    {
      vote_id: 'V3',
      theme: 'Écologie',
      question: 'Auriez-vous voté pour ou contre la question 3 ?',
      context: 'Contexte 3.',
      votes_for: 310,
      votes_against: 220,
      abstentions: 8,
      result: 'adopté',
      vote_date: '2026-05-20',
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
  focus: null,
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

// MON-186: answering via the deck buttons advances immediately - there is no
// reveal step to click through anymore.
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
  mockSearchParamsGet.mockReturnValue(null)
})

describe('QuizClient', () => {
  it('walks intro → questions → postal skip → results with no persistence', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    render(<QuizClient />)

    expect(screen.getByText('Quel député vote comme vous ?')).toBeInTheDocument()
    await answerAllQuestions(user)
    // MON-176: privacy-safe funnel counter — fires once, on the intro CTA.
    expect(mockTrack).toHaveBeenCalledWith('quiz_start')
    await skipGroupStep(user)

    // Optional postal step reached after the last question.
    expect(screen.getByText('Et votre député à vous ?')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )

    await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
    // MON-176: fires once the match computation succeeds.
    expect(mockTrack).toHaveBeenCalledWith('quiz_complete')
    expect(mockMatch).toHaveBeenCalledWith(
      [
        { vote_id: 'V1', position: 'pour' },
        { vote_id: 'V2', position: 'pour' },
        { vote_id: 'V3', position: 'pour' },
      ],
      undefined,
      undefined
    )
    // Skipping the postal step yields full results minus the department section.
    expect(screen.getByText('Votre alignement par groupe')).toBeInTheDocument()
    expect(screen.queryByText('Les députés de votre département')).not.toBeInTheDocument()
  })

  it('shows a progress indicator, advances on answer, and supports undo', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    expect(screen.getByText('Question 1 / 3')).toBeInTheDocument()
    // MON-186: no reveal step - answering advances straight to the next card.
    await user.click(screen.getByRole('button', { name: 'Contre' }))
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/L’Assemblée a/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Revenir à la question précédente' }))
    expect(screen.getByText('Question 1 / 3')).toBeInTheDocument()

    // Undo from the first question returns to the intro.
    await user.click(screen.getByRole('button', { name: 'Revenir à la question précédente' }))
    expect(screen.getByText('Quel député vote comme vous ?')).toBeInTheDocument()
  })

  it('hides the scrutin outcome behind the details toggle, as percentages', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    // Collapsed by default: neither the context nor the outcome is visible.
    expect(screen.queryByText('Contexte 1.')).not.toBeInTheDocument()
    expect(screen.queryByText(/L’Assemblée a adopté ce texte/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Détails du scrutin' }))
    expect(screen.getByText('Contexte 1.')).toBeInTheDocument()
    expect(screen.getByText('L’Assemblée a adopté ce texte :')).toBeInTheDocument()
    // 291 / 241 / 12 of 544 votes cast - percentages, never raw counts.
    expect(screen.getByText('Pour : 53 %')).toBeInTheDocument()
    expect(screen.getByText('Contre : 44 %')).toBeInTheDocument()
    expect(screen.getByText('Abstention : 2 %')).toBeInTheDocument()
    expect(screen.queryByText(/291 pour/)).not.toBeInTheDocument()

    // Toggling closed hides it again, and it stays closed on the next card.
    await user.click(screen.getByRole('button', { name: 'Masquer les détails' }))
    expect(screen.queryByText(/L’Assemblée a adopté ce texte/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pour' }))
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/L’Assemblée a rejeté ce texte/)).not.toBeInTheDocument()
  })

  it('answers with the arrow keys and undoes with Backspace', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('Question 3 / 3')).toBeInTheDocument()
    await user.keyboard('{Backspace}')
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('{ArrowDown}')

    // Past the last card, the flow continues into the group step, with the
    // keyboard answers recorded (pour / contre / abstention).
    expect(screen.getByText('De quel groupe vous sentez-vous le plus proche ?')).toBeInTheDocument()
  })

  it('skipping a question advances directly and records no answer', async () => {
    const user = userEvent.setup()
    render(<QuizClient />)
    await user.click(await screen.findByRole('button', { name: 'Commencer le quiz' }))

    await user.click(screen.getByRole('button', { name: 'Passer cette question' }))
    expect(screen.getByText('Question 2 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/L’Assemblée a/)).not.toBeInTheDocument()
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
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), '33', undefined)
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
    // Lands back on the last question's card.
    expect(screen.getByText('Question 3 / 3')).toBeInTheDocument()
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
      '33',
      false
    )
    expect(writeText).toHaveBeenCalledWith('https://mon-elu.vercel.app/quiz/s/abc')
    // MON-176: fires once the share snapshot is actually created, not on
    // every click of the share button.
    expect(mockTrack).toHaveBeenCalledWith('quiz_share')
  })

  it('sends include_answers=true when the opt-in checkbox is checked', async () => {
    const user = userEvent.setup()
    mockMatch.mockResolvedValue(MATCH)
    mockShare.mockResolvedValue({
      id: 'abc',
      result: { ...MATCH, answers: null },
      shared_at: '2026-07-18T00:00:00Z',
      share_url: 'https://mon-elu.vercel.app/quiz/s/abc',
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    render(<QuizClient />)

    await answerAllQuestions(user)
    await skipGroupStep(user)
    await user.click(
      screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
    )
    await screen.findByText(/Vous votez à/)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Partager mes résultats' }))
    await screen.findByText('Lien copié !')

    expect(mockShare).toHaveBeenCalledWith(expect.any(Array), undefined, true)
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
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined, undefined)
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
    expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined, undefined)
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

  // MON-183: /quiz?deputy=<id> — personalized "Votez-vous comme X ?" entry.
  describe('personalized deputy-page entry (?deputy=<id>)', () => {
    beforeEach(() => {
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'deputy' ? 'PA100' : null))
    })

    it('personalizes the intro once the deputy name resolves', async () => {
      mockDeputyGet.mockResolvedValue({ deputy_id: 'PA100', full_name: 'Jeanne Martin' })
      render(<QuizClient />)

      await screen.findByText('Votez-vous comme Jeanne Martin ?')
      expect(mockDeputyGet).toHaveBeenCalledWith('PA100')
      expect(screen.queryByText('Quel député vote comme vous ?')).not.toBeInTheDocument()
    })

    it('sends focus_deputy_id on submit and renders the focus card', async () => {
      const user = userEvent.setup()
      mockDeputyGet.mockResolvedValue({ deputy_id: 'PA100', full_name: 'Jeanne Martin' })
      mockMatch.mockResolvedValue({ ...MATCH, focus: BEST })
      render(<QuizClient />)

      await screen.findByText('Votez-vous comme Jeanne Martin ?')
      await answerAllQuestions(user)
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )

      await screen.findByText('Vous votez à 83.3% comme Jeanne Martin - c’est votre meilleur match.')
      expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined, 'PA100')
    })

    it('shows an honest not-enough-votes state when the focus deputy has no comparable position', async () => {
      const user = userEvent.setup()
      mockDeputyGet.mockResolvedValue({ deputy_id: 'PA100', full_name: 'Jeanne Martin' })
      mockMatch.mockResolvedValue({
        ...MATCH,
        focus: { ...BEST, agreement_pct: null, matches: 0, compared: 0 },
      })
      render(<QuizClient />)

      await screen.findByText('Votez-vous comme Jeanne Martin ?')
      await answerAllQuestions(user)
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )

      await screen.findByText('Pas assez de votes comparables avec Jeanne Martin pour l’instant.')
    })

    it('falls back to the plain quiz when the deputy id is unknown', async () => {
      const user = userEvent.setup()
      mockDeputyGet.mockRejectedValue(new Error('API error: 422'))
      mockMatch.mockResolvedValue(MATCH)
      render(<QuizClient />)

      await waitFor(() => expect(mockDeputyGet).toHaveBeenCalledWith('PA100'))
      expect(screen.getByText('Quel député vote comme vous ?')).toBeInTheDocument()

      await answerAllQuestions(user)
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )

      await screen.findByText(/Vous votez à 83.3% comme Jeanne Martin/)
      // No personalization resolved — focus_deputy_id must not be sent.
      expect(mockMatch).toHaveBeenCalledWith(expect.any(Array), undefined, undefined)
    })
  })

  // -------------------------------------------------------------- friend comparison (MON-184, ADR-028)
  describe('friend comparison via ?compare=<id>', () => {
    const SHARED_ANSWERS = [
      { vote_id: 'V1', position: 'pour' },
      { vote_id: 'V2', position: 'contre' },
      { vote_id: 'V3', position: 'pour' },
    ]

    it('shows the head-to-head agreement above the standard results', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'compare' ? 'share-1' : null))
      mockGetShare.mockResolvedValue({
        id: 'share-1',
        result: { ...MATCH, version: QUESTIONS.version, answers: SHARED_ANSWERS },
        shared_at: '2026-07-18T00:00:00Z',
        share_url: 'https://mon-elu.vercel.app/quiz/s/share-1',
      })
      mockMatch.mockResolvedValue(MATCH)
      const user = userEvent.setup()
      render(<QuizClient />)

      await screen.findByText(/faites le test pour voir votre accord/i)
      await answerAllQuestions(user) // answers pour/pour/pour
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )

      // Own answers pour/pour/pour vs shared pour/contre/pour — 2/3 agree.
      await screen.findByText('Vous êtes d’accord avec ce résultat partagé sur 2/3 scrutins.')
    })

    it('falls back to the plain quiz with a notice on a question-set version mismatch', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'compare' ? 'share-old' : null))
      mockGetShare.mockResolvedValue({
        id: 'share-old',
        result: { ...MATCH, version: 'old-version', answers: SHARED_ANSWERS },
        shared_at: '2026-07-18T00:00:00Z',
        share_url: 'https://mon-elu.vercel.app/quiz/s/share-old',
      })
      mockMatch.mockResolvedValue(MATCH)
      const user = userEvent.setup()
      render(<QuizClient />)

      await screen.findByText(/version précédente du quiz/i)
      expect(screen.queryByText(/faites le test pour voir votre accord/i)).not.toBeInTheDocument()

      await answerAllQuestions(user)
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )
      await screen.findByText(/Vous votez à/)
      expect(screen.queryByText(/Vous êtes d’accord avec ce résultat partagé/)).not.toBeInTheDocument()
    })

    it('never carries the original sharer answers into the taker’s own share', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => (key === 'compare' ? 'share-1' : null))
      mockGetShare.mockResolvedValue({
        id: 'share-1',
        result: { ...MATCH, version: QUESTIONS.version, answers: SHARED_ANSWERS },
        shared_at: '2026-07-18T00:00:00Z',
        share_url: 'https://mon-elu.vercel.app/quiz/s/share-1',
      })
      mockMatch.mockResolvedValue(MATCH)
      mockShare.mockResolvedValue({
        id: 'own-share',
        result: { ...MATCH, answers: null },
        shared_at: '2026-07-18T00:00:00Z',
        share_url: 'https://mon-elu.vercel.app/quiz/s/own-share',
      })
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
      })
      const user = userEvent.setup()
      render(<QuizClient />)

      await answerAllQuestions(user)
      await skipGroupStep(user)
      await user.click(
        screen.getByRole('button', { name: 'Passer cette étape et voir mes résultats' })
      )
      await screen.findByText(/Vous votez à/)

      await user.click(screen.getByRole('button', { name: 'Partager mes résultats' }))
      await screen.findByText('Lien copié !')

      // The taker's own share payload is only their own answers, never the
      // fetched sharer's SHARED_ANSWERS.
      expect(mockShare).toHaveBeenCalledWith(
        [
          { vote_id: 'V1', position: 'pour' },
          { vote_id: 'V2', position: 'pour' },
          { vote_id: 'V3', position: 'pour' },
        ],
        undefined,
        false
      )
    })
  })
})
