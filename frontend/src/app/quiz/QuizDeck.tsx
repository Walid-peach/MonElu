'use client'
// MON-186: Tinder-style swipe deck for the quiz questions phase. One card per
// scrutin; swipe right = pour, left = contre, down = abstention. The buttons
// under the stack, the arrow keys and Backspace drive the exact same commit
// path as the gestures, so touch, mouse, keyboard and assistive tech are all
// first-class. The old post-answer reveal panel is gone - the scrutin outcome
// hides behind a per-card "Détails du scrutin" toggle instead.
import { useEffect, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import type { QuizAnswerPosition, QuizQuestion } from '@/lib/api'
import { POS } from '@/lib/vote-position'

const NAVY = 'var(--dp-text)'
const LINE = 'var(--dp-border)'
const RED = 'var(--dp-red)'
const GRAY = 'var(--dp-text-secondary)'

// A drag commits once the card travels this far or is flung this fast.
const SWIPE_OFFSET = 100
const SWIPE_VELOCITY = 500

type Dir = Exclude<QuizAnswerPosition, 'nonVotant'>

// Where a committed card flies off to (and where an undone card re-enters from).
const EXIT: Record<Dir, { x: number; y: number; rotate: number }> = {
  pour: { x: 560, y: -40, rotate: 18 },
  contre: { x: -560, y: -40, rotate: -18 },
  abstention: { x: 0, y: 640, rotate: 0 },
}

// Percentage split of the votes cast (pour + contre + abstention, MON-186:
// percentages, not raw counts). Null when the live tally join found no row.
function tallyBullets(q: QuizQuestion): Array<{ label: string; pct: number }> | null {
  if (q.votes_for == null || q.votes_against == null) return null
  const abstentions = q.abstentions ?? 0
  const total = q.votes_for + q.votes_against + abstentions
  if (total === 0) return null
  const pct = (n: number) => Math.round((n / total) * 100)
  const bullets: Array<{ label: string; pct: number }> = [
    { label: POS.pour.label, pct: pct(q.votes_for) },
    { label: POS.contre.label, pct: pct(q.votes_against) },
  ]
  if (q.abstentions != null) bullets.push({ label: POS.abstention.label, pct: pct(abstentions) })
  return bullets
}

function outcomeLine(q: QuizQuestion): string {
  if (q.result === 'adopté') return 'L’Assemblée a adopté ce texte :'
  if (q.result === 'rejeté') return 'L’Assemblée a rejeté ce texte :'
  return 'Résultat du scrutin :'
}

// Rotated Tinder-style stamp whose opacity is driven by the drag distance.
function Stamp({
  label,
  color,
  opacity,
  style,
}: {
  label: string
  color: string
  opacity: ReturnType<typeof useTransform<number, number>>
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      aria-hidden
      style={{
        position: 'absolute', top: 18, padding: '4px 12px', borderRadius: 8,
        border: `3px solid ${color}`, color, fontWeight: 800, fontSize: 22,
        letterSpacing: '0.08em', textTransform: 'uppercase', pointerEvents: 'none',
        background: 'var(--dp-card-bg)', opacity, ...style,
      }}
    >
      {label}
    </motion.div>
  )
}

function TopCard({ question, onCommit }: { question: QuizQuestion; onCommit: (dir: Dir) => void }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-12, 12])
  const pourOpacity = useTransform(x, [30, SWIPE_OFFSET], [0, 1])
  const contreOpacity = useTransform(x, [-30, -SWIPE_OFFSET], [0, 1])
  const absOpacity = useTransform([x, y], ([vx, vy]: number[]) =>
    Math.abs(vx) < 60 ? Math.min(Math.max((vy - 30) / (SWIPE_OFFSET - 30), 0), 1) : 0
  )
  const border = useTransform(
    [pourOpacity, contreOpacity, absOpacity],
    ([p, c, a]: number[]) => {
      if (p > 0.05) return `2px solid rgba(34,139,94,${0.2 + p * 0.8})`
      if (c > 0.05) return `2px solid rgba(196,52,52,${0.2 + c * 0.8})`
      if (a > 0.05) return `2px solid rgba(120,120,120,${0.2 + a * 0.8})`
      return `1px solid ${LINE}`
    }
  )
  const [showInfo, setShowInfo] = useState(false)
  const bullets = tallyBullets(question)

  function handleDragEnd(
    _: unknown,
    info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }
  ) {
    const { offset, velocity } = info
    const fastX = Math.abs(velocity.x) > SWIPE_VELOCITY
    const fastY = velocity.y > SWIPE_VELOCITY
    // Horizontal wins whenever it dominates the drag, so a diagonal fling
    // never registers as an accidental abstention.
    if ((offset.x > SWIPE_OFFSET || (fastX && velocity.x > 0)) && Math.abs(offset.x) >= offset.y) {
      onCommit('pour')
    } else if (
      (offset.x < -SWIPE_OFFSET || (fastX && velocity.x < 0)) &&
      Math.abs(offset.x) >= offset.y
    ) {
      onCommit('contre')
    } else if (offset.y > SWIPE_OFFSET || fastY) {
      onCommit('abstention')
    }
    // Below threshold: dragSnapToOrigin springs the card back.
  }

  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      style={{
        x, y, rotate, border,
        position: 'absolute', inset: 0, borderRadius: 16, background: 'var(--dp-card-bg)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.10)', padding: '22px 22px 18px',
        display: 'flex', flexDirection: 'column', cursor: 'grab', touchAction: 'none',
        userSelect: 'none', zIndex: 3,
      }}
      whileTap={{ cursor: 'grabbing' }}
    >
      <Stamp label={POS.pour.label} color={POS.pour.color} opacity={pourOpacity} style={{ left: 16, rotate: '-12deg' }} />
      <Stamp label={POS.contre.label} color={POS.contre.color} opacity={contreOpacity} style={{ right: 16, rotate: '12deg' }} />
      <Stamp
        label={POS.abstention.label} color={POS.abstention.color} opacity={absOpacity}
        style={{ left: '50%', x: '-50%', top: 'auto', bottom: 18, fontSize: 18 }}
      />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: RED }}>
        {question.theme}
      </div>
      <h2
        className="font-newsreader"
        style={{
          fontWeight: 600, color: NAVY, margin: '12px 0 0',
          fontSize: 'clamp(20px,4.5vw,26px)', lineHeight: 1.3, flex: showInfo ? 'none' : 1,
        }}
      >
        {question.question}
      </h2>
      {showInfo && (
        <div style={{ marginTop: 14, flex: 1, overflowY: 'auto', fontSize: 13.5, lineHeight: 1.55, color: GRAY }}>
          <p style={{ margin: 0 }}>{question.context}</p>
          {bullets ? (
            <>
              <p style={{ margin: '10px 0 0', fontWeight: 600, color: NAVY }}>{outcomeLine(question)}</p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {bullets.map(b => (
                  <li key={b.label}>
                    {b.label} : {b.pct} %
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ margin: '10px 0 0', fontWeight: 600, color: NAVY }}>
              Résultat du scrutin indisponible pour ce texte.
            </p>
          )}
        </div>
      )}
      <button
        onClick={() => setShowInfo(v => !v)}
        // Keeps a tap on the toggle from starting a card drag.
        onPointerDownCapture={e => e.stopPropagation()}
        aria-expanded={showInfo}
        aria-label="Détails du scrutin"
        style={{
          alignSelf: 'flex-start', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: GRAY,
          background: 'none', border: `1px solid ${LINE}`, borderRadius: 999,
          padding: '5px 12px', cursor: 'pointer',
        }}
      >
        {showInfo ? 'Masquer les détails' : 'ℹ Détails du scrutin'}
      </button>
    </motion.div>
  )
}

