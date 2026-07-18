'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type {
  QuizAnswerPosition,
  QuizDeputyMatch,
  QuizMatchResponse,
  QuizQuestion,
} from '@/lib/api'
import { partyHex } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'
import { resolvePostalCodeToDepartment } from '@/lib/postal'
import type { ResolvedDepartment } from '@/lib/postal'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { POS } from '@/lib/vote-position'

const NAVY = '#1B2B50'
const CREAM = '#F7F4ED'
const LINE = '#E4E6EA'
const ACCENT = '#E0786E'
const RED = '#C9302A'
const GRAY = '#6B7280'

// Mirrors MIN_ANSWERS in api/routers/quiz.py — the backend rejects fewer.
const MIN_ANSWERS = 3

type Phase = 'intro' | 'questions' | 'postal' | 'results'

const kicker: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: RED,
}

const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: '22px 24px',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 96px' }}>{children}</div>
    </div>
  )
}

function AgreementBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 8,
        background: '#EEF0F2',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div style={{ height: '100%', background: color, borderRadius: 999, width: `${pct}%` }} />
    </div>
  )
}

function pctLabel(match: QuizDeputyMatch): string {
  return match.agreement_pct !== null ? `${match.agreement_pct}%` : '—'
}

function comparedLabel(match: QuizDeputyMatch): string {
  if (match.compared === 0) return 'aucun vote comparable'
  return `${match.matches}/${match.compared} vote${match.compared > 1 ? 's' : ''} en accord`
}

