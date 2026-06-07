'use client'
import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Deputy } from '@/lib/api'
import { getInitials, partyShort, partyColor } from '@/lib/utils'

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
  const [party, setParty] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  // When searching, fetch all deputies (no pagination) so the filter crosses all pages.
  // When browsing, fetch the current page.
  const isSearching = search.length > 0
  const swrKey = isSearching
    ? `deputies:all:${party}`
    : `deputies:${party}:${offset}`

  const { data, isLoading } = useSWR<DeputyList>(
    swrKey,
    isSearching
      ? () => api.deputies.list({ party: party || undefined, limit: 600 })
      : () => api.deputies.list({ party: party || undefined, limit: 50, offset }),
    {
      // Keep the previous page visible while the next one loads — prevents the
      // flash back to initial data on party change or pagination.
      keepPreviousData: true,
    }
  )

  // On first render data is undefined; fall back to initial (page 1, no filter).
  const deputies = data?.items ?? initial.items
  const total = data?.total ?? initial.total

  const filtered = isSearching
    ? deputies.filter((d) =>
        d.full_name.toLowerCase().includes(search.toLowerCase()) ||
        d.department?.toLowerCase().includes(search.toLowerCase())
      )
    : deputies

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
          ? `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''}`
          : `${total} député${total !== 1 ? 's' : ''}`}
        {party && ` · ${partyShort(party)}`}
      </p>

      {/* Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
        {filtered.length === 0 && !isLoading ? (
          <p className="text-sm text-gray-mid col-span-2 py-8 text-center">Aucun résultat</p>
        ) : (
          filtered.map((d) => (
            <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`}
              className="bg-white border border-gray-border rounded-lg p-4 hover:border-navy/30 transition-colors flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-navy-muted flex items-center justify-center text-navy font-medium text-sm flex-shrink-0">
                {getInitials(d.full_name)}
              </div>
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
          ))
        )}
      </div>

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
