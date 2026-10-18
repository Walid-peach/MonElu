'use client'

// The vote replayed in a 3D chamber: each deputy's vote falls into their seat
// and colours it, while the count rises. Seats are the same as the flat
// HemicycleChart's (layoutSeats), drawn by buildChamber in lib/hemicycle3d.
//
// The chamber is rendered once; the animation writes attributes through the
// DOM (ball positions, seat states, the readout) instead of re-rendering React
// per frame. Under prefers-reduced-motion the final state is shown at once.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { layoutSeats, type HemicycleDeputy, type SeatPosition } from '@/lib/hemicycle'
import { buildChamber, type Face, type Point3 } from '@/lib/hemicycle3d'
import { POSITION_COLORS, POSITION_LABELS } from '@/components/HemicycleChart'

interface Props {
  deputies: HemicycleDeputy[]
  /** A line shown under the chamber on phones only (below 640px, where seats are too small to read one by one). */
  phoneHint?: string
}

const DROP_SECONDS = 6 // over which the votes come in
const FALL_SECONDS = 0.6 // one ball's fall
const FALL_HEIGHT = 70 // world units above the seat
const BALL_MARGIN = 10 // spare balls on top of the most that can be in the air at once
const COUNTED: SeatPosition[] = ['pour', 'contre', 'abstention', 'nonVotant']

