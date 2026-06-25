'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Deputy } from '@/lib/api'
import { partyShort, partyColor } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'

type DeputyList = { total: number; items: Deputy[]; limit: number; offset: number }

export function DeputiesClient({ initial }: { initial: DeputyList }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [party, setParty]   = useState(() => searchParams.get('party') ?? '')
  const [dept,  setDept]    = useState(() => searchParams.get('dept')   ?? '')
  const [sort,  setSort]    = useState(() => searchParams.get('sort')   ?? 'nom')

  const parties = useMemo(
    () => [...new Set(initial.items.map(d => d.party).filter(Boolean))].sort() as string[],
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
    if (sort !== 'nom')  p.set('sort',   sort)
    const qs = p.toString()
    router.replace(`/deputes${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [debouncedSearch, party, dept, sort, router])

  const departments = useMemo(() =>
    ([...new Set(initial.items.map(d => d.department).filter(Boolean))] as string[])
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [initial.items]
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return initial.items.filter(d => {
      if (party && d.party !== party) return false
      if (dept  && d.department !== dept) return false
      if (q) return (
        d.full_name.toLowerCase().includes(q) ||
        (d.department?.toLowerCase().includes(q) ?? false) ||
        (d.party?.toLowerCase().includes(q) ?? false)
      )
      return true
    })
  }, [initial.items, party, dept, debouncedSearch])

  const sorted = useMemo(() =>
    sort === 'nom'
      ? [...filtered].sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
      : filtered,
    [filtered, sort]
  )

  const activeFilterCount = [party, dept, debouncedSearch].filter(Boolean).length

  function clearAll() { setSearch(''); setParty(''); setDept(''); setSort('nom') }

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-5">
        <label htmlFor="deputy-search" className="sr-only">Rechercher un député</label>
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-mid pointer-events-none"
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          id="deputy-search"
          type="search"
          placeholder="Rechercher par nom, département…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-border rounded-xl pl-11 pr-4 py-3 text-sm bg-white focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-mid hover:text-navy p-1"
            aria-label="Effacer la recherche"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Party pill strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 sp" role="group" aria-label="Filtrer par groupe parlementaire">
        <button
          onClick={() => setParty('')}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
            party === ''
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-navy/70 border-gray-border hover:border-navy/40'
          }`}
        >
          Tous
        </button>
        {parties.map(p => (
          <button
            key={p}
            onClick={() => setParty(prev => prev === p ? '' : p)}
            aria-pressed={party === p}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
              party === p
                ? `${partyColor(p)} border-transparent ring-2 ring-offset-1 ring-navy/20`
                : `bg-white text-navy/70 border-gray-border hover:border-navy/40`
            }`}
          >
            {partyShort(p)}
          </button>
        ))}
      </div>

      {/* Department + sort row */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1">
          <label htmlFor="filter-dept" className="sr-only">Département</label>
          <select
            id="filter-dept"
            value={dept}
            onChange={e => setDept(e.target.value)}
            className="w-full border border-gray-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="">Tous les départements</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-sort" className="sr-only">Trier par</label>
          <select
            id="filter-sort"
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="border border-gray-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="nom">Nom A–Z</option>
          </select>
        </div>
      </div>

      {/* Count + clear */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-gray-mid">
          <span className="font-medium text-navy">{sorted.length}</span> député·e·s
          {party && ` · ${partyShort(party)}`}
          {dept   && ` · ${dept}`}
        </p>
        {activeFilterCount > 0 && (
          <button onClick={clearAll} className="text-xs text-red-civic hover:underline flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Effacer les filtres
          </button>
        )}
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-mid text-sm mb-3">Aucun résultat pour cette recherche</p>
          <button onClick={clearAll} className="text-sm text-navy underline underline-offset-2">
            Effacer les filtres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(d => (
            <Link
              key={d.deputy_id}
              href={`/deputes/${d.deputy_id}`}
              className="group bg-white border border-gray-border rounded-xl p-4 hover:border-navy/30 hover:shadow-sm transition-all flex items-center gap-3"
            >
              <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy truncate group-hover:text-navy leading-snug">
                  {d.full_name}
                </p>
                <p className="text-xs text-gray-mid truncate mt-0.5">{d.department}</p>
                {d.party && (
                  <span
                    className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${partyColor(d.party)}`}
                    aria-label={`Groupe : ${d.party}`}
                    title={d.party}
                  >
                    {partyShort(d.party)}
                  </span>
                )}
              </div>
              <svg
                className="text-gray-border group-hover:text-navy/30 flex-shrink-0 transition-colors"
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
