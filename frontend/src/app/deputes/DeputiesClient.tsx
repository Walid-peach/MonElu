'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Deputy } from '@/lib/api'
import { getInitials, partyHex } from '@/lib/utils'

type DeputyList = { total: number; items: Deputy[]; limit: number; offset: number }

const PAGE_SIZE = 10
const NAVY = '#1B2B50'
const CREAM = '#F7F4ED'
const LINE = '#E4E6EA'
const ACCENT = '#E0786E'

export function DeputiesClient({ initial }: { initial: DeputyList }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [party, setParty]   = useState(() => searchParams.get('party') ?? '')
  const [dept,  setDept]    = useState(() => searchParams.get('dept')   ?? '')
  const [page,  setPage]    = useState(1)

  const parties = useMemo(
    () => [...new Set(initial.items.map(d => d.party).filter(Boolean))].sort() as string[],
    [initial.items]
  )

  const departments = useMemo(
    () => ([...new Set(initial.items.map(d => d.department).filter(Boolean))] as string[])
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [initial.items]
  )

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const skipFirstSync = useRef(true)
  useEffect(() => {
    if (skipFirstSync.current) { skipFirstSync.current = false; return }
    const p = new URLSearchParams()
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (party)           p.set('party',  party)
    if (dept)            p.set('dept',   dept)
    const qs = p.toString()
    router.replace(`/deputes${qs ? `?${qs}` : ''}`, { scroll: false })
    setPage(1)
  }, [debouncedSearch, party, dept, router])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return initial.items
      .filter(d => {
        if (party && d.party !== party) return false
        if (dept  && d.department !== dept) return false
        if (q) return (
          d.full_name.toLowerCase().includes(q) ||
          (d.department?.toLowerCase().includes(q) ?? false) ||
          (d.party?.toLowerCase().includes(q) ?? false)
        )
        return true
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
  }, [initial.items, party, dept, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function clearAll() { setSearch(''); setParty(''); setDept(''); setPage(1) }

  function selectParty(p: string) {
    setParty(prev => prev === p ? '' : p)
    setPage(1)
  }

  function getPageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1, 2, 3]
    if (safePage > 5) pages.push('…')
    if (safePage > 4 && safePage < totalPages - 3) {
      pages.push(safePage - 1, safePage, safePage + 1)
    }
    if (safePage < totalPages - 4) pages.push('…')
    pages.push(totalPages - 1, totalPages)
    return [...new Set(pages)].sort((a, b) => {
      if (a === '…' || b === '…') return 0
      return (a as number) - (b as number)
    })
  }

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{
        padding: '50px 56px 40px',
        background: 'linear-gradient(180deg,#fff 0%,' + CREAM + ' 100%)',
        borderBottom: '1px solid #ECE7DC',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{
            fontWeight: 700, fontSize: 12, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#C9302A', marginBottom: 16,
          }}>
            Annuaire des députés
          </div>
          <h1 className="font-serif" style={{
            fontWeight: 600, fontSize: 'clamp(32px,4vw,48px)', lineHeight: 1.05,
            letterSpacing: '-0.015em', color: NAVY, margin: 0, maxWidth: 760,
          }}>
            Les {initial.total} députés de l&apos;Assemblée nationale,{' '}
            <span style={{ color: '#C9302A' }}>en clair</span>.
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: '#4B5563', maxWidth: 540 }}>
            Recherchez un élu, filtrez par groupe ou par territoire, et accédez à son bilan de vote complet.
          </p>

          {/* Search row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 28, maxWidth: 720 }}>
            <label htmlFor="deputy-search" className="sr-only">Rechercher un député</label>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', border: '1px solid ' + LINE, borderRadius: 10,
              padding: '0 18px', height: 54, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>
              </svg>
              <input
                id="deputy-search"
                type="search"
                placeholder="Nom, circonscription ou département…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 16,
                  color: '#1F2937', background: 'transparent',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Effacer la recherche"
                  style={{ color: '#9CA3AF', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setDebouncedSearch(search)}
              style={{
                display: 'flex', alignItems: 'center', background: ACCENT, color: '#fff',
                height: 54, padding: '0 30px', borderRadius: 10, fontWeight: 600,
                fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(224,120,110,0.4)', border: 'none',
              }}
            >
              Rechercher
            </button>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 18, alignItems: 'center' }}>
            <button
              onClick={() => { setParty(''); setPage(1) }}
              style={{
                background: party === '' ? NAVY : '#fff',
                color: party === '' ? '#fff' : '#4B5563',
                border: '1px solid ' + (party === '' ? NAVY : LINE),
                padding: '8px 16px', borderRadius: 999, fontSize: 13.5,
                fontWeight: party === '' ? 600 : 400, cursor: 'pointer',
              }}
            >
              Tous
            </button>
            {parties.map(p => (
              <button
                key={p}
                onClick={() => selectParty(p)}
                aria-pressed={party === p}
                style={{
                  background: party === p ? NAVY : '#fff',
                  color: party === p ? '#fff' : '#4B5563',
                  border: '1px solid ' + (party === p ? NAVY : LINE),
                  padding: '8px 16px', borderRadius: 999, fontSize: 13.5,
                  fontWeight: party === p ? 600 : 400, cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <label htmlFor="filter-dept" className="sr-only">Région / département</label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1px solid ' + LINE,
                padding: '8px 16px', borderRadius: 999, fontSize: 13.5,
                color: '#4B5563', cursor: 'pointer',
              }}>
                <select
                  id="filter-dept"
                  value={dept}
                  onChange={e => { setDept(e.target.value); setPage(1) }}
                  style={{
                    border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 13.5, color: '#4B5563', cursor: 'pointer',
                    appearance: 'none', paddingRight: 4,
                  }}
                >
                  <option value="">Toutes régions</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="m5 9 7 7 7-7"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table section */}
      <div style={{ padding: '32px 56px 72px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Count + sort row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 14px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#6B7280' }}>
              {filtered.length} député{filtered.length !== 1 ? 's' : ''} · triés par nom
            </span>
            <span style={{ fontSize: 13.5, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 7 }}>
              {(party || dept || debouncedSearch) && (
                <button
                  onClick={clearAll}
                  style={{ color: '#C9302A', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  Effacer les filtres ×
                </button>
              )}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <p style={{ color: '#6B7280', fontSize: 15, marginBottom: 12 }}>Aucun résultat pour cette recherche</p>
              <button
                onClick={clearAll}
                style={{ fontSize: 14, color: NAVY, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Effacer les filtres
              </button>
            </div>
          ) : (
            <>
              {/* Table card */}
              <div style={{
                background: '#fff', border: '1px solid ' + LINE,
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 260px 34px',
                  gap: 18, padding: '13px 26px',
                  borderBottom: '1px solid ' + LINE, background: '#FBFAF6',
                  font: '600 11.5px/1 var(--font-body)',
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF',
                }}>
                  <span>Député·e</span>
                  <span>Groupe</span>
                  <span />
                </div>

                {/* Rows */}
                {paginated.map(d => {
                  const hex = partyHex(d.party)
                  const initials = getInitials(d.full_name)
                  return (
                    <Link
                      key={d.deputy_id}
                      href={`/deputes/${d.deputy_id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 260px 34px',
                          gap: 18, padding: '15px 26px',
                          borderBottom: '1px solid #F0F1F3',
                          alignItems: 'center', cursor: 'pointer',
                          background: '#fff', transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FBFAF6')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        {/* Deputy */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                          <span style={{
                            width: 42, height: 42, flexShrink: 0, borderRadius: 999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 14, color: '#fff', background: hex,
                          }}>
                            {initials}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15.5, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.full_name}
                            </div>
                            <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>
                              {d.department ?? '—'}
                            </div>
                          </div>
                        </div>

                        {/* Group */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: hex }} />
                          <span style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.party ?? '—'}
                          </span>
                        </div>

                        {/* Arrow */}
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4C9D2" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                          <path d="m9 6 6 6-6 6"/>
                        </svg>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 26, fontSize: 14, color: '#6B7280' }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    style={{
                      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid ' + LINE, borderRadius: 8, background: '#fff', cursor: safePage === 1 ? 'default' : 'pointer',
                      opacity: safePage === 1 ? 0.4 : 1,
                    }}
                  >
                    ‹
                  </button>
                  {getPageNumbers().map((n, i) =>
                    n === '…' ? (
                      <span key={`ellipsis-${i}`} style={{ padding: '0 6px' }}>…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n as number)}
                        style={{
                          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, cursor: 'pointer',
                          background: safePage === n ? NAVY : '#fff',
                          color: safePage === n ? '#fff' : '#6B7280',
                          border: safePage === n ? 'none' : '1px solid ' + LINE,
                          fontWeight: safePage === n ? 600 : 400,
                        }}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    style={{
                      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid ' + LINE, borderRadius: 8, background: '#fff', cursor: safePage === totalPages ? 'default' : 'pointer',
                      opacity: safePage === totalPages ? 0.4 : 1,
                    }}
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
