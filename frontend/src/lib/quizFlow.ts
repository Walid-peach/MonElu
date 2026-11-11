/**
 * The web quiz flow as one explicit state and a pure reducer (#683).
 *
 * `QuizClient` keeps a single `useReducer(reduce, ...)` and renders from
 * `state.step`; every move between screens is an event here, so the graph can
 * be tested without rendering the page. The answers themselves, the postal code
 * being typed and the share options stay in the component: they are what the
 * visitor entered, not where the flow is.
 *
 * The web graph:
 *
 *     loading ──questionsLoaded──▶ intro ◀──────────────────────────┐
 *        └──questionsFailed──▶ loadFailed                           │
 *     intro ──started──▶ questions(0)                               │
 *     questions(i) ──advanced──▶ questions(i+1) | group (after last)│
 *     questions(i) ──wentBack──▶ questions(i-1) | intro (at 0)      │
 *     group ──groupAnswered──▶ postal | notEnough (< MIN_ANSWERS)   │
 *     group ──wentBack──▶ questions(last)                           │
 *     notEnough ──resumed──▶ questions(0)                           │
 *     postal ──wentBack──▶ questions(last)                          │
 *     postal ──postalLookupStarted / postalLookupResolved──▶ postal │
 *            (one department found goes straight to matching)       │
 *     postal ──matchRequested──▶ matching                           │
 *     matching ──matchSucceeded──▶ results ──restarted──────────────┘
 *     matching ──matchFailed──▶ postal (matchFailed: true)
 *
 * The iPhone app's graph (`QuizModel.Phase` in
 * `ios/Packages/MonEluFeatures/Sources/MonEluFeatures/Quiz/QuizModel.swift`):
 *
 *     intro ──start──▶ questions ──(after last, >= 3 answers)──▶ result
 *                         └──(after last, < 3 answers)──▶ notEnough ──resume──▶ questions(0)
 *     questions ──quit──▶ intro ──continueDeck──▶ questions (answers kept)
 *     result ──restart──▶ intro
 *
 * Where they differ:
 * - The web asks two extra steps after the deck, `group` (the visitor's own
 *   feeling, never sent, ADR-025) and `postal` (department or address,
 *   ADR-047). iOS goes from the deck straight to the result.
 * - Both have a "not enough answers" screen leading back to the first
 *   question. iOS shows it as soon as the deck ends; the web shows it after the
 *   `group` step, in the slot where `postal` would be. That is the web's
 *   behaviour before this reducer existed, kept as is.
 * - iOS loads the question set and the result through `Loader`s inside the
 *   `intro` and `result` phases; the web makes those loads states of their own
 *   (`loading`, `loadFailed`, `matching`), and a failed match returns to
 *   `postal` with `matchFailed` rather than showing a failed result.
 * - iOS can leave the deck for the intro and resume it; the web's back at the
 *   first question returns to the intro, and starting again begins at 0.
 *
 * An event that is not valid in the current step returns the state unchanged
 * (the same object, so React skips the render). That is also how a late async
 * answer is dropped: a postal lookup that resolves after the visitor already
 * asked for results, or a question set arriving twice.
 */
import type { QuizMatchResponse, QuizQuestion, QuizShareResult } from '@/lib/api'
import type { ResolvedDepartment } from '@/lib/postal'

// Mirrors MIN_ANSWERS in api/routers/quiz.py - the backend rejects fewer.
export const MIN_ANSWERS = 3

/** The postal-code lookup on the `postal` step. */
export type PostalLookup =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'notFound' }
  /** The code covers several departments (ADR-047 §6): the visitor picks one. */
  | { kind: 'choices'; choices: ResolvedDepartment[] }

export type MatchRequest = {
  /** The department sent to /quiz/match, if any. */
  department: ResolvedDepartment | null
  /** The deputy sent as `focus_deputy_id`, if any. */
  focusDeputyId: string | undefined
}

