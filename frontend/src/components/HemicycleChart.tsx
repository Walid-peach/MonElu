'use client'
import { useMemo, useState, useRef, useCallback, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { partyHex } from '@/lib/utils'
import { InfoTooltip } from '@/components/InfoTooltip'
import {
  layoutSeats,
  groupArcs,
  HEMICYCLE_VIEWBOX,
  HEMICYCLE_CENTER,
  type HemicycleDeputy,
  type Seat,
  type SeatPosition,
} from '@/lib/hemicycle'

const POSITION_COLORS: Record<SeatPosition, string> = {
  pour: '#1F8A5B',
  contre: '#C9302A',
  abstention: '#D97706',
  nonVotant: '#9CA3AF',
  absent: '#E4E6EA',
}

const POSITION_LABELS: Record<SeatPosition, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  nonVotant: 'Non votant',
  absent: 'Absent',
}

interface Props {
  deputies: HemicycleDeputy[]
}

// Individual dots are too small to tap reliably below ~640px, so the chart
// defaults to the collapsed group view on small screens (MON-104) until the
// user explicitly picks a view.
const SMALL_SCREEN_QUERY = '(max-width: 640px)'

function subscribeSmallScreen(onChange: () => void) {
  const mql = window.matchMedia(SMALL_SCREEN_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function useIsSmallScreen(): boolean {
  return useSyncExternalStore(
    subscribeSmallScreen,
    () => window.matchMedia(SMALL_SCREEN_QUERY).matches,
    () => false
  )
}

function arcPath(startAngle: number, endAngle: number, rInner: number, rOuter: number): string {
  const { cx, cy } = HEMICYCLE_CENTER
  const p = (angle: number, r: number) => `${cx + Math.cos(angle) * r},${cy - Math.sin(angle) * r}`
  const large = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0
  return [
    `M ${p(startAngle, rInner)}`,
    `L ${p(startAngle, rOuter)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p(endAngle, rOuter)}`,
    `L ${p(endAngle, rInner)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p(startAngle, rInner)}`,
    'Z',
  ].join(' ')
}

export function HemicycleChart({ deputies }: Props) {
  const router = useRouter()
  const seats = useMemo(() => layoutSeats(deputies), [deputies])
  const arcs = useMemo(() => groupArcs(deputies), [deputies])

  const isSmallScreen = useIsSmallScreen()
  const [viewOverride, setViewOverride] = useState<'seats' | 'groups' | null>(null)
  const view = viewOverride ?? (isSmallScreen ? 'groups' : 'seats')
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [activeArc, setActiveArc] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const c: Record<SeatPosition, number> = { pour: 0, contre: 0, abstention: 0, nonVotant: 0, absent: 0 }
    for (const s of seats) c[s.position]++
    return c
  }, [seats])

  const activeSeat: Seat | null = activeIdx !== null ? (seats[activeIdx] ?? null) : null

  const clearActive = useCallback(() => {
    setActiveIdx(null)
    setPinned(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (view !== 'seats' || seats.length === 0) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => (i === null ? 0 : Math.min(seats.length - 1, i + 1)))
        setPinned(true)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => (i === null ? seats.length - 1 : Math.max(0, i - 1)))
        setPinned(true)
      } else if (e.key === 'Enter' && activeSeat) {
        router.push(`/deputes/${activeSeat.deputy.deputy_id}`)
      } else if (e.key === 'Escape') {
        clearActive()
      }
    },
    [view, seats, activeSeat, router, clearActive]
  )

  if (seats.length === 0) return null

  const vb = HEMICYCLE_VIEWBOX
  const legendEntries = (['pour', 'contre', 'abstention', 'nonVotant'] as SeatPosition[]).filter(
    p => counts[p] > 0
  )

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>

      {/* View toggle */}
      <div role="group" aria-label="Mode d'affichage de l'hémicycle" style={{ display: 'inline-flex', background: '#F2F3F5', borderRadius: 999, padding: 3, marginBottom: 18 }}>
        {([['seats', 'Par député'], ['groups', 'Par groupe']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => { setViewOverride(v); clearActive(); setActiveArc(null) }}
            aria-pressed={view === v}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 16px',
              fontSize: 13, fontWeight: 600,
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#1B2B50' : '#6B7280',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${vb.width} ${vb.height}`}
        style={{ width: '100%', height: 'auto', display: 'block', outline: 'none' }}
        tabIndex={view === 'seats' ? 0 : -1}
        role="application"
        aria-label={`Hémicycle du scrutin : ${counts.pour} pour, ${counts.contre} contre, ${counts.abstention} abstentions, ${counts.nonVotant} non votants. Utilisez les flèches pour parcourir les députés, Entrée pour ouvrir le profil.`}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (pinned) clearActive() }}
      >
        {view === 'seats' ? (
          <g>
            {seats.map((s, i) => {
              const isActive = i === activeIdx
              const r = 4.6 + s.ring * 0.22
              return (
                <circle
                  key={s.deputy.deputy_id}
                  cx={s.x}
                  cy={s.y}
                  r={isActive ? r + 2.4 : r}
                  fill={POSITION_COLORS[s.position]}
                  stroke={isActive ? '#1B2B50' : 'none'}
                  strokeWidth={isActive ? 2.5 : 0}
                  style={{ cursor: 'pointer', transition: 'r 0.1s ease' }}
                  onMouseEnter={() => { if (!pinned) setActiveIdx(i) }}
                  onMouseLeave={() => { if (!pinned) setActiveIdx(null) }}
                  onClick={() => {
                    if (pinned && activeIdx === i) {
                      router.push(`/deputes/${s.deputy.deputy_id}`)
                    } else {
                      setActiveIdx(i)
                      setPinned(true)
                    }
                  }}
                />
              )
            })}
          </g>
        ) : (
          <g>
            {arcs.map((a, i) => {
              const isActive = i === activeArc
              return (
                <path
                  key={a.group}
                  d={arcPath(a.startAngle, a.endAngle, HEMICYCLE_CENTER.rMin - 40, HEMICYCLE_CENTER.rMax)}
                  fill={partyHex(a.group === 'Non inscrit' ? null : a.group)}
                  opacity={activeArc === null || isActive ? 1 : 0.35}
                  stroke="#F7F4ED"
                  strokeWidth={3}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                  onClick={() => setActiveArc(isActive ? null : i)}
                  onMouseEnter={() => setActiveArc(i)}
                  onMouseLeave={() => setActiveArc(null)}
                />
              )
            })}
          </g>
        )}
      </svg>

      {/* Seat tooltip */}
      {view === 'seats' && activeSeat && (
        <div
          style={{
            position: 'absolute',
            left: `${(activeSeat.x / vb.width) * 100}%`,
            top: `calc(${(activeSeat.y / vb.height) * 100}% + 44px)`,
            transform: `translate(${activeSeat.x > vb.width * 0.62 ? '-100%' : activeSeat.x < vb.width * 0.38 ? '0' : '-50%'}, 12px)`,
            background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10,
            padding: '12px 16px', boxShadow: '0 8px 24px rgba(27,43,80,0.14)',
            zIndex: 20, minWidth: 200, pointerEvents: pinned ? 'auto' : 'none',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1B2B50' }}>{activeSeat.deputy.full_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: partyHex(activeSeat.deputy.party), display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#6B7280' }}>{activeSeat.deputy.party ?? 'Non inscrit'}</span>
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                color: '#fff', background: POSITION_COLORS[activeSeat.position],
              }}
            >
              {POSITION_LABELS[activeSeat.position]}
            </span>
          </div>
          <a
            href={`/deputes/${activeSeat.deputy.deputy_id}`}
            style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: '#C9302A', textDecoration: 'none' }}
          >
            Voir le profil →
          </a>
        </div>
      )}

      {/* Group arc detail */}
      {view === 'groups' && activeArc !== null && arcs[activeArc] && (
        <div style={{ marginTop: 14, background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#1B2B50' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: partyHex(arcs[activeArc].group === 'Non inscrit' ? null : arcs[activeArc].group), display: 'inline-block' }} />
            {arcs[activeArc].group}
            <span style={{ fontWeight: 400, color: '#9CA3AF' }}>· {arcs[activeArc].seatCount} député{arcs[activeArc].seatCount > 1 ? 's' : ''}</span>
          </span>
          <span className="font-mono" style={{ fontSize: 13, display: 'flex', gap: 14 }}>
            <span style={{ color: POSITION_COLORS.pour, fontWeight: 600 }}>{arcs[activeArc].counts.pour} pour</span>
            <span style={{ color: POSITION_COLORS.contre, fontWeight: 600 }}>{arcs[activeArc].counts.contre} contre</span>
            <span style={{ color: POSITION_COLORS.abstention }}>{arcs[activeArc].counts.abstention} abst.</span>
            <span style={{ color: POSITION_COLORS.nonVotant }}>{arcs[activeArc].counts.nonVotant} NV</span>
          </span>
        </div>
      )}

      {/* Legend */}
      {view === 'seats' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 16 }}>
          {legendEntries.map(p => (
            <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#4B5563' }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: POSITION_COLORS[p], display: 'inline-block' }} />
              {POSITION_LABELS[p]} <span className="font-mono" style={{ color: '#9CA3AF', fontSize: 12 }}>({counts[p]})</span>
              {p === 'nonVotant' && (
                <InfoTooltip
                  text="Non-votant : présent en séance mais n'a pas pris position. Différent de l'abstention, qui est une position exprimée. Les députés absents n'apparaissent pas sur ce schéma."
                  href="/methodologie#limites"
                  placement="bottom"
                  align="right"
                />
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
