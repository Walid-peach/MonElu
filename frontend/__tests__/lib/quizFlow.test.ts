import type { QuizMatchResponse, QuizQuestion, QuizShareResult } from '@/lib/api'
import {
  comparisonShare,
  initialQuizFlow,
  MIN_ANSWERS,
  reduce,
  type QuizFlowEvent,
  type QuizFlowState,
  type QuizStep,
} from '@/lib/quizFlow'

// The reducer only reads a question's count and a share's version and
// answers, so minimal fixtures stand in for the full API shapes.
const QUESTIONS = ['V1', 'V2', 'V3'].map(vote_id => ({ vote_id }) as QuizQuestion)
const RESULT = { top_matches: [], groups: [] } as unknown as QuizMatchResponse
const GIRONDE = { code: '33', nom: 'Gironde' }
const LANDES = { code: '40', nom: 'Landes' }

function share(overrides: Partial<QuizShareResult['result']> = {}): QuizShareResult {
  return {
    id: 'abc',
    result: { version: 'v1', answers: [{ vote_id: 'V1', position: 'pour' }], ...overrides },
    shared_at: '2026-11-11',
    share_url: 'https://example.test/quiz/s/abc',
  } as unknown as QuizShareResult
}

function loaded(entry: { deputyId?: string; compareId?: string } = {}): QuizFlowState {
  return reduce(initialQuizFlow(entry), {
    type: 'questionsLoaded',
    questions: QUESTIONS,
    version: 'v1',
  })
}

function at(step: QuizStep, base: QuizFlowState = loaded()): QuizFlowState {
  return { ...base, step }
}

const postal = (over: Partial<Extract<QuizStep, { name: 'postal' }>> = {}): QuizStep => ({
  name: 'postal',
  predictedGroup: null,
  lookup: { kind: 'idle' },
  matchFailed: false,
  ...over,
})

const matching = (over: Partial<Extract<QuizStep, { name: 'matching' }>> = {}): QuizStep => ({
  name: 'matching',
  predictedGroup: null,
  lookup: { kind: 'idle' },
  department: null,
  focusDeputyId: undefined,
  ...over,
})

const results: QuizStep = { name: 'results', predictedGroup: null, department: null, result: RESULT }

