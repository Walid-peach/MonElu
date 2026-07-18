'use client'
import Link from 'next/link'
import type { QuizDeputyMatch, QuizMatchResponse } from '@/lib/api'
import { partyHex } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'
import { DeputyAvatar } from '@/components/DeputyAvatar'

const NAVY = '#1B2B50'
const LINE = '#E4E6EA'
const GRAY = '#6B7280'

export const card: React.CSSProperties = {
  background: '#fff',
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
        background: '#EEF0F2',
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

// The full result card: hero best-match, top matches, opposite deputy, group
// alignment, department comparison. Shared between the live results screen
// (QuizClient) and the stored share page (/quiz/s/[id]) so both render the
// exact same card (ADR-025 snapshot semantics).
export function QuizResultSections({
  result,
  resolvedNom,
}: {
  result: QuizMatchResponse
  resolvedNom?: string
}) {
  const best = result.top_matches[0] ?? null
  const others = result.top_matches.slice(1)
  const bestHex = best ? partyHex(best.party) : NAVY

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
