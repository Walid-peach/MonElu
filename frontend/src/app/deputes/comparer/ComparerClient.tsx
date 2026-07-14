'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  api,
  type Deputy,
  type Scorecard,
  type Alignment,
  type DeputyStats,
  type DivergingVoteItem,
} from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { positionStyle } from '@/lib/vote-position'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { ShareButton } from '@/components/ShareButton'

const NAVY   = '#1B2B50'
const CREAM  = '#F7F4ED'
const LINE   = '#E4E6EA'
const ACCENT = '#E0786E'
const RED    = '#C9302A'

type Mode = 'deputy' | 'party' | 'national'

type Side = {
  deputy: Deputy
  scorecard: Scorecard | null
  alignment: Alignment | null
}

function pct(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v * 100)
}

// ── Deputy picker (search + dropdown) ───────────────────────────────────────

function DeputyPicker({
  placeholder,
  onSelect,
  selected,
}: {
  placeholder: string
  onSelect: (d: Deputy) => void
  selected: Deputy | null
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Deputy[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 2) return
    let cancelled = false
    api.deputies.list({ search: q, limit: 6 }).then(res => {
      if (!cancelled) setResults(res.items)
    }).catch(() => { if (!cancelled) setResults([]) })
    return () => { cancelled = true }
  }, [debounced])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
        border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px',
      }}>
        <DeputyAvatar name={selected.full_name} photoUrl={selected.photo_url} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected.full_name}
          </div>
          <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>{selected.party ?? '—'}</div>
        </div>
        <button
          onClick={() => { setQuery(''); setResults([]); onSelect(null as unknown as Deputy) }}
          aria-label="Changer de député"
          style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
        >
          Changer
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{
          width: '100%', border: `1px solid ${LINE}`, borderRadius: 10,
          padding: '13px 16px', fontSize: 15, color: '#1F2937', background: '#fff',
        }}
      />
      {open && query.trim().length >= 2 && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
          background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden',
        }}>
          {results.map(d => (
            <button
              key={d.deputy_id}
              onClick={() => { onSelect(d); setOpen(false); setQuery('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.full_name}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{d.party ?? '—'}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Comparison bar row (A vs B, two stacked bars) ───────────────────────────

function CompareRow({
  label, aPct, bPct, aColor, bColor,
}: {
  label: string
  aPct: number | null
  bPct: number | null
  aColor: string
  bColor: string
}) {
  if (aPct === null && bPct === null) return null
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ fontSize: 13.5, color: '#6B7280', fontWeight: 500, marginBottom: 10 }}>{label}</div>
      {[{ v: aPct, color: aColor }, { v: bPct, color: bColor }].map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i === 0 ? 6 : 0 }}>
          <div style={{ flex: 1, height: 9, background: '#EEF0F2', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${row.v ?? 0}%`, background: row.color, borderRadius: 999, transition: 'width 0.4s' }} />
          </div>
          <span className="font-mono" style={{ width: 44, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: NAVY }}>
            {row.v === null ? '—' : `${row.v}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function ComparerClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const aId = searchParams.get('a') || ''
  const bId = searchParams.get('b') || ''
  const mode: Mode = (searchParams.get('mode') as Mode) || 'deputy'

  const [deputyA, setDeputyA] = useState<Deputy | null>(null)
  const [deputyB, setDeputyB] = useState<Deputy | null>(null)
  const [sideA, setSideA] = useState<Side | null>(null)
  const [sideB, setSideB] = useState<Side | null>(null)
  const [stats, setStats] = useState<DeputyStats | null>(null)
  const [divergingVotes, setDivergingVotes] = useState<DivergingVoteItem[]>([])
  const [loading, setLoading] = useState(false)

  const syncUrl = useCallback((next: { a?: string; b?: string; mode?: Mode }) => {
    const p = new URLSearchParams()
    const nextA = next.a !== undefined ? next.a : aId
    const nextB = next.b !== undefined ? next.b : bId
    const nextMode = next.mode !== undefined ? next.mode : mode
    if (nextA) p.set('a', nextA)
    if (nextMode === 'deputy' && nextB) p.set('b', nextB)
    if (nextMode !== 'deputy') p.set('mode', nextMode)
    router.replace(`/deputes/comparer${p.toString() ? `?${p}` : ''}`, { scroll: false })
  }, [aId, bId, mode, router])

  // Resolve deputy A / B from URL ids (deep-link support)
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!aId) return
      if (deputyA && deputyA.deputy_id === aId) return
      const d = await api.deputies.get(aId).catch(() => null)
      if (!cancelled) setDeputyA(d)
    }
    run()
    return () => { cancelled = true }
  }, [aId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (mode !== 'deputy' || !bId) return
      if (deputyB && deputyB.deputy_id === bId) return
      const d = await api.deputies.get(bId).catch(() => null)
      if (!cancelled) setDeputyB(d)
    }
    run()
    return () => { cancelled = true }
  }, [bId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch comparison data
  useEffect(() => {
    let cancelled = false

    async function loadSide(d: Deputy): Promise<Side> {
      const [scorecard, alignment] = await Promise.all([
        api.deputies.scorecard(d.deputy_id).catch(() => null),
        api.deputies.alignment(d.deputy_id).catch(() => null),
      ])
      return { deputy: d, scorecard, alignment }
    }

    async function run() {
      if (!deputyA) return
      setLoading(true)
      const a = await loadSide(deputyA)
      if (cancelled) return
      setSideA(a)

      if (mode === 'deputy' && deputyB) {
        const [b, diverging] = await Promise.all([
          loadSide(deputyB),
          api.deputies.divergingVotes(deputyA.deputy_id, deputyB.deputy_id, 20).catch(() => null),
        ])
        if (cancelled) return
        setSideB(b)
        setDivergingVotes(diverging?.items ?? [])
      } else if (mode === 'party') {
        const s = await api.deputies.stats(deputyA.party ?? undefined).catch(() => null)
        if (cancelled) return
        setStats(s)
      } else if (mode === 'national') {
        const s = await api.deputies.stats().catch(() => null)
        if (cancelled) return
        setStats(s)
      }
      if (!cancelled) setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [deputyA, deputyB, mode])

  const scorecardA = sideA?.scorecard ?? null
  const scorecardB = sideB?.scorecard ?? null

  const bLabel = mode === 'deputy'
    ? (deputyB?.full_name ?? 'Second député')
    : mode === 'party'
      ? `Moyenne du groupe${deputyA?.party ? ` (${deputyA.party})` : ''}`
      : 'Moyenne nationale'

  const rows = [
    { key: 'presence', label: 'Taux de présence aux votes', a: pct(scorecardA?.presence_rate), b: mode === 'deputy' ? pct(scorecardB?.presence_rate) : pct(stats?.avg_presence_rate) },
    { key: 'solennel', label: 'Participation aux scrutins solennels', a: pct(scorecardA?.solennel_participation_rate), b: mode === 'deputy' ? pct(scorecardB?.solennel_participation_rate) : pct(stats?.avg_solennel_participation_rate) },
    { key: 'voting_days', label: 'Présence par jour de vote', a: pct(scorecardA?.voting_days_rate), b: mode === 'deputy' ? pct(scorecardB?.voting_days_rate) : pct(stats?.avg_voting_days_rate) },
    { key: 'votes_for', label: 'Votes Pour (part des votes exprimés)', a: pct(scorecardA?.votes_for_pct), b: mode === 'deputy' ? pct(scorecardB?.votes_for_pct) : pct(stats?.avg_votes_for_pct) },
    { key: 'abstention', label: 'Abstentions (part des votes exprimés)', a: pct(scorecardA?.abstention_pct), b: mode === 'deputy' ? pct(scorecardB?.abstention_pct) : pct(stats?.avg_abstention_pct) },
  ]

  const shareUrl = `/deputes/comparer${(() => {
    const p = new URLSearchParams()
    if (aId) p.set('a', aId)
    if (mode === 'deputy' && bId) p.set('b', bId)
    if (mode !== 'deputy') p.set('mode', mode)
    return p.toString() ? `?${p}` : ''
  })()}`

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <div style={{ padding: '38px 24px 60px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
            Comparateur
          </div>
          <h1 className="font-newsreader" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 600, color: NAVY, margin: '12px 0 8px', letterSpacing: '-0.01em' }}>
            Comparer deux bilans
          </h1>
          <p style={{ fontSize: 15.5, color: '#4B5563', margin: '0 0 28px', maxWidth: 620 }}>
            Présence, votes et alignement, côte à côte. Comparez un·e député·e à un·e autre, à son groupe, ou à la moyenne nationale.
          </p>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {([
              { key: 'deputy', label: 'Un autre député' },
              { key: 'party', label: 'Son groupe' },
              { key: 'national', label: 'Moyenne nationale' },
            ] as { key: Mode; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => syncUrl({ mode: t.key })}
                style={{
                  padding: '9px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${mode === t.key ? NAVY : LINE}`,
                  background: mode === t.key ? NAVY : '#fff',
                  color: mode === t.key ? '#fff' : '#374151',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Pickers */}
          <div style={{ display: 'grid', gridTemplateColumns: mode === 'deputy' ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 30 }}>
            <DeputyPicker
              placeholder="Rechercher le premier député…"
              selected={deputyA}
              onSelect={d => { setDeputyA(d); syncUrl({ a: d?.deputy_id ?? '' }) }}
            />
            {mode === 'deputy' && (
              <DeputyPicker
                placeholder="Rechercher le second député…"
                selected={deputyB}
                onSelect={d => { setDeputyB(d); syncUrl({ b: d?.deputy_id ?? '' }) }}
              />
            )}
          </div>

          {!deputyA && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
              Choisissez au moins un·e député·e pour démarrer la comparaison.
            </div>
          )}

          {deputyA && loading && !sideA && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
              Chargement…
            </div>
          )}

          {deputyA && sideA && (
            <>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: NAVY }} />
                  <Link href={`/deputes/${deputyA.deputy_id}`} style={{ fontWeight: 700, fontSize: 16, color: NAVY, textDecoration: 'none' }}>
                    {deputyA.full_name}
                  </Link>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: ACCENT }} />
                  {mode === 'deputy' && deputyB ? (
                    <Link href={`/deputes/${deputyB.deputy_id}`} style={{ fontWeight: 700, fontSize: 16, color: NAVY, textDecoration: 'none' }}>
                      {deputyB.full_name}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{bLabel}</span>
                  )}
                </div>
              </div>

              {/* Stat rows */}
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 26px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {rows.map(r => (
                  <CompareRow key={r.key} label={r.label} aPct={r.a} bPct={r.b} aColor={NAVY} bColor={ACCENT} />
                ))}
              </div>

              {/* Party alignment (deputy-vs-deputy only) */}
              {mode === 'deputy' && sideA.alignment && sideB?.alignment && (
                <div style={{ marginTop: 24, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 26px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: 13.5, color: '#6B7280', fontWeight: 500, marginBottom: 14 }}>
                    Alignement avec son groupe politique
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: 22, color: NAVY }}>
                        {pct(sideA.alignment.party_alignment_rate)}%
                      </span>
                      <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>{sideA.alignment.party ?? '—'}</div>
                    </div>
                    <div>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: 22, color: NAVY }}>
                        {pct(sideB.alignment.party_alignment_rate)}%
                      </span>
                      <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>{sideB.alignment.party ?? '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Diverging votes (deputy-vs-deputy only) */}
              {mode === 'deputy' && deputyB && (
                <div style={{ marginTop: 30 }}>
                  <h2 className="font-newsreader" style={{ fontSize: 20, fontWeight: 600, color: NAVY, margin: '0 0 16px' }}>
                    Votes où ils ont divergé
                  </h2>
                  {divergingVotes.length === 0 ? (
                    <p style={{ fontSize: 14, color: '#9CA3AF' }}>
                      Aucun vote divergent trouvé entre ces deux député·e·s (sur les scrutins récents).
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {divergingVotes.map(v => (
                        <Link
                          key={v.vote_id}
                          href={`/votes/${v.vote_id}`}
                          style={{ display: 'block', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 18px', textDecoration: 'none' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            {v.voted_at && (
                              <span className="font-mono" style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(v.voted_at)}</span>
                            )}
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: positionStyle(v.position_a).color, background: positionStyle(v.position_a).bg }}>
                              {deputyA.full_name.split(' ')[0]} : {positionStyle(v.position_a).label}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: positionStyle(v.position_b).color, background: positionStyle(v.position_b).bg }}>
                              {deputyB.full_name.split(' ')[0]} : {positionStyle(v.position_b).label}
                            </span>
                          </div>
                          <div style={{ fontSize: 15, color: NAVY, lineHeight: 1.35 }}>{v.vote_title}</div>
                          {v.summary_plain && (
                            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 1.4 }}>{v.summary_plain}</div>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 30, display: 'flex', justifyContent: 'flex-end' }}>
                <ShareButton
                  url={shareUrl}
                  title="Comparaison de bilans - MonÉlu"
                  text={`Comparaison de ${deputyA.full_name}${mode === 'deputy' && deputyB ? ` et ${deputyB.full_name}` : ''} sur MonÉlu`}
                  ariaLabel="Partager cette comparaison"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