/** A stable shuffle keyed on deputy ids, so a vote always replays in the same order. */
function landingOrder(ids: string[]): number[] {
  const hash = (s: string) => {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return h >>> 0
  }
  return ids.map((id, i) => [hash(id), i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i)
}

const ZERO: Record<SeatPosition, number> = { pour: 0, contre: 0, abstention: 0, nonVotant: 0, absent: 0 }

const faceClass = (f: Face) => (f.tone === 'top' ? 'hc3-top' : `hc3-s${f.tone}`)

function summary(counts: Record<SeatPosition, number>): string {
  return `${counts.pour} pour · ${counts.contre} contre · ${counts.abstention} abst. · ${counts.nonVotant} non-votants`
}

const CSS = `
.hc3 path{stroke:color-mix(in srgb,var(--dp-text) 26%,var(--dp-card-bg));stroke-width:.5;stroke-linejoin:round}
.hc3 .hc3-top{fill:color-mix(in srgb,var(--dp-text) 3%,var(--dp-card-bg))}
.hc3 .hc3-s3{fill:color-mix(in srgb,var(--dp-text) 6%,var(--dp-card-bg))}
.hc3 .hc3-s2{fill:color-mix(in srgb,var(--dp-text) 9%,var(--dp-card-bg))}
.hc3 .hc3-s1{fill:color-mix(in srgb,var(--dp-text) 12%,var(--dp-card-bg))}
.hc3 .hc3-s0{fill:color-mix(in srgb,var(--dp-text) 15%,var(--dp-card-bg))}
${(Object.keys(POSITION_COLORS) as SeatPosition[]).map(
  p => `.hc3 [data-pos="${p}"] .hc3-top{fill:${POSITION_COLORS[p]}}
.hc3 [data-pos="${p}"] path:not(.hc3-top){fill:color-mix(in srgb,${POSITION_COLORS[p]} 72%,#000)}
.hc3 circle[data-pos="${p}"]{fill:${POSITION_COLORS[p]}}`,
).join('\n')}
.hc3 circle{stroke:var(--dp-card-bg);stroke-width:.6}
`

export function HemicycleReplay({ deputies, phoneHint }: Props) {
  const seats = useMemo(() => layoutSeats(deputies), [deputies])
  const chamber = useMemo(() => buildChamber(seats), [seats])
  const order = useMemo(() => landingOrder(seats.map(s => s.deputy.deputy_id)), [seats])
  const final = useMemo(() => {
    const c: Record<SeatPosition, number> = { pour: 0, contre: 0, abstention: 0, nonVotant: 0, absent: 0 }
    for (const s of seats) c[s.position]++
    return c
  }, [seats])

  // votes land evenly over DROP_SECONDS and each falls for FALL_SECONDS, so at most this many are in the air
  const balls = Math.ceil((seats.length * FALL_SECONDS) / DROP_SECONDS) + BALL_MARGIN

  const svgRef = useRef<SVGSVGElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef(0)
  const [run, setRun] = useState(0)
  const liveRef = useRef<HTMLParagraphElement>(null)

  const play = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    cancelAnimationFrame(frameRef.current)
    const seatEls: Element[] = []
    svg.querySelectorAll('[data-seat]').forEach(el => (seatEls[Number(el.getAttribute('data-seat'))] = el))
    const balls = Array.from(svg.querySelectorAll('[data-ball]'))
    const landAt = new Array<number>(seats.length)
    order.forEach((n, i) => (landAt[n] = (DROP_SECONDS * i) / Math.max(1, order.length) + FALL_SECONDS))
    // Every run starts from empty seats: a replay must clear the colours the last run left behind.
    const shown = new Array<string>(seats.length).fill('')
    seatEls.forEach(el => el?.removeAttribute('data-pos'))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const total = DROP_SECONDS + FALL_SECONDS
    const announce = (text: string) => { if (liveRef.current) liveRef.current.textContent = text }
    announce('')

    const draw = (t: number) => {
      const counts: Record<SeatPosition, number> = { pour: 0, contre: 0, abstention: 0, nonVotant: 0, absent: 0 }
      let ball = 0
      for (let n = 0; n < seats.length; n++) {
        const L = landAt[n]!
        const pos = seats[n]!.position
        let state = ''
        if (t >= L) {
          state = pos
          counts[pos]++
        } else if (t > L - FALL_SECONDS && ball < balls.length) {
          const u = (t - (L - FALL_SECONDS)) / FALL_SECONDS
          const [x, y, z] = chamber.seats[n]!.top
          const [sx, sy] = chamber.project([x, y, z + FALL_HEIGHT * (1 - u * u)] as Point3)
          const el = balls[ball++]!
          el.setAttribute('cx', sx.toFixed(1))
          el.setAttribute('cy', sy.toFixed(1))
          el.setAttribute('data-pos', pos)
          el.setAttribute('visibility', 'visible')
        }
        if (shown[n] !== state) {
          shown[n] = state
          if (state) seatEls[n]?.setAttribute('data-pos', state)
          else seatEls[n]?.removeAttribute('data-pos')
        }
      }
      for (; ball < balls.length; ball++) balls[ball]!.setAttribute('visibility', 'hidden')
      if (readoutRef.current) readoutRef.current.textContent = summary(counts)
    }

    if (reduced) {
      draw(total)
      announce(`Vote rejoué : ${summary(final)}.`)
      return
    }
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = (now - start) / 1000
      draw(Math.min(t, total))
      if (t < total) frameRef.current = requestAnimationFrame(tick)
      else announce(`Vote rejoué : ${summary(final)}.`)
    }
    draw(0)
    frameRef.current = requestAnimationFrame(tick)
  }, [seats, order, chamber, final])

  // The first run waits until the chamber is on screen, since the vote section sits below the
  // fold; a replay, reduced motion or a browser without IntersectionObserver plays at once.
  useEffect(() => {
    const svg = svgRef.current
    const stop = () => cancelAnimationFrame(frameRef.current)
    if (
      run > 0 || !svg || typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      play()
      return stop
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          observer.disconnect()
          play()
        }
      },
      { threshold: 0.35 },
    )
    // until the drop starts the seats are empty, so the count must read zero, not the result
    if (readoutRef.current) readoutRef.current.textContent = summary(ZERO)
    observer.observe(svg)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [play, run])

  if (seats.length === 0) return null

  return (
    <div>
      <svg
        ref={svgRef}
        className="hc3"
        viewBox={`0 0 ${chamber.width} ${chamber.height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`L'hémicycle en trois dimensions : chaque vote tombe dans le siège de son député. ${summary(final)}.`}
      >
        <style>{CSS}</style>
        {chamber.layers.map((layer, i) =>
          layer.kind === 'solid' ? (
            <g key={`s${i}`}>
              {layer.solid.faces.map((f, j) => (
                <path key={j} className={faceClass(f)} d={f.d} />
              ))}
            </g>
          ) : (
            <g key={layer.seat.deputyId} data-seat={layer.seat.index}>
              {layer.seat.solid.faces.map((f, j) => (
                <path key={j} className={faceClass(f)} d={f.d} />
              ))}
            </g>
          ),
        )}
        <g>
          {Array.from({ length: balls }, (_, i) => (
            <circle key={i} data-ball="" r={2.6} cx={0} cy={0} visibility="hidden" />
          ))}
        </g>
      </svg>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        <span ref={readoutRef} className="font-mono" style={{ fontSize: 13, color: 'var(--dp-text-secondary)' }}>
          {summary(final)}
        </span>
        <button
          type="button"
          onClick={() => setRun(r => r + 1)}
          style={{
            border: '1px solid var(--dp-border)', background: 'var(--dp-card-bg)', color: 'var(--dp-text)',
            borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Rejouer le vote
        </button>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
        {COUNTED.filter(p => final[p] > 0).map(p => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--dp-text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: POSITION_COLORS[p], display: 'inline-block' }} />
            {POSITION_LABELS[p]}
          </span>
        ))}
      </div>
      {phoneHint && (
        <p className="sm:hidden" style={{ fontSize: 13, color: 'var(--dp-text-secondary)', margin: '12px 0 0' }}>
          {phoneHint}
        </p>
      )}
      <p ref={liveRef} aria-live="polite" className="sr-only" />
    </div>
  )
}