// Every valid transition: [description, from, event, expected step].
const TRANSITIONS: Array<[string, QuizFlowState, QuizFlowEvent, QuizStep]> = [
  [
    'loading -> intro when the question set arrives',
    initialQuizFlow({}),
    { type: 'questionsLoaded', questions: QUESTIONS, version: 'v1' },
    { name: 'intro' },
  ],
  ['loading -> loadFailed', initialQuizFlow({}), { type: 'questionsFailed' }, { name: 'loadFailed' }],
  ['intro -> first question', at({ name: 'intro' }), { type: 'started' }, { name: 'questions', index: 0 }],
  [
    'question -> next question',
    at({ name: 'questions', index: 0 }),
    { type: 'advanced' },
    { name: 'questions', index: 1 },
  ],
  ['last question -> group', at({ name: 'questions', index: 2 }), { type: 'advanced' }, { name: 'group' }],
  [
    'question -> previous question',
    at({ name: 'questions', index: 2 }),
    { type: 'wentBack' },
    { name: 'questions', index: 1 },
  ],
  ['first question -> intro', at({ name: 'questions', index: 0 }), { type: 'wentBack' }, { name: 'intro' }],
  ['group -> last question', at({ name: 'group' }), { type: 'wentBack' }, { name: 'questions', index: 2 }],
  [
    'group -> postal with the chosen group',
    at({ name: 'group' }),
    { type: 'groupAnswered', group: 'Écologiste et social', answeredCount: MIN_ANSWERS },
    postal({ predictedGroup: 'Écologiste et social' }),
  ],
  [
    'group skipped -> postal with no group',
    at({ name: 'group' }),
    { type: 'groupAnswered', group: null, answeredCount: MIN_ANSWERS },
    postal(),
  ],
  [
    'group -> notEnough below MIN_ANSWERS',
    at({ name: 'group' }),
    { type: 'groupAnswered', group: 'Écologiste et social', answeredCount: MIN_ANSWERS - 1 },
    { name: 'notEnough' },
  ],
  ['notEnough -> first question', at({ name: 'notEnough' }), { type: 'resumed' }, { name: 'questions', index: 0 }],
  ['postal -> last question', at(postal()), { type: 'wentBack' }, { name: 'questions', index: 2 }],
  [
    'postal lookup starts',
    at(postal({ lookup: { kind: 'notFound' } })),
    { type: 'postalLookupStarted' },
    postal({ lookup: { kind: 'resolving' } }),
  ],
  [
    'postal lookup finds nothing',
    at(postal({ lookup: { kind: 'resolving' } })),
    { type: 'postalLookupResolved', departments: [] },
    postal({ lookup: { kind: 'notFound' } }),
  ],
  [
    'postal lookup finds several departments',
    at(postal({ lookup: { kind: 'resolving' } })),
    { type: 'postalLookupResolved', departments: [GIRONDE, LANDES] },
    postal({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } }),
  ],
  [
    'postal lookup finds one department -> matching for it',
    at(postal({ predictedGroup: 'G', lookup: { kind: 'resolving' }, matchFailed: true })),
    { type: 'postalLookupResolved', departments: [GIRONDE] },
    matching({ predictedGroup: 'G', department: GIRONDE }),
  ],
  [
    'typing a new code clears the department choices',
    at(postal({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } })),
    { type: 'postalInputChanged' },
    postal(),
  ],
  [
    'typing during the match clears the choices too',
    at(matching({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } })),
    { type: 'postalInputChanged' },
    matching(),
  ],
  [
    'choosing one of several departments -> matching',
    at(postal({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } })),
    { type: 'matchRequested', department: LANDES },
    matching({ department: LANDES }),
  ],
  [
    'skipping the step keeps what the lookup showed',
    at(postal({ lookup: { kind: 'notFound' }, matchFailed: true })),
    { type: 'matchRequested', department: null },
    matching({ lookup: { kind: 'notFound' } }),
  ],
  [
    'skipping while a lookup runs drops that lookup',
    at(postal({ lookup: { kind: 'resolving' } })),
    { type: 'matchRequested', department: null },
    matching(),
  ],
  [
    'the deputy found from an address is the focus',
    at(postal()),
    { type: 'matchRequested', department: GIRONDE, addressDeputyId: 'PA1' },
    matching({ department: GIRONDE, focusDeputyId: 'PA1' }),
  ],
  [
    'matching -> results',
    at(matching({ predictedGroup: 'G', department: GIRONDE })),
    { type: 'matchSucceeded', result: RESULT },
    { name: 'results', predictedGroup: 'G', department: GIRONDE, result: RESULT },
  ],
  [
    'matching -> postal with the failure',
    at(matching({ predictedGroup: 'G', lookup: { kind: 'notFound' }, department: GIRONDE })),
    { type: 'matchFailed' },
    postal({ predictedGroup: 'G', lookup: { kind: 'notFound' }, matchFailed: true }),
  ],
  ['results -> intro on restart', at(results), { type: 'restarted' }, { name: 'intro' }],
]

