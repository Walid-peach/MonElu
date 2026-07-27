'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { QuizAnswerPosition, QuizDeputyMatch, QuizMatchResponse, QuizQuestion } from '@/lib/api'
import { partyHex } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'
import { DeputyAvatar } from '@/components/DeputyAvatar'

const POSITION_LABELS: Record<QuizAnswerPosition, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
}

const NAVY = 'var(--dp-text)'
const LINE = 'var(--dp-border)'
const GRAY = 'var(--dp-text-secondary)'

export const card: React.CSSProperties = {
  background: 'var(--dp-card-bg)',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: '22px 24px',
}

function AgreementBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 8,
        background: 'var(--dp-track-bg)',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div style={{ height: '100%', background: color, borderRadius: 999, width: `${pct}%` }} />
    </div>
  )
}

export function pctLabel(match: QuizDeputyMatch): string {
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
        background: 'var(--dp-card-bg)',
        border: `1px solid ${LINE}`,
      }}
    >
      {rank !== undefined && (
        <span className="font-mono" style={{ fontSize: 13, color: 'var(--dp-text-muted)', width: 20 }}>
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
        <div style={{ fontSize: 11.5, color: 'var(--dp-text-muted)' }}>{comparedLabel(match)}</div>
      </div>
    </Link>
  )
}

function PositionBadge({ position }: { position: QuizAnswerPosition | null }) {
  if (position === null) {
    return (
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--dp-text-muted)' }}>
        Non exprimé
      </span>
    )
  }
  const color = position === 'pour' ? 'var(--dp-green)' : position === 'contre' ? 'var(--dp-red)' : 'var(--dp-text-secondary)'
  const bg = position === 'pour' ? 'var(--dp-badge-pos-bg)' : position === 'contre' ? 'var(--dp-badge-neg-bg)' : 'var(--dp-track-bg)'
  return (
    <span
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 999,
        color,
        background: bg,
      }}
    >
      {POSITION_LABELS[position]}
    </span>
  )
}

// Per-question breakdown (MON-181) — only rendered when the API returned
// `detail` (the live results screen; never on a stored share, ADR-025) and
// the questions/answers are available to label each row.
function VoteBreakdown({
  best,
  questions,
  answers,
}: {
  best: QuizDeputyMatch
  questions: QuizQuestion[]
  answers: Record<string, QuizAnswerPosition>
}) {
  if (!best.detail) return null
  const byVoteId = new Map(questions.map(q => [q.vote_id, q]))

  return (
    <details style={{ ...card, marginTop: 20, padding: 0 }}>
      <summary
        style={{
          cursor: 'pointer',
          padding: '18px 22px',
          fontWeight: 600,
          fontSize: 15,
          color: NAVY,
        }}
      >
        Le détail, scrutin par scrutin
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 22px 22px' }}>
        {best.detail.map(d => {
          const question = byVoteId.get(d.vote_id)
          const yourAnswer = answers[d.vote_id] ?? null
          const comparable = d.deputy_position !== null
          const agrees = comparable && d.deputy_position === yourAnswer
          return (
            <div
              key={d.vote_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                padding: '12px 0',
                borderTop: `1px solid ${LINE}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>
                  {question?.theme ?? 'Scrutin'}
                </div>
                <Link
                  href={`/votes/${d.vote_id}`}
                  style={{ fontSize: 14, color: NAVY, textDecoration: 'none', fontWeight: 500 }}
                >
                  {question?.question ?? d.vote_id}
                </Link>
                <div style={{ fontSize: 12.5, color: GRAY, marginTop: 4 }}>
                  {comparable
                    ? agrees
                      ? 'En accord avec ' + best.full_name
                      : 'En désaccord avec ' + best.full_name
                    : `Position non comparable — ${best.full_name} n'a pas voté pour ou contre`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--dp-text-muted)' }}>Vous</span>
                  <PositionBadge position={yourAnswer} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--dp-text-muted)' }}>
                    {best.full_name}
                  </span>
                  <PositionBadge position={d.deputy_position} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

// The full result card: hero best-match, top matches, opposite deputy, group
// alignment, department comparison. Shared between the live results screen
// (QuizClient) and the stored share page (/quiz/s/[id]) so both render the
// exact same card (ADR-025 snapshot semantics).
export function QuizResultSections({
  result,
  resolvedNom,
  questions,
  answers,
}: {
  result: QuizMatchResponse
  resolvedNom?: string
  // Only available on the live results screen — absent on the stored share
  // page, which is why the breakdown accordion never renders there.
  questions?: QuizQuestion[]
  answers?: Record<string, QuizAnswerPosition>
}) {
  const best = result.top_matches[0] ?? null
  const others = result.top_matches.slice(1)
  const bestHex = best ? partyHex(best.party) : NAVY
  // Top 3 matches shown initially (the hero best-match card plus these two),
  // rest revealed on demand behind "Voir tous les députés".
  const [showAllOthers, setShowAllOthers] = useState(false)
  const visibleOthers = showAllOthers ? others : others.slice(0, 2)

  return (
    <>
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
              <div style={{ fontSize: 13, color: 'var(--dp-text-muted)', marginTop: 4 }}>{comparedLabel(best)}</div>
            </div>
            <div className="font-mono" style={{ fontWeight: 700, fontSize: 34, color: bestHex }}>
              {pctLabel(best)}
            </div>
          </Link>

          {questions && answers && (
            <VoteBreakdown best={best} questions={questions} answers={answers} />
          )}
        </>
      ) : (
        <>
          <h1
            className="font-newsreader text-[clamp(26px,4vw,38px)]"
            style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}
          >
            Pas assez de votes comparables
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
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
            {visibleOthers.map((m, i) => (
              <DeputyMatchRow key={m.deputy_id} match={m} rank={i + 2} />
            ))}
          </div>
          {!showAllOthers && others.length > visibleOthers.length && (
            <button
              type="button"
              onClick={() => setShowAllOthers(true)}
              style={{
                marginTop: 14,
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${LINE}`,
                background: 'var(--dp-card-bg)',
                color: NAVY,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Voir tous les députés
            </button>
          )}
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
            {resolvedNom && resolvedNom !== result.my_department.name ? ` (${resolvedNom})` : ''} —
            votre accord avec chacun de ses députés.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.my_department.deputies.map(m => (
              <DeputyMatchRow key={m.deputy_id} match={m} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
