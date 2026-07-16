'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Deputy } from '@/lib/api'
import { getInitials, partyHex, partyShort } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { resolvePostalCode } from '@/lib/postal'
import { departmentCode, departmentLabel } from '@/lib/departments'

type DeputyList = { total: number; items: Deputy[]; limit: number; offset: number }
type SortKey = 'nom' | 'region' | 'parti'

const PAGE_SIZE = 10
const NAVY = '#1B2B50'
const CREAM = '#F7F4ED'
const LINE = '#E4E6EA'
const ACCENT = '#E0786E'

export function DeputiesClient({ initial }: { initial: DeputyList }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [sort,   setSort]   = useState<SortKey>('nom')
  const [page,   setPage]   = useState(1)

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const [postalResult, setPostalResult] = useState<{ code: string; department: string | null } | null>(null)
  useEffect(() => {
    if (!/^\d{5}$/.test(debouncedSearch)) return
    let cancelled = false
    resolvePostalCode(debouncedSearch).then(department => {
      if (!cancelled) setPostalResult({ code: debouncedSearch, department })
    })
    return () => { cancelled = true }
  }, [debouncedSearch])

  const postalMatch = postalResult?.code === debouncedSearch ? postalResult : null
  const resolvedDepartment = postalMatch?.department ?? ''
  const postalNotFound = postalMatch !== null && postalMatch.department === null
  // Department page cross-link (MON-107) — shown when the search resolves to
  // a department, whether via a postal code or a typed name/code.
  const matchedDeptCode = departmentCode(resolvedDepartment || debouncedSearch)

  const skipFirstSync = useRef(true)
  useEffect(() => {
    if (skipFirstSync.current) { skipFirstSync.current = false; return }
    const p = new URLSearchParams()
    if (debouncedSearch) p.set('search', debouncedSearch)
    const qs = p.toString()
    router.replace(`/deputes${qs ? `?${qs}` : ''}`, { scroll: false })
    setPage(1)
  }, [debouncedSearch, router])

  const filtered = useMemo(() => {
    const q = (resolvedDepartment || debouncedSearch).toLowerCase()
    const items = q
      ? initial.items.filter(d =>
          d.full_name.toLowerCase().includes(q) ||
          // Match the label users see ("Polynésie française (987)"), not just
          // the raw stored value, which is still a bare code for some deputies
          (departmentLabel(d.department)?.toLowerCase().includes(q) ?? false) ||
          (d.department?.toLowerCase().includes(q) ?? false) ||
          (d.party?.toLowerCase().includes(q) ?? false)
        )
      : [...initial.items]

    if (sort === 'nom')    return items.sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
    if (sort === 'region') return items.sort((a, b) => (departmentLabel(a.department) ?? '').localeCompare(departmentLabel(b.department) ?? '', 'fr'))
    if (sort === 'parti')  return items.sort((a, b) => (a.party ?? '').localeCompare(b.party ?? '', 'fr'))
    return items
  }, [initial.items, debouncedSearch, resolvedDepartment, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of initial.items) {
      const key = d.party ?? 'Non inscrit'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([party, count]) => ({ party, count }))
      .sort((a, b) => b.count - a.count)
  }, [initial.items])
  const maxGroupCount = groupCounts[0]?.count ?? 1

  function clearSearch() { setSearch(''); setPage(1) }

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
      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10"
        style={{
          background: 'linear-gradient(180deg,#fff 0%,' + CREAM + ' 100%)',
          borderBottom: '1px solid #ECE7DC',
        }}
      >
        <div className="xl:grid xl:grid-cols-[1fr_340px] xl:gap-16 xl:items-start" style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="xl:col-start-1 xl:row-start-1" style={{
            fontWeight: 700, fontSize: 12, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#C9302A', marginBottom: 16,
          }}>
            Annuaire des députés
          </div>
          <h1 className="font-newsreader text-[clamp(32px,4vw,48px)] xl:col-start-1 xl:row-start-2" style={{
            fontWeight: 600, lineHeight: 1.05,
            letterSpacing: '-0.015em', color: NAVY, margin: 0, maxWidth: 760,
          }}>
            Les {initial.total} députés de l&apos;Assemblée nationale,{' '}
            <span style={{ color: '#C9302A' }}>en clair</span>.
          </h1>
          <p className="xl:col-start-1 xl:row-start-3" style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: '#4B5563', maxWidth: 540 }}>
            Recherchez un élu, filtrez par groupe ou par territoire, et accédez à son bilan de vote complet.
          </p>

          {/* Group distribution */}
          <div className="hidden xl:block xl:col-start-2 xl:row-start-1 xl:row-span-5 xl:self-start" style={{ width: 340 }}>
            <div style={{
              background: '#fff', border: '1px solid ' + LINE, borderRadius: 14,
              padding: '24px 26px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 18,
              }}>
                Répartition par groupe
              </div>
              {groupCounts.map(g => (
                <div key={g.party} style={{ marginBottom: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: partyHex(g.party) }} />
                      <span style={{ color: '#374151', fontWeight: 600 }}>{partyShort(g.party)}</span>
                    </span>
                    <span className="font-mono" style={{ color: '#9CA3AF' }}>{g.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: '#F0F1F3', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(g.count / maxGroupCount) * 100}%`, background: partyHex(g.party), borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Search row */}
          <div className="flex flex-col sm:flex-row gap-3 mt-7 max-w-[720px] xl:col-start-1 xl:row-start-4">
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
                  onClick={clearSearch}
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
              className="w-full sm:w-auto justify-center"
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

          {/* Sort dropdown */}
          <div className="xl:col-start-1 xl:row-start-5" style={{ display: 'flex', gap: 9, marginTop: 18, alignItems: 'center' }}>
            <label htmlFor="deputy-sort" style={{ fontSize: 13.5, color: '#9CA3AF', marginRight: 4 }}>Trier par</label>
            <select
              id="deputy-sort"
              value={sort}
              onChange={e => { setSort(e.target.value as SortKey); setPage(1) }}
              style={{
                background: '#fff', color: '#1B2B50',
                border: '1px solid ' + LINE, borderRadius: 999,
                padding: '8px 34px 8px 16px', fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
              }}
            >
              <option value="nom">Nom</option>
              <option value="region">Région</option>
              <option value="parti">Groupe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table section */}
      <div className="px-5 sm:px-14 pt-8 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Department page cross-link */}
          {matchedDeptCode && (
            <div style={{ padding: '0 4px 14px' }}>
              <Link
                href={`/departements/${matchedDeptCode}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#fff', border: '1px solid ' + LINE, borderRadius: 999,
                  padding: '8px 16px', fontSize: 13.5, fontWeight: 600,
                  color: NAVY, textDecoration: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                Voir la page du département {departmentLabel(matchedDeptCode)} →
              </Link>
            </div>
          )}

          {/* Count row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 14px' }}>
            <span className="font-mono" style={{ fontSize: 13, color: '#6B7280' }}>
              {filtered.length} député{filtered.length !== 1 ? 's' : ''}
            </span>
            {debouncedSearch && (
              <button
                onClick={clearSearch}
                style={{ color: '#C9302A', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                Effacer la recherche ×
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <p style={{ color: '#6B7280', fontSize: 15, marginBottom: 12 }}>
                {postalNotFound
                  ? 'Code postal introuvable. Essayez un nom, une circonscription ou un département.'
                  : 'Aucun résultat pour cette recherche'}
              </p>
              <button
                onClick={clearSearch}
                style={{ fontSize: 14, color: NAVY, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Effacer la recherche
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
                <div
                  className="grid grid-cols-[1fr_20px] sm:grid-cols-[1fr_260px_34px] gap-3 sm:gap-[18px] px-4 sm:px-[26px] py-[13px]"
                  style={{
                    borderBottom: '1px solid ' + LINE, background: '#FBFAF6',
                    font: '600 11.5px/1 var(--font-body)',
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF',
                  }}
                >
                  <span>Député·e</span>
                  <span className="hidden sm:inline">Groupe</span>
                  <span className="hidden sm:inline" />
                </div>

                {/* Rows */}
                {paginated.map(d => {
                  const hex = partyHex(d.party)
                  return (
                    <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`} style={{ textDecoration: 'none' }}>
                      <div
                        className="grid grid-cols-[1fr_20px] sm:grid-cols-[1fr_260px_34px] gap-3 sm:gap-[18px] px-4 sm:px-[26px] py-[13px]"
                        style={{
                          borderBottom: '1px solid #F0F1F3',
                          alignItems: 'center', cursor: 'pointer',
                          background: '#fff', transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FBFAF6')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        {/* Deputy */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                          <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15.5, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.full_name}
                            </div>
                            <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>
                              {departmentLabel(d.department) ?? '—'}
                            </div>
                          </div>
                        </div>

                        {/* Group */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }} title={d.party ?? undefined}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: hex }} />
                          <span className="hidden sm:inline" style={{ fontSize: 14, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.party ?? '—'}
                          </span>
                        </div>

                        {/* Arrow */}
                        <svg className="hidden sm:block" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4C9D2" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
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
                      border: '1px solid ' + LINE, borderRadius: 8, background: '#fff',
                      cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.4 : 1,
                    }}
                  >‹</button>
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
                      >{n}</button>
                    )
                  )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    style={{
                      width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid ' + LINE, borderRadius: 8, background: '#fff',
                      cursor: safePage === totalPages ? 'default' : 'pointer', opacity: safePage === totalPages ? 0.4 : 1,
                    }}
                  >›</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
