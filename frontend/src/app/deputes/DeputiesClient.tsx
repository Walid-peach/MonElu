'use client'
import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Deputy } from '@/lib/api'
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

// API max limit is 200. Fetch all pages in parallel and combine.
async function fetchAllDeputies(party?: string): Promise<Deputy[]> {
  const first = await api.deputies.list({ party, limit: 200, offset: 0 })
  const total = first.total
  if (total <= 200) return first.items
  const extraPages = Math.ceil((total - 200) / 200)
  const rest = await Promise.all(
    Array.from({ length: extraPages }, (_, i) =>
      api.deputies.list({ party, limit: 200, offset: 200 + i * 200 })
    )
  )
  return [...first.items, ...rest.flatMap(r => r.items)]
}

export function DeputiesClient({ initial }: { initial: DeputyList }) {
  const [party, setParty] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const isSearching = search.length > 0

  // Paginated browsing
  const { data: pageData, isLoading: pageLoading } = useSWR<DeputyList>(
    !isSearching ? `deputies:${party}:${offset}` : null,
    () => api.deputies.list({ party: party || undefined, limit: 50, offset }),
    { keepPreviousData: true }
  )

  // Full list for search — fetches all pages in parallel, cached by party
  const { data: allDeputies, isLoading: allLoading } = useSWR<Deputy[]>(
    isSearching ? `deputies:all:${party}` : null,
    () => fetchAllDeputies(party || undefined)
  )

  const isLoading = isSearching ? allLoading : pageLoading
  const total = pageData?.total ?? initial.total

  const filtered = isSearching && allDeputies
    ? allDeputies.filter(d =>
        d.full_name.toLowerCase().includes(search.toLowerCase()) ||
        d.department?.toLowerCase().includes(search.toLowerCase())
      )
    : null

  const deputies = filtered ?? pageData?.items ?? initial.items

  return (
    <div>
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          placeholder="Rechercher un député ou département..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-border rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-navy"
        />
        <select
          value={party}
          onChange={e => { setParty(e.target.value); setOffset(0); setSearch('') }}
          className="border border-gray-border rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-navy">
          <option value="">Tous les groupes</option>
          {PARTIES.map(p => (
            <option key={p} value={p}>{partyShort(p)} — {p}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-mid mb-4">
        {isSearching
          ? isLoading ? 'Recherche...' : `${deputies.length} résultat${deputies.length !== 1 ? 's' : ''}`
          : `${total} député${total !== 1 ? 's' : ''}`}
        {party && ` · ${partyShort(party)}`}
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-light rounded-lg animate-pulse" />
          ))}
        </div>
      ) : deputies.length === 0 ? (
        <p className="text-sm text-gray-mid py-8 text-center">Aucun résultat</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {deputies.map(d => (
            <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`}
              className="bg-white border border-gray-border rounded-lg p-4 hover:border-navy/30 transition-colors flex items-center gap-3">
              <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy truncate">{d.full_name}</p>
                <p className="text-xs text-gray-mid truncate">{d.department}</p>
              </div>
              {d.party && (
                <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${partyColor(d.party)}`}>
                  {partyShort(d.party)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination — hidden while searching */}
      {!isSearching && total > 50 && (
        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => setOffset(Math.max(0, offset - 50))}
            disabled={offset === 0 || isLoading}
            className="px-4 py-2 text-sm border border-gray-border rounded disabled:opacity-40">
            ← Précédent
          </button>
          <span className="px-4 py-2 text-sm text-gray-mid">
            {offset + 1}–{Math.min(offset + 50, total)} sur {total}
          </span>
          <button onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= total || isLoading}
            className="px-4 py-2 text-sm border border-gray-border rounded disabled:opacity-40">
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