export type QuizStep =
  | { name: 'loading' }
  | { name: 'loadFailed' }
  | { name: 'intro' }
  | { name: 'questions'; index: number }
  | { name: 'group' }
  | { name: 'notEnough' }
  | {
      name: 'postal'
      /** The group chosen on the `group` step; stays in the browser (ADR-025). */
      predictedGroup: string | null
      lookup: PostalLookup
      matchFailed: boolean
    }
  | {
      name: 'matching'
      predictedGroup: string | null
      /** Kept so the postal screen shows the same thing while the match runs. */
      lookup: PostalLookup
      /**
       * What is sent to /quiz/match. The same object for the whole step, so
       * the component's request effect runs once per match even when the
       * lookup shown beside it changes.
       */
      request: MatchRequest
    }
  | {
      name: 'results'
      predictedGroup: string | null
      /** The department the result was computed for, which a share carries. */
      department: ResolvedDepartment | null
      result: QuizMatchResponse
    }

export type QuizFlowState = {
  step: QuizStep
  /** The question set, present from `intro` on. */
  questions: QuizQuestion[] | null
  questionsVersion: string | null
  /** `/quiz?deputy=<id>` (MON-183); the name arrives once the deputy is fetched. */
  focus: { deputyId: string; name: string | null } | null
  /** `/quiz?compare=<share_id>` (ADR-028). */
  compareId: string | null
  /** That share, kept only when it carries the sharer's answers. */
  compareShare: QuizShareResult | null
}

export type QuizFlowEvent =
  | { type: 'questionsLoaded'; questions: QuizQuestion[]; version: string }
  | { type: 'questionsFailed' }
  | { type: 'focusDeputyLoaded'; deputyId: string; name: string }
  | { type: 'compareShareLoaded'; compareId: string; share: QuizShareResult }
  | { type: 'started' }
  /** An answer or a skip on the current card: both move to the next one. */
  | { type: 'advanced' }
  | { type: 'wentBack' }
  | { type: 'groupAnswered'; group: string | null; answeredCount: number }
  | { type: 'resumed' }
  | { type: 'postalLookupStarted' }
  | { type: 'postalLookupResolved'; departments: ResolvedDepartment[] }
  | { type: 'postalInputChanged' }
  /**
   * `department` null skips the step. `addressDeputyId` is the deputy found
   * from the visitor's address (ADR-047), which takes the place of a
   * `?deputy=` focus for this computation.
   */
  | { type: 'matchRequested'; department: ResolvedDepartment | null; addressDeputyId?: string }
  | { type: 'matchSucceeded'; result: QuizMatchResponse }
  | { type: 'matchFailed' }
  | { type: 'restarted' }

export function initialQuizFlow(entry: {
  deputyId?: string | null
  compareId?: string | null
}): QuizFlowState {
  return {
    step: { name: 'loading' },
    questions: null,
    questionsVersion: null,
    focus: entry.deputyId ? { deputyId: entry.deputyId, name: null } : null,
    compareId: entry.compareId || null,
    compareShare: null,
  }
}

function withStep(state: QuizFlowState, step: QuizStep): QuizFlowState {
  return { ...state, step }
}

function lastQuestion(state: QuizFlowState): QuizStep {
  return { name: 'questions', index: Math.max((state.questions?.length ?? 1) - 1, 0) }
}