describe('quizFlow reduce', () => {
  it.each(TRANSITIONS)('%s', (_name, from, event, expected) => {
    expect(reduce(from, event).step).toEqual(expected)
  })

  // Every step that exists, to check each event against all of them.
  const STEPS: QuizStep[] = [
    { name: 'loading' },
    { name: 'loadFailed' },
    { name: 'intro' },
    { name: 'questions', index: 1 },
    { name: 'group' },
    { name: 'notEnough' },
    postal(),
    postal({ lookup: { kind: 'resolving' } }),
    postal({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } }),
    matching(),
    matching({ lookup: { kind: 'choices', choices: [GIRONDE, LANDES] } }),
    results,
  ]

  const EVENTS: QuizFlowEvent[] = [
    { type: 'questionsLoaded', questions: QUESTIONS, version: 'v1' },
    { type: 'questionsFailed' },
    { type: 'started' },
    { type: 'advanced' },
    { type: 'wentBack' },
    { type: 'groupAnswered', group: null, answeredCount: MIN_ANSWERS },
    { type: 'resumed' },
    { type: 'postalLookupStarted' },
    { type: 'postalLookupResolved', departments: [GIRONDE] },
    { type: 'postalInputChanged' },
    { type: 'matchRequested', department: null },
    { type: 'matchSucceeded', result: RESULT },
    { type: 'matchFailed' },
    { type: 'restarted' },
  ]

  // Where each event is accepted; anywhere else it must be rejected.
  function accepts(step: QuizStep, event: QuizFlowEvent): boolean {
    switch (event.type) {
      case 'questionsLoaded':
      case 'questionsFailed':
        return step.name === 'loading'
      case 'started':
        return step.name === 'intro'
      case 'advanced':
        return step.name === 'questions'
      case 'wentBack':
        return step.name === 'questions' || step.name === 'group' || step.name === 'postal'
      case 'groupAnswered':
        return step.name === 'group'
      case 'resumed':
        return step.name === 'notEnough'
      case 'postalLookupStarted':
        return step.name === 'postal' && step.lookup.kind !== 'resolving'
      case 'postalLookupResolved':
        return step.name === 'postal' && step.lookup.kind === 'resolving'
      case 'postalInputChanged':
        return (step.name === 'postal' || step.name === 'matching') && step.lookup.kind === 'choices'
      case 'matchRequested':
        return step.name === 'postal'
      case 'matchSucceeded':
      case 'matchFailed':
        return step.name === 'matching'
      case 'restarted':
        return step.name === 'results'
      default:
        return false
    }
  }

  const PAIRS = STEPS.flatMap(step => EVENTS.map(event => [step, event] as const))

  it.each(PAIRS.filter(([s, e]) => !accepts(s, e)).map(([s, e]) => [s.name, e.type, s, e]))(
    'rejects %s + %s by returning the same state',
    (_s, _e, step, event) => {
      const from = at(step as QuizStep, step.name === 'loading' ? initialQuizFlow({}) : loaded())
      expect(reduce(from, event as QuizFlowEvent)).toBe(from)
    }
  )

  it.each(PAIRS.filter(([s, e]) => accepts(s, e)).map(([s, e]) => [s.name, e.type, s, e]))(
    'accepts %s + %s',
    (_s, _e, step, event) => {
      const from = at(step as QuizStep, step.name === 'loading' ? initialQuizFlow({}) : loaded())
      expect(reduce(from, event as QuizFlowEvent)).not.toBe(from)
    }
  )

  it('cannot start before the question set has loaded', () => {
    const state = { ...initialQuizFlow({}), step: { name: 'intro' } as QuizStep }
    expect(reduce(state, { type: 'started' })).toBe(state)
  })

  it('walks a whole quiz forward, back and through a restart', () => {
    const events: QuizFlowEvent[] = [
      { type: 'questionsLoaded', questions: QUESTIONS, version: 'v1' },
      { type: 'started' },
      { type: 'advanced' },
      { type: 'wentBack' },
      { type: 'advanced' },
      { type: 'advanced' },
      { type: 'advanced' },
      { type: 'groupAnswered', group: null, answeredCount: 3 },
      { type: 'wentBack' },
      { type: 'advanced' },
      { type: 'groupAnswered', group: 'G', answeredCount: 3 },
      { type: 'matchRequested', department: null },
      { type: 'matchSucceeded', result: RESULT },
      { type: 'restarted' },
    ]
    const names = events.reduce<{ state: QuizFlowState; names: string[] }>(
      (acc, event) => {
        const state = reduce(acc.state, event)
        const label = state.step.name === 'questions' ? `questions(${state.step.index})` : state.step.name
        return { state, names: [...acc.names, label] }
      },
      { state: initialQuizFlow({}), names: [] }
    ).names
    expect(names).toEqual([
      'intro',
      'questions(0)',
      'questions(1)',
      'questions(0)',
      'questions(1)',
      'questions(2)',
      'group',
      'postal',
      'questions(2)',
      'group',
      'postal',
      'matching',
      'results',
      'intro',
    ])
  })

  it('keeps the question set, the focus and the comparison across a restart', () => {
    const base = reduce(
      reduce(loaded({ deputyId: 'PA1', compareId: 'abc' }), {
        type: 'focusDeputyLoaded',
        deputyId: 'PA1',
        name: 'Jeanne Martin',
      }),
      { type: 'compareShareLoaded', compareId: 'abc', share: share() }
    )
    const restarted = reduce(at(results, base), { type: 'restarted' })
    expect(restarted.questions).toBe(QUESTIONS)
    expect(restarted.focus).toEqual({ deputyId: 'PA1', name: 'Jeanne Martin' })
    expect(restarted.compareShare).not.toBeNull()
  })

  // MON-183: /quiz?deputy=<id>
  describe('?deputy=<id> entry', () => {
    it('starts with the id and no name', () => {
      expect(initialQuizFlow({ deputyId: 'PA1' }).focus).toEqual({ deputyId: 'PA1', name: null })
      expect(initialQuizFlow({}).focus).toBeNull()
    })

    it('takes the name of that deputy, on any step', () => {
      const state = at({ name: 'group' }, loaded({ deputyId: 'PA1' }))
      const next = reduce(state, { type: 'focusDeputyLoaded', deputyId: 'PA1', name: 'Jeanne Martin' })
      expect(next.focus).toEqual({ deputyId: 'PA1', name: 'Jeanne Martin' })
      expect(next.step).toBe(state.step)
    })

    it('rejects a name for another deputy, or with no ?deputy= at all', () => {
      const withFocus = loaded({ deputyId: 'PA1' })
      expect(reduce(withFocus, { type: 'focusDeputyLoaded', deputyId: 'PA2', name: 'X' })).toBe(withFocus)
      const plain = loaded()
      expect(reduce(plain, { type: 'focusDeputyLoaded', deputyId: 'PA1', name: 'X' })).toBe(plain)
    })

    it('sends the focus once its name resolved', () => {
      const state = at(
        postal(),
        reduce(loaded({ deputyId: 'PA1' }), { type: 'focusDeputyLoaded', deputyId: 'PA1', name: 'J' })
      )
      const next = reduce(state, { type: 'matchRequested', department: null })
      expect(next.step).toEqual(matching({ focusDeputyId: 'PA1' }))
    })

    it('falls back to the plain quiz while the name is unknown', () => {
      const state = at(postal(), loaded({ deputyId: 'PA1' }))
      const next = reduce(state, { type: 'matchRequested', department: null })
      expect(next.step).toEqual(matching({ focusDeputyId: undefined }))
    })

    it('gives way to the deputy found from an address', () => {
      const state = at(
        postal(),
        reduce(loaded({ deputyId: 'PA1' }), { type: 'focusDeputyLoaded', deputyId: 'PA1', name: 'J' })
      )
      const next = reduce(state, { type: 'matchRequested', department: GIRONDE, addressDeputyId: 'PA9' })
      expect(next.step).toEqual(matching({ department: GIRONDE, focusDeputyId: 'PA9' }))
    })
  })

  // ADR-028: /quiz?compare=<share_id>
  describe('?compare=<share_id> entry', () => {
    it('keeps a share that carries the answers', () => {
      const state = loaded({ compareId: 'abc' })
      const next = reduce(state, { type: 'compareShareLoaded', compareId: 'abc', share: share() })
      expect(comparisonShare(next)).toEqual({ share: share(), versionMismatch: false })
    })

    it('rejects a share without answers, for another id, or with no ?compare= at all', () => {
      const state = loaded({ compareId: 'abc' })
      expect(
        reduce(state, { type: 'compareShareLoaded', compareId: 'abc', share: share({ answers: null }) })
      ).toBe(state)
      expect(reduce(state, { type: 'compareShareLoaded', compareId: 'xyz', share: share() })).toBe(state)
      const plain = loaded()
      expect(reduce(plain, { type: 'compareShareLoaded', compareId: 'abc', share: share() })).toBe(plain)
    })

    it('drops the comparison on another question-set version', () => {
      const state = reduce(loaded({ compareId: 'abc' }), {
        type: 'compareShareLoaded',
        compareId: 'abc',
        share: share({ version: 'v0' }),
      })
      expect(comparisonShare(state)).toEqual({ share: null, versionMismatch: true })
    })

    it('reports no mismatch before the question set is known', () => {
      const state = reduce(initialQuizFlow({ compareId: 'abc' }), {
        type: 'compareShareLoaded',
        compareId: 'abc',
        share: share({ version: 'v0' }),
      })
      expect(comparisonShare(state).versionMismatch).toBe(false)
    })
  })
})
