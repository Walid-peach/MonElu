'use client'
import { useEffect, useReducer, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { track } from '@vercel/analytics/react'
import { api } from '@/lib/api'
import type { QuizAnswerPosition } from '@/lib/api'
import { resolvePostalCodeToDepartments } from '@/lib/postal'
import { FindMyDeputy } from '@/components/FindMyDeputy'
import { CANONICAL_GROUP_LABELS } from '@/lib/groups'
import { partyHex } from '@/lib/utils'
import { pctLabel, card, QuizResultSections } from './QuizResultSections'
import { QuizResultCard } from './QuizResultCard'
import { QuizDeck } from './QuizDeck'
import { comparisonShare, initialQuizFlow, MIN_ANSWERS, reduce } from '@/lib/quizFlow'

const NAVY = 'var(--dp-text)'
const CREAM = 'var(--dp-page-bg)'
const LINE = 'var(--dp-border)'
const ACCENT = 'var(--dp-cta-bg)'
const RED = 'var(--dp-red)'
const GRAY = 'var(--dp-text-secondary)'

const kicker: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: RED,
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <div className="px-5 pb-24 pt-6 md:pt-10" style={{ maxWidth: 760, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

// Lazily creates the share snapshot on first click (POST /quiz/share sends the
// answers; the server recomputes the result before storing, ADR-025), then
// hands the URL to the native share sheet or the clipboard.
//
// `includeAnswers` (ADR-028, MON-184): opt-in, default off — a checkbox lets
// the sharer additionally store their raw answers so a visitor can run a
// friend comparison. `includeDepartment` (MON-175): opt-out, default on — a
// checkbox lets the sharer drop the "my_department" section from the stored
// snapshot; unchecking it simply omits `department` from the /quiz/share
// call, so the server never computes or stores it. The disclosure composes
// the base share-link notice with, only when relevant, the department and
// answers-included notices.
function ShareResultButton({
  answers,
  department,
}: {
  answers: Array<{ vote_id: string; position: QuizAnswerPosition }>
  department?: string
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'creating' | 'copied' | 'error'>('idle')
  const [includeAnswers, setIncludeAnswers] = useState(false)
  const [includeDepartment, setIncludeDepartment] = useState(true)

  async function handleShare() {
    let url = shareUrl
    if (!url) {
      setState('creating')
      try {
        const share = await api.quiz.share(
          answers,
          department && includeDepartment ? department : undefined,
          includeAnswers
        )
        url = share.share_url
        setShareUrl(url)
        track('quiz_share')
      } catch {
        setState('error')
        return
      }
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url, title: 'Quel député vote comme vous ? - MonÉlu' })
        setState('idle')
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setState('idle')
          return
        }
        // Share API genuinely unavailable — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <button
        onClick={handleShare}
        disabled={state === 'creating'}
        style={{
          background: ACCENT, color: '#fff', padding: '11px 22px', borderRadius: 9,
          fontWeight: 600, fontSize: 14.5, border: 'none',
          cursor: state === 'creating' ? 'wait' : 'pointer',
          boxShadow: '0 2px 8px var(--dp-cta-shadow)',
        }}
      >
        {state === 'creating'
          ? 'Création du lien…'
          : state === 'copied'
            ? 'Lien copié !'
            : state === 'error'
              ? 'Échec - réessayer'
              : 'Partager mes résultats'}
      </button>
      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: GRAY, maxWidth: 420, textAlign: 'left' }}>
        Le lien créé est public.
      </span>
      {department && (
        <label
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 420,
            fontSize: 12.5, lineHeight: 1.5, color: GRAY, cursor: shareUrl ? 'not-allowed' : 'pointer',
            textAlign: 'left',
          }}
        >
          <input
            type="checkbox"
            checked={includeDepartment}
            disabled={shareUrl !== null}
            onChange={e => setIncludeDepartment(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            {includeDepartment
              ? 'Montrer mon département sur le lien.'
              : 'Mon département ne sera pas inclus.'}
          </span>
        </label>
      )}
      <label
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 420,
          fontSize: 12.5, lineHeight: 1.5, color: GRAY, cursor: shareUrl ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <input
          type="checkbox"
          checked={includeAnswers}
          disabled={shareUrl !== null}
          onChange={e => setIncludeAnswers(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          {includeAnswers
            ? 'Vos réponses seront aussi incluses et visibles par quiconque ouvre le lien, pour permettre à un ami de se comparer à vous. Votre carte gardera le bloc « vous votez pour ».'
            : 'Inclure mes réponses pour permettre à un ami de se comparer à moi, et garder le bloc « vous votez pour » sur ma carte.'}
        </span>
      </label>
    </div>
  )
}

// Head-to-head agreement between the current taker's own answers and a
// previously shared result — computed entirely client-side (ADR-028), no
// /quiz/compare endpoint and nothing persisted or logged.
type ComparisonRow = { vote_id: string; own: QuizAnswerPosition; theirs: QuizAnswerPosition; agree: boolean }

function computeComparison(
  answers: Record<string, QuizAnswerPosition>,
  theirAnswers: Array<{ vote_id: string; position: QuizAnswerPosition }>
): { agree: number; total: number; rows: ComparisonRow[] } | null {
  const rows = theirAnswers
    .filter(a => answers[a.vote_id] !== undefined)
    .map(a => ({
      vote_id: a.vote_id,
      own: answers[a.vote_id],
      theirs: a.position,
      agree: answers[a.vote_id] === a.position,
    }))
  if (rows.length === 0) return null
  return { agree: rows.filter(r => r.agree).length, total: rows.length, rows }
}

export function QuizClient() {
  const searchParams = useSearchParams()
  const focusDeputyId = searchParams.get('deputy') || undefined
  const compareId = searchParams.get('compare')

  // Where the flow is lives in one state, moved only by the reducer (#683).
  const [state, dispatch] = useReducer(
    reduce,
    { deputyId: focusDeputyId, compareId },
    initialQuizFlow
  )
  const { step, questions } = state
  const [answers, setAnswers] = useState<Record<string, QuizAnswerPosition>>({})
  const [postalInput, setPostalInput] = useState('')

  useEffect(() => {
    let cancelled = false
    api.quiz
      .questions()
      .then(res => {
        if (!cancelled) {
          dispatch({ type: 'questionsLoaded', questions: res.questions, version: res.version })
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'questionsFailed' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // MON-183: personalizes the intro when arriving from a deputy's profile
  // page ("Votez-vous comme X ?"). Only fetches the deputy's name for copy -
  // focus_deputy_id itself is sent to /quiz/match at submit time.
  useEffect(() => {
    if (!focusDeputyId) return
    let cancelled = false
    api.deputies
      .get(focusDeputyId)
      .then(d => {
        if (!cancelled) {
          dispatch({ type: 'focusDeputyLoaded', deputyId: focusDeputyId, name: d.full_name })
        }
      })
      .catch(() => {
        // Unknown/invalid id - fall back to the plain, unpersonalized quiz.
      })
    return () => {
      cancelled = true
    }
  }, [focusDeputyId])

  // Friend comparison (ADR-028, MON-184): the share fetched from ?compare=<id>.
  useEffect(() => {
    if (!compareId) return
    let cancelled = false
    api.quiz
      .getShare(compareId)
      .then(share => {
        if (!cancelled) dispatch({ type: 'compareShareLoaded', compareId, share })
      })
      .catch(() => {
        // Invalid or missing share id - fall back to the plain quiz silently.
      })
    return () => {
      cancelled = true
    }
  }, [compareId])

  // The match runs whenever the reducer enters `matching`, whichever way it got
  // there (a skip, a department, an address, a postal code with one department).
  // It depends on the step's `request`, which stays the same object for the
  // whole step, so it runs once per match.
  const matchRequest = step.name === 'matching' ? step.request : null
  useEffect(() => {
    if (!matchRequest) return
    let cancelled = false
    const payload = Object.entries(answers).map(([vote_id, position]) => ({ vote_id, position }))
    api.quiz
      .match(payload, matchRequest.department?.code, matchRequest.focusDeputyId)
      .then(result => {
        if (cancelled) return
        dispatch({ type: 'matchSucceeded', result })
        track('quiz_complete')
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'matchFailed' })
      })
    return () => {
      cancelled = true
    }
  }, [matchRequest, answers])

  // Question-set version mismatch degrades to the plain flow with a notice
  // (ADR-028): answers are keyed to a specific question-set version.
  const { share: effectiveCompareShare, versionMismatch } = comparisonShare(state)
  const compareNotice = versionMismatch
    ? 'Ce lien de comparaison correspond à une version précédente du quiz - voici le quiz actuel, sans comparaison.'
    : null

  const comparison =
    effectiveCompareShare?.result.answers != null
      ? computeComparison(answers, effectiveCompareShare.result.answers)
      : null

  const answeredCount = Object.keys(answers).length
  const focusDeputyName = state.focus?.name ?? null

  // MON-186: answering advances immediately - the swipe deck has no blocking
  // reveal step; the scrutin outcome lives behind the card's details toggle.
  function answer(voteId: string, position: QuizAnswerPosition) {
    setAnswers(prev => ({ ...prev, [voteId]: position }))
    dispatch({ type: 'advanced' })
  }

  function skip(voteId: string) {
    setAnswers(prev => {
      const next = { ...prev }
      delete next[voteId]
      return next
    })
    dispatch({ type: 'advanced' })
  }

  function back() {
    dispatch({ type: 'wentBack' })
  }

  async function confirmPostal() {
    dispatch({ type: 'postalLookupStarted' })
    const departments = await resolvePostalCodeToDepartments(postalInput.trim())
    dispatch({ type: 'postalLookupResolved', departments })
  }

  function restart() {
    dispatch({ type: 'restarted' })
    setAnswers({})
    setPostalInput('')
  }

  // ------------------------------------------------------------------ intro
  // `loading` and `loadFailed` are the intro too: its button waits for the
  // question set, or gives way to the error.
  if (step.name === 'loading' || step.name === 'loadFailed' || step.name === 'intro') {
    // One tree for both widths, so the page keeps a single h1 and each notice
    // once. Below md it follows the canvas "Quiz": left-aligned, the three
    // steps spelled out instead of the paragraph, and a full-width button.
    return (
      <Shell>
        <div className="flex flex-col gap-4 md:block md:pt-10 md:text-center">
          <div className="md:mb-4" style={kicker}>Le quiz</div>
          <h1
            className="font-newsreader text-[34px] max-md:leading-[1.08] md:text-[clamp(30px,5vw,46px)]"
            style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}
          >
            {focusDeputyName ? `Votez-vous comme ${focusDeputyName} ?` : 'Quel député vote comme vous ?'}
          </h1>
          <p className="hidden md:block" style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: 'var(--dp-text-secondary)' }}>
            {focusDeputyName ? (
              <>Répondez aux 10 scrutins et voyez votre accord avec {focusDeputyName} - et avec les 577 députés.</>
            ) : (
              <>
                Une dizaine de vrais scrutins de l’Assemblée nationale, posés en français courant.
                Répondez pour, contre ou abstention - à la fin, on compare vos réponses aux votes
                réels des 577 députés.
              </>
            )}
          </p>
          <ol className="flex flex-col gap-2.5 md:hidden">
            {[
              'Dix vrais scrutins de l’Assemblée, posés en français courant.',
              'Pour, contre ou abstention : glissez la carte ou touchez un bouton.',
              focusDeputyName
                ? `Votre accord avec ${focusDeputyName}, et avec les 577 députés.`
                : 'Les députés et les groupes qui votent le plus comme vous.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded-2xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-3.5">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[color:var(--dp-track-bg)] font-mono text-sm font-bold text-[color:var(--dp-text)]">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-snug text-[color:var(--dp-text)]">{step}</span>
              </li>
            ))}
          </ol>
          <p className="md:mx-auto md:mt-3.5" style={{ maxWidth: 520, fontSize: 13.5, color: GRAY }}>
            Sans compte. Vos réponses restent dans votre navigateur : rien n’est enregistré
            tant que vous ne partagez pas vos résultats.
          </p>
          {effectiveCompareShare && (
            <p className="md:mx-auto md:mt-[18px]" style={{ maxWidth: 520, fontSize: 14, color: NAVY, fontWeight: 600 }}>
              Faites le test pour voir votre accord avec le résultat qu’on vous a partagé.
            </p>
          )}
          {compareNotice && (
            <p className="md:mx-auto md:mt-[18px]" style={{ maxWidth: 520, fontSize: 13.5, color: RED }}>{compareNotice}</p>
          )}
          {step.name === 'loadFailed' ? (
            <p className="md:mt-7" style={{ fontSize: 15, color: RED }}>
              Impossible de charger le questionnaire pour le moment. Réessayez dans un instant.
            </p>
          ) : (
            <button
              onClick={() => {
                track('quiz_start')
                dispatch({ type: 'started' })
                // The intro is taller than the deck on a phone: without this
                // the deck opens scrolled past its counter, under the top bar.
                window.scrollTo({ top: 0 })
              }}
              disabled={!questions}
              className="h-[54px] w-full justify-center rounded-[14px] text-base md:mt-8 md:h-auto md:w-auto md:rounded-[9px] md:px-[30px] md:py-[13px] md:text-[15.5px]"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: ACCENT,
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                cursor: questions ? 'pointer' : 'wait',
                opacity: questions ? 1 : 0.6,
                boxShadow: '0 2px 8px var(--dp-cta-shadow)',
              }}
            >
              {questions ? 'Commencer le quiz' : 'Chargement…'}
            </button>
          )}
        </div>
      </Shell>
    )
  }

  // -------------------------------------------------------------- questions
  // MON-186/187: swipe deck - one card per scrutin, gestures + circular
  // buttons + keyboard share one commit path inside QuizDeck, which also
  // owns the header (undo, progress, theme) to match the approved mockup.
  if (step.name === 'questions' && questions) {
    return (
      <Shell>
        <QuizDeck
          questions={questions}
          index={step.index}
          onAnswer={answer}
          onSkip={skip}
          onBack={back}
        />
      </Shell>
    )
  }

  // ------------------------------------------------------------------ group
  if (step.name === 'group') {
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Encore une chose</div>
        <h2
          className="font-newsreader text-[clamp(24px,3.5vw,34px)]"
          style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}
        >
          De quel groupe vous sentez-vous le plus proche ?
        </h2>
        <p style={{ margin: '16px 0 24px', fontSize: 15.5, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
          Facultatif - cette réponse reste dans votre navigateur, elle n’est jamais envoyée ni
          enregistrée. À la fin, on compare votre ressenti à vos votes réels.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CANONICAL_GROUP_LABELS.map(label => {
            const hex = partyHex(label)
            return (
              <button
                key={label}
                onClick={() => dispatch({ type: 'groupAnswered', group: label, answeredCount })}
                style={{
                  padding: '13px 18px',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 15,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: hex,
                  background: 'var(--dp-card-bg)',
                  border: `2px solid ${hex}`,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => dispatch({ type: 'groupAnswered', group: null, answeredCount })}
            style={{
              background: ACCENT, color: '#fff', padding: '12px 26px', borderRadius: 9,
              fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer',
            }}
          >
            Je préfère ne pas dire / passer
          </button>
          <button
            onClick={back}
            style={{ fontSize: 14.5, color: GRAY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
          >
            ← Retour
          </button>
        </div>
      </Shell>
    )
  }

  // ----------------------------------------------------------------- postal
  // `notEnough` takes the postal step's place when too few answers were
  // expressed; `matching` is the postal step with its buttons busy.
  if (step.name === 'notEnough' || step.name === 'postal' || step.name === 'matching') {
    const lookup = step.name === 'notEnough' ? null : step.lookup
    const busy = step.name === 'matching'
    const resolving = lookup?.kind === 'resolving'
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Dernière étape</div>
        {step.name === 'notEnough' ? (
          <>
            <h2
              className="font-newsreader text-[clamp(24px,3.5vw,34px)]"
              style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}
            >
              Encore quelques réponses
            </h2>
            <p style={{ margin: '16px 0 28px', fontSize: 15.5, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
              Il faut au moins {MIN_ANSWERS} réponses exprimées pour un résultat significatif -
              vous en avez donné {answeredCount}.
            </p>
            <button
              onClick={() => dispatch({ type: 'resumed' })}
              style={{
                background: ACCENT, color: '#fff', padding: '12px 26px', borderRadius: 9,
                fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer',
              }}
            >
              Reprendre les questions
            </button>
          </>
        ) : (
          <>
            <h2
              className="font-newsreader text-[clamp(24px,3.5vw,34px)]"
              style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}
            >
              Et votre député à vous ?
            </h2>
            <p style={{ margin: '16px 0 24px', fontSize: 15.5, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
              Donnez votre adresse pour comparer aussi vos réponses aux votes de votre député, et à
              ceux des députés de votre département. Facultatif.
            </p>
            <FindMyDeputy
              actionLabel="Comparer avec ce député"
              busy={busy}
              onChoose={seat => {
                if (!seat.deputy) return
                // The department the results show, and that a share carries.
                dispatch({
                  type: 'matchRequested',
                  department: { code: seat.department_code, nom: seat.department_name },
                  addressDeputyId: seat.deputy.deputy_id,
                })
              }}
            />
            <p style={{ margin: '28px 0 10px', fontSize: 15, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
              Ou donnez seulement votre code postal, pour comparer vos réponses aux députés de votre
              département. Seul le département est envoyé à MonÉlu, et il n’est conservé que si vous
              partagez votre résultat.
            </p>
            <form
              onSubmit={e => {
                e.preventDefault()
                confirmPostal()
              }}
              style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
            >
              <input
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                placeholder="Code postal (ex. 33000)"
                value={postalInput}
                onChange={e => {
                  setPostalInput(e.target.value)
                  dispatch({ type: 'postalInputChanged' })
                }}
                aria-label="Code postal"
                style={{
                  flex: '1 1 200px', padding: '12px 16px', borderRadius: 9,
                  border: `1px solid ${LINE}`, fontSize: 15.5, color: NAVY, background: 'var(--dp-card-bg)',
                }}
              />
              <button
                type="submit"
                disabled={resolving || busy || !/^\d{5}$/.test(postalInput.trim())}
                style={{
                  background: ACCENT, color: '#fff', padding: '12px 26px', borderRadius: 9,
                  fontWeight: 600, fontSize: 15, border: 'none',
                  cursor: resolving || busy ? 'wait' : 'pointer',
                  opacity: resolving || busy || !/^\d{5}$/.test(postalInput.trim()) ? 0.6 : 1,
                }}
              >
                {resolving || busy ? 'Calcul…' : 'Voir mes résultats'}
              </button>
            </form>
            {lookup?.kind === 'notFound' && (
              <p style={{ marginTop: 12, fontSize: 14, color: RED }}>
                Code postal introuvable - vérifiez les 5 chiffres, ou passez cette étape.
              </p>
            )}
            {lookup?.kind === 'choices' && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 14.5, color: 'var(--dp-text-secondary)' }}>
                  Ce code postal couvre plusieurs départements. Lequel est le vôtre ?
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {lookup.choices.map(d => (
                    <button
                      key={d.code}
                      onClick={() => dispatch({ type: 'matchRequested', department: d })}
                      disabled={busy}
                      style={{
                        background: 'var(--dp-card-bg)', color: NAVY, padding: '10px 18px', borderRadius: 9,
                        fontWeight: 600, fontSize: 14.5, border: `1px solid ${LINE}`, cursor: 'pointer',
                      }}
                    >
                      {d.nom}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step.name === 'postal' && step.matchFailed && (
              <p style={{ marginTop: 12, fontSize: 14, color: RED }}>
                Le calcul a échoué. Réessayez dans un instant.
              </p>
            )}
            <div style={{ marginTop: 22, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => dispatch({ type: 'matchRequested', department: null })}
                disabled={busy}
                style={{ fontSize: 14.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
              >
                {busy ? 'Calcul…' : 'Passer cette étape et voir mes résultats'}
              </button>
              <button
                onClick={back}
                disabled={busy}
                style={{ fontSize: 14.5, color: GRAY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
              >
                ← Revenir aux questions
              </button>
            </div>
          </>
        )}
      </Shell>
    )
  }

  // ---------------------------------------------------------------- results
  if (step.name === 'results') {
    const { result, predictedGroup, department } = step
    const answerPayload = Object.entries(answers).map(([vote_id, position]) => ({
      vote_id,
      position,
    }))
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Vos résultats</div>
        {/* Same component as the share page (MON-203). One block differs by
            design: "vous votez pour" names the themes you answered, so it
            only survives into a share when you opt into publishing your
            answers (ADR-028) — see ShareResultButton's checkbox copy. */}
        <div style={{ marginBottom: 40 }}>
          <QuizResultCard result={result} />
        </div>
        {result.focus && (
          <div
            style={{
              ...card,
              marginBottom: 24,
              borderLeft: `4px solid ${partyHex(result.focus.party)}`,
            }}
          >
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
              {result.focus.agreement_pct === null
                ? `Pas assez de votes comparables avec ${result.focus.full_name} pour l’instant.`
                : result.top_matches[0] && result.top_matches[0].deputy_id === result.focus.deputy_id
                  ? `Vous votez à ${pctLabel(result.focus)} comme ${result.focus.full_name} - c’est votre meilleur match.`
                  : `Vous votez à ${pctLabel(result.focus)} comme ${result.focus.full_name}${
                      result.top_matches[0]
                        ? ` - votre meilleur match est ${result.top_matches[0].full_name} (${pctLabel(result.top_matches[0])})`
                        : ''
                    }`}
            </p>
          </div>
        )}
        {predictedGroup && result.groups.length > 0 && (
          <div
            style={{
              ...card,
              marginBottom: 24,
              borderLeft: `4px solid ${partyHex(result.groups[0].party)}`,
            }}
          >
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
              {result.groups[0].party === predictedGroup
                ? `Vous aviez vu juste : vos réponses vous placent bien près de ${result.groups[0].party} (${result.groups[0].agreement_pct}%)`
                : `Vous vous sentiez proche de ${predictedGroup} - vos réponses vous rapprochent de ${result.groups[0].party} (${result.groups[0].agreement_pct}%)`}
            </p>
          </div>
        )}

        {comparison && (
          <div style={{ ...card, marginBottom: 24, borderLeft: `4px solid ${ACCENT}` }}>
            <p style={{ margin: '0 0 12px', fontSize: 15.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
              Vous êtes d’accord avec ce résultat partagé sur {comparison.agree}/{comparison.total} scrutin
              {comparison.total > 1 ? 's' : ''}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comparison.rows.map(row => {
                const q = questions?.find(q => q.vote_id === row.vote_id)
                return (
                  <div
                    key={row.vote_id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', gap: 12,
                      fontSize: 13.5, color: row.agree ? NAVY : GRAY,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{q?.question ?? row.vote_id}</span>
                    <span style={{ fontWeight: 700, color: row.agree ? ACCENT : RED, whiteSpace: 'nowrap' }}>
                      {row.agree ? 'Accord' : 'Désaccord'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <QuizResultSections
          result={result}
          resolvedNom={department?.nom}
          questions={questions ?? undefined}
          answers={answers}
        />

        <section style={{ marginTop: 48, ...card, textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
            Partagez votre résultat, ou suivez un de ces députés vote après vote.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {result.top_matches.length > 0 && (
              <ShareResultButton answers={answerPayload} department={department?.code} />
            )}
            <Link
              href="/mon-depute"
              style={{
                fontSize: 14.5, color: NAVY, background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`,
                padding: '11px 22px', borderRadius: 9, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Ouvrir Mon député
            </Link>
            <button
              onClick={restart}
              style={{
                fontSize: 14.5, color: NAVY, background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`,
                padding: '11px 22px', borderRadius: 9, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Refaire le quiz
            </button>
          </div>
        </section>
      </Shell>
    )
  }

  return <Shell>{null}</Shell>
}