export function reduce(state: QuizFlowState, event: QuizFlowEvent): QuizFlowState {
  const { step } = state

  switch (event.type) {
    case 'questionsLoaded':
      if (step.name !== 'loading') return state
      return {
        ...state,
        step: { name: 'intro' },
        questions: event.questions,
        questionsVersion: event.version,
      }

    case 'questionsFailed':
      if (step.name !== 'loading') return state
      return withStep(state, { name: 'loadFailed' })

    // The two entries only change copy and what is sent or compared, so they
    // are accepted on any step; a reply for another id is dropped.
    case 'focusDeputyLoaded':
      if (state.focus?.deputyId !== event.deputyId) return state
      return { ...state, focus: { deputyId: event.deputyId, name: event.name } }

    case 'compareShareLoaded':
      if (state.compareId !== event.compareId || !event.share.result.answers) return state
      return { ...state, compareShare: event.share }

    case 'started':
      if (step.name !== 'intro' || !state.questions) return state
      return withStep(state, { name: 'questions', index: 0 })

    case 'advanced':
      if (step.name !== 'questions' || !state.questions) return state
      if (step.index < state.questions.length - 1) {
        return withStep(state, { name: 'questions', index: step.index + 1 })
      }
      return withStep(state, { name: 'group' })

    case 'wentBack':
      if (step.name === 'questions') {
        return withStep(
          state,
          step.index > 0 ? { name: 'questions', index: step.index - 1 } : { name: 'intro' }
        )
      }
      if (step.name === 'group' || step.name === 'postal') return withStep(state, lastQuestion(state))
      return state

    case 'groupAnswered':
      if (step.name !== 'group') return state
      if (event.answeredCount < MIN_ANSWERS) return withStep(state, { name: 'notEnough' })
      return withStep(state, {
        name: 'postal',
        predictedGroup: event.group,
        lookup: { kind: 'idle' },
        matchFailed: false,
      })

    case 'resumed':
      if (step.name !== 'notEnough') return state
      return withStep(state, { name: 'questions', index: 0 })

    case 'postalLookupStarted':
      if (step.name !== 'postal' || step.lookup.kind === 'resolving') return state
      return withStep(state, { ...step, lookup: { kind: 'resolving' } })

    case 'postalLookupResolved': {
      if (step.name !== 'postal' || step.lookup.kind !== 'resolving') return state
      const { departments } = event
      if (departments.length === 0) return withStep(state, { ...step, lookup: { kind: 'notFound' } })
      if (departments.length > 1) {
        return withStep(state, { ...step, lookup: { kind: 'choices', choices: departments } })
      }
      return reduce(withStep(state, { ...step, lookup: { kind: 'idle' } }), {
        type: 'matchRequested',
        department: departments[0]!,
      })
    }

    case 'postalInputChanged':
      if (step.name !== 'postal' && step.name !== 'matching') return state
      if (step.lookup.kind !== 'choices') return state
      return withStep(state, { ...step, lookup: { kind: 'idle' } })

    case 'matchRequested': {
      if (step.name !== 'postal') return state
      // Choosing a department settles the lookup; skipping leaves what it
      // showed, except a lookup still running, whose answer will be dropped.
      const lookup: PostalLookup =
        event.department || step.lookup.kind === 'resolving' ? { kind: 'idle' } : step.lookup
      return withStep(state, {
        name: 'matching',
        predictedGroup: step.predictedGroup,
        lookup,
        request: {
          department: event.department,
          focusDeputyId: event.addressDeputyId ?? focusDeputyForMatch(state),
        },
      })
    }

    case 'matchSucceeded':
      if (step.name !== 'matching') return state
      return withStep(state, {
        name: 'results',
        predictedGroup: step.predictedGroup,
        department: step.request.department,
        result: event.result,
      })

    case 'matchFailed':
      if (step.name !== 'matching') return state
      return withStep(state, {
        name: 'postal',
        predictedGroup: step.predictedGroup,
        lookup: step.lookup,
        matchFailed: true,
      })

    case 'restarted':
      if (step.name !== 'results') return state
      return withStep(state, { name: 'intro' })
  }
}

/**
 * The `?deputy=` focus sent to /quiz/match: only once its name resolved, so an
 * unknown id falls back to the plain quiz (MON-183).
 */
function focusDeputyForMatch(state: QuizFlowState): string | undefined {
  return state.focus?.name ? state.focus.deputyId : undefined
}

/**
 * The share to compare against, and whether one was dropped because it was
 * answered on another version of the question set (ADR-028).
 */
export function comparisonShare(state: QuizFlowState): {
  share: QuizShareResult | null
  versionMismatch: boolean
} {
  const { compareShare, questionsVersion } = state
  const versionMismatch =
    compareShare !== null && questionsVersion !== null && compareShare.result.version !== questionsVersion
  return { share: versionMismatch ? null : compareShare, versionMismatch }
}