export function QuizDeck({
  questions,
  index,
  onAnswer,
  onSkip,
  onBack,
}: {
  questions: QuizQuestion[]
  index: number
  onAnswer: (voteId: string, position: QuizAnswerPosition) => void
  onSkip: (voteId: string) => void
  onBack: () => void
}) {
  const reducedMotion = useReducedMotion()
  // Exit direction of each committed card, keyed by vote_id, so
  // AnimatePresence knows which way to fling it and undo where to re-enter from.
  const [exitDir, setExitDir] = useState<Record<string, Dir>>({})

  const stack = questions.slice(index, index + 3)
  const top = stack[0]

  function commit(dir: Dir) {
    if (!top) return
    setExitDir(prev => ({ ...prev, [top.vote_id]: dir }))
    onAnswer(top.vote_id, dir)
  }

  function skip() {
    if (!top) return
    setExitDir(prev => ({ ...prev, [top.vote_id]: 'abstention' }))
    onSkip(top.vote_id)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') commit('pour')
      else if (e.key === 'ArrowLeft') commit('contre')
      else if (e.key === 'ArrowDown') commit('abstention')
      else if (e.key === 'Backspace') onBack()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, index])

  const exitOf = (voteId: string) => EXIT[exitDir[voteId] ?? 'abstention']

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div style={{ position: 'relative', height: 380 }}>
        {/* Back cards, deepest first so the top card paints last. */}
        {stack.slice(1).reverse().map(q => {
          const depth = stack.indexOf(q)
          return (
            <motion.div
              key={q.vote_id}
              aria-hidden
              initial={false}
              animate={{ scale: 1 - depth * 0.045, y: depth * 14, opacity: 1 - depth * 0.25 }}
              style={{
                position: 'absolute', inset: 0, borderRadius: 16, background: 'var(--dp-card-bg)',
                border: `1px solid ${LINE}`, boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
              }}
            />
          )
        })}
        <AnimatePresence initial={false}>
          {top && (
            <motion.div
              key={top.vote_id}
              style={{ position: 'absolute', inset: 0 }}
              initial={
                exitDir[top.vote_id]
                  ? reducedMotion
                    ? { opacity: 0 }
                    : exitOf(top.vote_id)
                  : false
              }
              animate={{
                x: 0, y: 0, rotate: 0, opacity: 1,
                transition: reducedMotion
                  ? { duration: 0.15 }
                  : { type: 'spring', stiffness: 300, damping: 28 },
              }}
              exit={
                reducedMotion
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : { ...exitOf(top.vote_id), opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } }
              }
            >
              <TopCard question={top} onCommit={commit} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 26 }}>
        <button
          onClick={onBack}
          aria-label="Revenir à la question précédente"
          title="Annuler (Retour arrière)"
          style={{
            width: 44, height: 44, borderRadius: '50%', border: `1px solid ${LINE}`,
            background: 'var(--dp-card-bg)', color: NAVY, fontSize: 18, cursor: 'pointer',
          }}
        >
          ↩
        </button>
        {(['contre', 'abstention', 'pour'] as const).map(pos => (
          <button
            key={pos}
            onClick={() => commit(pos)}
            aria-label={POS[pos].label}
            style={{
              padding: '12px 18px', borderRadius: 999, fontWeight: 700, fontSize: 14.5,
              color: POS[pos].color, background: POS[pos].bg, border: `2px solid ${POS[pos].color}`,
              cursor: 'pointer', minWidth: pos === 'abstention' ? 0 : 108,
            }}
          >
            {pos === 'contre' ? '← ' : ''}
            {POS[pos].label}
            {pos === 'pour' ? ' →' : ''}
            {pos === 'abstention' ? ' ↓' : ''}
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button
          onClick={skip}
          style={{
            fontSize: 13, color: GRAY, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Passer cette question
        </button>
      </div>
    </div>
  )
}
