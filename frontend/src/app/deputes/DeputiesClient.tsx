'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Deputy } from '@/lib/api'
import { partyShort, partyColor } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'

const PARTIES = [
  'Rassemblement National',
  'Ensemble pour la République',
  'La France insoumise - Nouveau Front Populaire',
  'Socialistes et apparentés',
  'Droite Républicaine',
  'Écologiste et Social',
  'Les Démocrates',
  'Horizons & Indépendants',
  'Libertés, Indépendants, Outre-mer et Territoires',
  'Union des droites pour la République',
  'Gauche Démocrate et Républicaine',
]

type DeputyList = { total: number; items: Deputy[]; limit: number; offset: number }

export function DeputiesClient({ initial }: { initial: DeputyList }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize from URL params (once on mount)
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [party, setParty]   = useState(() => searchParams.get('party') ?? '')
  const [dept,  setDept]    = useState(() => searchParams.get('dept')   ?? '')
  const [sort,  setSort]    = useState(() => searchParams.get('sort')   ?? 'nom')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Debounce search input
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Sync state → URL (skip first render to avoid spurious replace)
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

  // Unique department names from full list
  const departments = useMemo(() =>
    ([...new Set(initial.items.map(d => d.department).filter(Boolean))] as string[])
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [initial.items]
  )

  // Compose all filters client-side over the full loaded list
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

  // Sort — Nom A–Z only for now (presence/activity requires backend change:
  // list endpoint must include presence_rate + total_votes per deputy)
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
      {/* Search — always visible */}
      <div className="mb-3">
        <label htmlFor="deputy-search" className="sr-only">Rechercher un député</label>
        <input
          id="deputy-search"
          type="search"
          placeholder="Nom, département…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-border rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-navy"
        />
      </div>

      {/* Mobile: "Filtres" toggle */}
      <button
        onClick={() => setFiltersOpen(o => !o)}
        className="md:hidden mb-2 flex items-center gap-2 text-sm text-navy/70 border border-gray-border rounded-lg px-3 py-2 bg-white w-full"
        aria-expanded={filtersOpen}
        aria-controls="filter-row"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
        </svg>
        Filtres &amp; tri
        {activeFilterCount > 0 && (
          <span className="bg-red-civic text-white text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
        <span className="ml-auto text-xs">{filtersOpen ? '▲' : '▼'}</span>
      </button>

      {/* Filter + sort row — collapsible on mobile */}
      <div
        id="filter-row"
        className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col sm:flex-row gap-2 mb-4`}
      >
        <div className="flex-1">
          <label htmlFor="filter-groupe" className="sr-only">Groupe parlementaire</label>
          <select
            id="filter-groupe"
            value={party}
            onChange={e => setParty(e.target.value)}
            className="w-full border border-gray-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="">Tous les groupes</option>
            {PARTIES.map(p => (
              <option key={p} value={p}>{partyShort(p)} — {p}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="filter-dept" className="sr-only">Département</label>
          <select
            id="filter-dept"
            value={dept}
            onChange={e => setDept(e.target.value)}
            className="w-full border border-gray-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-navy"
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
            className="w-full border border-gray-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-navy"
          >
            <option value="nom">Trier : Nom A–Z</option>
            {/* TODO: add presence + activity options once list endpoint exposes those fields */}
          </select>
        </div>
      </div>

      {/* Count + clear */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-mid">
          {sorted.length} député{sorted.length !== 1 ? 's' : ''}
          {party && ` · ${partyShort(party)}`}
          {dept   && ` · ${dept}`}
        </p>
        {activeFilterCount > 0 && (
          <button onClick={clearAll} className="text-xs text-red-civic hover:underline">
            Effacer les filtres
          </button>
        )}
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-mid py-8 text-center">Aucun résultat</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map(d => (
            <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`}
              className="bg-white border border-gray-border rounded-lg p-4 hover:border-navy/30 transition-colors flex items-center gap-3">
              <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy truncate">{d.full_name}</p>
                <p className="text-xs text-gray-mid truncate">{d.department}</p>
              </div>
              {d.party && (
                <span
                  tabIndex={0}
                  className={`relative group text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 cursor-default outline-none focus-visible:ring-1 focus-visible:ring-navy/40 ${partyColor(d.party)}`}
                  aria-label={`Groupe : ${d.party}`}
                >
                  {partyShort(d.party)}
                  <span
                    role="tooltip"
                    className="absolute bottom-full right-0 mb-1.5 px-2 py-1 text-xs bg-navy text-white rounded whitespace-nowrap shadow-lg invisible group-hover:visible group-focus-within:visible pointer-events-none z-10"
                  >
                    {d.party}
                  </span>
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