function DeputyMatchRow({ match, rank }: { match: QuizDeputyMatch; rank?: number }) {
  const hex = partyHex(match.party)
  return (
    <Link
      href={`/deputes/${match.deputy_id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        borderRadius: 10,
        textDecoration: 'none',
        background: '#fff',
        border: `1px solid ${LINE}`,
      }}
    >
      {rank !== undefined && (
        <span className="font-mono" style={{ fontSize: 13, color: '#9CA3AF', width: 20 }}>
          {rank}
        </span>
      )}
      <DeputyAvatar name={match.full_name ?? '?'} photoUrl={match.photo_url} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: NAVY }}>{match.full_name}</div>
        <div style={{ fontSize: 12.5, color: GRAY, marginTop: 2 }}>
          {[match.party_short ?? match.party, departmentLabel(match.department)]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="font-mono" style={{ fontWeight: 700, fontSize: 18, color: hex }}>
          {pctLabel(match)}
        </div>
        <div style={{ fontSize: 11.5, color: '#9CA3AF' }}>{comparedLabel(match)}</div>
      </div>
    </Link>
  )
}

export function QuizClient() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [questionsError, setQuestionsError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, QuizAnswerPosition>>({})

  const [postalInput, setPostalInput] = useState('')
  const [resolving, setResolving] = useState(false)
  const [postalError, setPostalError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<ResolvedDepartment | null>(null)

  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState(false)
  const [result, setResult] = useState<QuizMatchResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    api.quiz
      .questions()
      .then(res => {
        if (!cancelled) setQuestions(res.questions)
      })
      .catch(() => {
        if (!cancelled) setQuestionsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const answeredCount = Object.keys(answers).length

  function answer(voteId: string, position: QuizAnswerPosition) {
    setAnswers(prev => ({ ...prev, [voteId]: position }))
    advance()
  }

  function skip(voteId: string) {
    setAnswers(prev => {
      const next = { ...prev }
      delete next[voteId]
      return next
    })
    advance()
  }

  function advance() {
    if (questions && index < questions.length - 1) setIndex(index + 1)
    else setPhase('postal')
  }

  function back() {
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
      const res = await api.quiz.match(payload, department ?? undefined)
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
            Quel député vote comme vous ?
          </h1>
          <p style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 16, lineHeight: 1.65, color: '#4B5563' }}>
            Une dizaine de vrais scrutins de l’Assemblée nationale, posés en français courant.
            Répondez pour, contre ou abstention — à la fin, on compare vos réponses aux votes
            réels des 577 députés.
          </p>
          <p style={{ margin: '14px auto 0', maxWidth: 520, fontSize: 13.5, color: GRAY }}>
            Sans compte. Vos réponses restent dans votre navigateur : rien n’est enregistré.
          </p>
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
                boxShadow: '0 2px 8px rgba(224,120,110,0.35)',
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
          style={{ height: 6, background: '#E7E2D6', borderRadius: 999, overflow: 'hidden', marginBottom: 30 }}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button
            onClick={back}
            style={{ fontSize: 14, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
          >
            ← Retour
          </button>
          <button
            onClick={() => skip(q.vote_id)}
            style={{ fontSize: 14, color: GRAY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
          >
            Passer cette question
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
            <p style={{ margin: '16px 0 28px', fontSize: 15.5, lineHeight: 1.6, color: '#4B5563' }}>
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
            <p style={{ margin: '16px 0 24px', fontSize: 15.5, lineHeight: 1.6, color: '#4B5563' }}>
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
                  border: `1px solid ${LINE}`, fontSize: 15.5, color: NAVY, background: '#fff',
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
            <div style={{ marginTop: 22 }}>
              <button
                onClick={() => submit(null)}
                disabled={matching}
                style={{ fontSize: 14.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
              >
                {matching ? 'Calcul…' : 'Passer cette étape et voir mes résultats'}
              </button>
            </div>
          </>
        )}
      </Shell>
    )
  }

  // ---------------------------------------------------------------- results
  if (phase === 'results' && result) {
    const best = result.top_matches[0] ?? null
    const others = result.top_matches.slice(1)
    const bestHex = best ? partyHex(best.party) : NAVY
    return (
      <Shell>
        <div style={{ ...kicker, marginBottom: 16 }}>Vos résultats</div>

        {best ? (
          <>
            <h1
              className="font-newsreader text-[clamp(26px,4vw,38px)]"
              style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}
            >
              Vous votez à {pctLabel(best)} comme {best.full_name}
            </h1>
            <p style={{ margin: '10px 0 26px', fontSize: 14, color: GRAY }}>
              Sur {result.answered} scrutin{result.answered > 1 ? 's' : ''} répondu
              {result.answered > 1 ? 's' : ''}, comparé aux positions exprimées de{' '}
              {result.eligible_deputies} députés.
            </p>

            <Link
              href={`/deputes/${best.deputy_id}`}
              style={{ ...card, display: 'flex', alignItems: 'center', gap: 20, textDecoration: 'none', borderLeft: `4px solid ${bestHex}` }}
            >
              <DeputyAvatar name={best.full_name ?? '?'} photoUrl={best.photo_url} size="xl" priority />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: NAVY }}>{best.full_name}</div>
                <div style={{ fontSize: 14, color: GRAY, marginTop: 4 }}>
                  {[best.party, departmentLabel(best.department)].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>{comparedLabel(best)}</div>
              </div>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: 34, color: bestHex }}>
                {pctLabel(best)}
              </div>
            </Link>
          </>
        ) : (
          <>
            <h1
              className="font-newsreader text-[clamp(26px,4vw,38px)]"
              style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}
            >
              Pas assez de votes comparables
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: '#4B5563' }}>
              Aucun député n’a exprimé de position sur assez de scrutins de votre sélection pour
              établir une comparaison fiable. Réessayez en répondant à davantage de questions.
            </p>
          </>
        )}

        {others.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 className="font-newsreader" style={{ fontWeight: 600, fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
              Vos autres meilleurs matchs
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {others.map((m, i) => (
                <DeputyMatchRow key={m.deputy_id} match={m} rank={i + 2} />
              ))}
            </div>
          </section>
        )}

        {result.opposite && (
          <section style={{ marginTop: 40 }}>
            <h2 className="font-newsreader" style={{ fontWeight: 600, fontSize: 22, color: NAVY, margin: '0 0 6px' }}>
              À l’opposé de vos votes
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: GRAY }}>
              Le député qui vote le moins souvent comme vous.
            </p>
            <DeputyMatchRow match={result.opposite} />
          </section>
        )}

        {result.groups.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 className="font-newsreader" style={{ fontWeight: 600, fontSize: 22, color: NAVY, margin: '0 0 6px' }}>
              Votre alignement par groupe
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: GRAY }}>
              Accord entre vos réponses et la position majoritaire de chaque groupe parlementaire,
              scrutin par scrutin.
            </p>
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result.groups.map(g => {
                const hex = partyHex(g.party)
                return (
                  <div key={g.party}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: NAVY, minWidth: 0 }}>
                        {g.party}
                      </span>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: 15, color: hex }}>
                        {g.agreement_pct}%
                      </span>
                    </div>
                    <AgreementBar pct={g.agreement_pct} color={hex} />
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {result.my_department && (
          <section style={{ marginTop: 40 }}>
            <h2 className="font-newsreader" style={{ fontWeight: 600, fontSize: 22, color: NAVY, margin: '0 0 6px' }}>
              Les députés de votre département
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: GRAY }}>
              {result.my_department.name}
              {resolved && resolved.nom !== result.my_department.name ? ` (${resolved.nom})` : ''} —
              votre accord avec chacun de ses députés.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.my_department.deputies.map(m => (
                <DeputyMatchRow key={m.deputy_id} match={m} />
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 48, ...card, textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: '#4B5563' }}>
            Envie de suivre un de ces députés vote après vote ?
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/mon-depute"
              style={{
                background: ACCENT, color: '#fff', padding: '11px 22px', borderRadius: 9,
                fontWeight: 600, fontSize: 14.5, textDecoration: 'none',
              }}
            >
              Ouvrir Mon député
            </Link>
            <button
              onClick={restart}
              style={{
                fontSize: 14.5, color: NAVY, background: '#fff', border: `1px solid ${LINE}`,
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
