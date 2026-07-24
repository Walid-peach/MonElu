'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { QuizAnswerPosition, QuizMatchResponse, QuizQuestion, QuizShareResult } from '@/lib/api'
import { resolvePostalCodeToDepartment } from '@/lib/postal'
import type { ResolvedDepartment } from '@/lib/postal'
import { POS } from '@/lib/vote-position'
import { CANONICAL_GROUP_LABELS } from '@/lib/groups'
import { partyHex } from '@/lib/utils'
import { pctLabel, card, QuizResultSections } from './QuizResultSections'

const NAVY = 'var(--dp-text)'
const CREAM = 'var(--dp-page-bg)'
const LINE = 'var(--dp-border)'
const ACCENT = 'var(--dp-cta-bg)'
const RED = 'var(--dp-red)'
const GRAY = 'var(--dp-text-secondary)'

// Mirrors MIN_ANSWERS in api/routers/quiz.py — the backend rejects fewer.
const MIN_ANSWERS = 3

type Phase = 'intro' | 'questions' | 'group' | 'postal' | 'results'

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
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 96px' }}>{children}</div>
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
      } catch {
        setState('error')
        return
      }
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url, title: 'Quel député vote comme vous ? — MonÉlu' })
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
              ? 'Échec — réessayer'
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
            ? 'Vos réponses seront aussi incluses et visibles par quiconque ouvre le lien, pour permettre à un ami de se comparer à vous.'
            : 'Inclure mes réponses pour permettre à un ami de se comparer à moi.'}
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

  const [phase, setPhase] = useState<Phase>('intro')
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [questionsVersion, setQuestionsVersion] = useState<string | null>(null)
  const [questionsError, setQuestionsError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, QuizAnswerPosition>>({})
  // vote_id currently showing its reveal panel, or null. Cleared on advance
  // and on back navigation — the reveal never persists across questions.
  const [revealVoteId, setRevealVoteId] = useState<string | null>(null)
  const [predictedGroup, setPredictedGroup] = useState<string | null>(null)
  const [focusDeputyName, setFocusDeputyName] = useState<string | null>(null)

  const [postalInput, setPostalInput] = useState('')
  const [resolving, setResolving] = useState(false)
  const [postalError, setPostalError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<ResolvedDepartment | null>(null)

  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState(false)
  const [result, setResult] = useState<QuizMatchResponse | null>(null)

  // Friend comparison (ADR-028, MON-184): the share fetched from ?compare=<id>.
  const [compareShare, setCompareShare] = useState<QuizShareResult | null>(null)

  useEffect(() => {
    let cancelled = false
    api.quiz
      .questions()
      .then(res => {
        if (!cancelled) {
          setQuestions(res.questions)
          setQuestionsVersion(res.version)
        }
      })
      .catch(() => {
        if (!cancelled) setQuestionsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // MON-183: personalizes the intro when arriving from a deputy's profile
  // page ("Votez-vous comme X ?"). Only fetches the deputy's name for copy —
  // focus_deputy_id itself is sent to /quiz/match at submit time.
  useEffect(() => {
    if (!focusDeputyId) return
    let cancelled = false
    api.deputies
      .get(focusDeputyId)
      .then(d => {
        if (!cancelled) setFocusDeputyName(d.full_name)
      })
      .catch(() => {
        // Unknown/invalid id — fall back to the plain, unpersonalized quiz.
      })
    return () => {
      cancelled = true
    }
  }, [focusDeputyId])

  useEffect(() => {
    if (!compareId) return
    let cancelled = false
    api.quiz
      .getShare(compareId)
      .then(share => {
        if (!cancelled && share.result.answers) setCompareShare(share)
      })
      .catch(() => {
        // Invalid or missing share id — fall back to the plain quiz silently.
      })
    return () => {
      cancelled = true
    }
  }, [compareId])

  // Question-set version mismatch degrades to the plain flow with a notice
  // (ADR-028): answers are keyed to a specific question-set version. Derived
  // at render time rather than via an effect, so no cascading setState.
  const versionMismatch =
    compareShare !== null && questionsVersion !== null && compareShare.result.version !== questionsVersion
  const effectiveCompareShare = versionMismatch ? null : compareShare
  const compareNotice = versionMismatch
    ? 'Ce lien de comparaison correspond à une version précédente du quiz — voici le quiz actuel, sans comparaison.'
    : null

  const comparison =
    effectiveCompareShare?.result.answers != null
      ? computeComparison(answers, effectiveCompareShare.result.answers)
      : null

  const answeredCount = Object.keys(answers).length

  function answer(voteId: string, position: QuizAnswerPosition) {
    setAnswers(prev => ({ ...prev, [voteId]: position }))
    setRevealVoteId(voteId)
  }

  function skip(voteId: string) {
    setAnswers(prev => {
      const next = { ...prev }
      delete next[voteId]
      return next
    })
    advance()
  }

  function goNext() {
    setRevealVoteId(null)
    advance()
  }

  function advance() {
    if (questions && index < questions.length - 1) setIndex(index + 1)
    else setPhase('group')
  }

  function back() {
    setRevealVoteId(null)
    if (index > 0) setIndex(index - 1)
    else setPhase('intro')
  }

  async function submit(department: string | null) {
    setMatching(true)
    setMatchError(false)
    try {
      const payload = Object.entries(answers).map(([vote_id, position]) => ({
        vote_id,
        position,
      }))
      const res = await api.quiz.match(
        payload,
        department ?? undefined,
        focusDeputyName ? focusDeputyId : undefined
      )
      setResult(res)
      setPhase('results')
    } catch {
      setMatchError(true)
    } finally {
      setMatching(false)
    }
  }

  async function confirmPostal() {
    setPostalError(null)
    setResolving(true)
    const dept = await resolvePostalCodeToDepartment(postalInput.trim())
    setResolving(false)
    if (!dept) {
      setPostalError('Code postal introuvable — vérifiez les 5 chiffres, ou passez cette étape.')
      return
    }
    setResolved(dept)
    await submit(dept.code)
  }

  function restart() {
    setPhase('intro')
    setIndex(0)
    setAnswers({})
    setPredictedGroup(null)
    setPostalInput('')
    setPostalError(null)
    setResolved(null)
    setResult(null)
    setMatchError(false)
  }

  // ------------------------------------------------------------------ intro
  if (phase === 'intro') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ ...kicker, marginBottom: 16 }}>Le quiz</div>
          <h1
            className="font-newsreader text-[clamp(30px,5vw,46px)]"
            style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}
          >
            {focusDeputyName ? `Votez-vous comme ${focusDeputyName} ?` : 'Quel député vote comme vous ?'}
          </h1>
          <p style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: 'var(--dp-text-secondary)' }}>
            {focusDeputyName ? (
              <>Répondez aux 10 scrutins et voyez votre accord avec {focusDeputyName} — et avec les 577 députés.</>
            ) : (
              <>
                Une dizaine de vrais scrutins de l’Assemblée nationale, posés en français courant.
                Répondez pour, contre ou abstention — à la fin, on compare vos réponses aux votes
                réels des 577 députés.
              </>
            )}
          </p>
          <p style={{ margin: '14px auto 0', maxWidth: 520, fontSize: 13.5, color: GRAY }}>
            Sans compte. Vos réponses restent dans votre navigateur : rien n’est enregistré
            tant que vous ne partagez pas vos résultats.
          </p>
          {effectiveCompareShare && (
            <p style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 14, color: NAVY, fontWeight: 600 }}>
              Faites le test pour voir votre accord avec le résultat qu’on vous a partagé.
            </p>
          )}
          {compareNotice && (
            <p style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 13.5, color: RED }}>{compareNotice}</p>
          )}
          {questionsError ? (
            <p style={{ marginTop: 28, fontSize: 15, color: RED }}>
              Impossible de charger le questionnaire pour le moment. Réessayez dans un instant.
            </p>
          ) : (
            <button
              onClick={() => setPhase('questions')}
              disabled={!questions}
              style={{
                marginTop: 32,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: ACCENT,
                color: '#fff',
                padding: '13px 30px',
                borderRadius: 9,
                fontWeight: 600,
                fontSize: 15.5,
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
  if (phase === 'questions' && questions) {
    const q = questions[index]
    const selected = answers[q.vote_id]
    const revealing = revealVoteId === q.vote_id
    const tallyKnown = q.votes_for != null && q.votes_against != null
    const resultVerb =
      q.result === 'adopté' ? 'adopté' : q.result === 'rejeté' ? 'rejeté' : null
    const resultLine = tallyKnown
      ? (resultVerb ? `L’Assemblée a ${resultVerb} ce texte : ` : 'Résultat du scrutin : ') +
        `${q.votes_for} pour, ${q.votes_against} contre` +
        (q.abstentions != null
          ? `, ${q.abstentions} abstention${q.abstentions > 1 ? 's' : ''}`
          : '') +
        '.'
      : null
    const majority =
      tallyKnown && q.votes_for !== q.votes_against
        ? q.votes_for! > q.votes_against!
          ? 'pour'
          : 'contre'
        : null
    const outcomeLine =
      selected === 'abstention'
        ? 'Vous vous êtes abstenu·e sur ce texte.'
        : majority
          ? selected === majority
            ? 'Vous étiez avec la majorité.'
            : 'Vous étiez avec la minorité.'
          : null
    return (
      <Shell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={kicker}>
            Question {index + 1} / {questions.length}
          </div>
          <div style={{ fontSize: 12.5, color: GRAY }}>{q.theme}</div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={questions.length}
          style={{ height: 6, background: 'var(--dp-border-subtle)', borderRadius: 999, overflow: 'hidden', marginBottom: 30 }}
        >
          <div
            style={{
              height: '100%',
              background: NAVY,
              borderRadius: 999,
              width: `${((index + 1) / questions.length) * 100}%`,
              transition: 'width 200ms ease',
            }}
          />
        </div>

        <h2
          className="font-newsreader text-[clamp(22px,3.5vw,32px)]"
          style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.3 }}
        >
          {q.question}
        </h2>
        <p style={{ margin: '14px 0 30px', fontSize: 14.5, lineHeight: 1.6, color: GRAY }}>{q.context}</p>

        {revealing ? (
          <div
            style={{
              padding: '20px 22px',
              borderRadius: 10,
              background: 'var(--dp-card-bg)',
              border: `1px solid ${LINE}`,
            }}
          >
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
              {resultLine ?? 'Résultat du scrutin indisponible pour ce texte.'}
            </p>
            {outcomeLine && (
              <p style={{ margin: '10px 0 0', fontSize: 14, color: GRAY }}>{outcomeLine}</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['pour', 'contre', 'abstention'] as const).map(pos => {
              const { label, color, bg } = POS[pos]
              const active = selected === pos
              return (
                <button
                  key={pos}
                  onClick={() => answer(q.vote_id, pos)}
                  style={{
                    padding: '15px 20px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 16,
                    textAlign: 'left',
                    cursor: 'pointer',
                    color,
                    background: bg,
                    border: `2px solid ${active ? color : 'transparent'}`,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button
            onClick={back}
            style={{ fontSize: 14, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
          >
            ← Retour
          </button>
          {revealing ? (
            <button
              onClick={goNext}
              style={{
                background: ACCENT, color: '#fff', padding: '10px 22px', borderRadius: 9,
                fontWeight: 600, fontSize: 14.5, border: 'none', cursor: 'pointer',
                boxShadow: '0 2px 8px var(--dp-cta-shadow)',
              }}
            >
              Question suivante
            </button>
          ) : (
            <button
              onClick={() => skip(q.vote_id)}
              style={{ fontSize: 14, color: GRAY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
            >
              Passer cette question
            </button>
          )}
        </div>
      </Shell>
    )
  }

  // ------------------------------------------------------------------ group
  if (phase === 'group') {
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
          Facultatif — cette réponse reste dans votre navigateur, elle n’est jamais envoyée ni
          enregistrée. À la fin, on compare votre ressenti à vos votes réels.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CANONICAL_GROUP_LABELS.map(label => {
            const hex = partyHex(label)
            return (
              <button
                key={label}
                onClick={() => {
                  setPredictedGroup(label)
                  setPhase('postal')
                }}
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
            onClick={() => {
              setPredictedGroup(null)
              setPhase('postal')
            }}
            style={{
              background: ACCENT, color: '#fff', padding: '12px 26px', borderRadius: 9,
              fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer',
            }}
          >
            Je préfère ne pas dire / passer
          </button>
          <button
            onClick={() => {
              setPhase('questions')
              if (questions) setIndex(questions.length - 1)
            }}
            style={{ fontSize: 14.5, color: GRAY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
          >
            ← Retour
          </button>
        </div>
      </Shell>
    )
  }

  // ----------------------------------------------------------------- postal
  if (phase === 'postal') {
    const enough = answeredCount >= MIN_ANSWERS
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Dernière étape</div>
        {!enough ? (
          <>
            <h2
              className="font-newsreader text-[clamp(24px,3.5vw,34px)]"
              style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}
            >
              Encore quelques réponses
            </h2>
            <p style={{ margin: '16px 0 28px', fontSize: 15.5, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
              Il faut au moins {MIN_ANSWERS} réponses exprimées pour un résultat significatif —
              vous en avez donné {answeredCount}.
            </p>
            <button
              onClick={() => {
                setIndex(0)
                setPhase('questions')
              }}
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
              Donnez votre code postal pour comparer aussi vos réponses aux votes des députés de
              votre département. Facultatif — il n’est ni envoyé à nos serveurs tel quel, ni conservé.
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
                onChange={e => setPostalInput(e.target.value)}
                aria-label="Code postal"
                style={{
                  flex: '1 1 200px', padding: '12px 16px', borderRadius: 9,
                  border: `1px solid ${LINE}`, fontSize: 15.5, color: NAVY, background: 'var(--dp-card-bg)',
                }}
              />
              <button
                type="submit"
                disabled={resolving || matching || !/^\d{5}$/.test(postalInput.trim())}
                style={{
                  background: ACCENT, color: '#fff', padding: '12px 26px', borderRadius: 9,
                  fontWeight: 600, fontSize: 15, border: 'none',
                  cursor: resolving || matching ? 'wait' : 'pointer',
                  opacity: resolving || matching || !/^\d{5}$/.test(postalInput.trim()) ? 0.6 : 1,
                }}
              >
                {resolving || matching ? 'Calcul…' : 'Voir mes résultats'}
              </button>
            </form>
            {postalError && <p style={{ marginTop: 12, fontSize: 14, color: RED }}>{postalError}</p>}
            {matchError && (
              <p style={{ marginTop: 12, fontSize: 14, color: RED }}>
                Le calcul a échoué. Réessayez dans un instant.
              </p>
            )}
            <div style={{ marginTop: 22, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <button
                onClick={() => submit(null)}
                disabled={matching}
                style={{ fontSize: 14.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
              >
                {matching ? 'Calcul…' : 'Passer cette étape et voir mes résultats'}
              </button>
              <button
                onClick={() => {
                  if (questions) setIndex(questions.length - 1)
                  setPhase('questions')
                }}
                disabled={matching}
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
  if (phase === 'results' && result) {
    const answerPayload = Object.entries(answers).map(([vote_id, position]) => ({
      vote_id,
      position,
    }))
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Vos résultats</div>
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
          resolvedNom={resolved?.nom}
          questions={questions ?? undefined}
          answers={answers}
        />

        <section style={{ marginTop: 48, ...card, textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
            Partagez votre résultat, ou suivez un de ces députés vote après vote.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {result.top_matches.length > 0 && (
              <ShareResultButton answers={answerPayload} department={resolved?.code} />
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
