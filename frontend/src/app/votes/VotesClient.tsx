'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Vote } from '@/lib/api'
import { formatDate } from '@/lib/utils'

type VoteList = { total: number; items: Vote[]; limit: number; offset: number }

const THEMES = [
  'Économie & Budget',
  'Santé & Social',
  'Justice & Sécurité',
  'Énergie & Environnement',
  'Éducation & Culture',
  'Agriculture',
  'Transport & Logement',
  'Institutions',
  'International',
  'Autre',
]

export function VotesClient({ initial }: { initial: VoteList }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [result, setResult] = useState(() => searchParams.get('result') ?? '')
  const [theme,  setTheme]  = useState(() => searchParams.get('theme')  ?? '')
  const [offset, setOffset] = useState(0)

  // Sync state → URL
  const skipFirstSync = useRef(true)
  useEffect(() => {
    if (skipFirstSync.current) { skipFirstSync.current = false; return }
    const p = new URLSearchParams()
    if (result) p.set('result', result)
    if (theme)  p.set('theme',  theme)
    const qs = p.toString()
    router.replace(`/votes${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [result, theme, router])

  const { data, isLoading } = useSWR(
    `votes:${result}:${theme}:${offset}`,
    () => api.votes.list({ result: result || undefined, theme: theme || undefined, limit: 50, offset }),
    { keepPreviousData: true }
  )

  const votes = data?.items ?? initial.items
  const total = data?.total ?? initial.total

  function changeFilter(newResult: string, newTheme: string) {
    setResult(newResult)
    setTheme(newTheme)
    setOffset(0)
  }

  return (
    <div>
      {/* Result filter pills */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(['', 'adopté', 'rejeté'] as const).map((r) => (
          <button key={r}
            onClick={() => changeFilter(r, theme)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors
              ${result === r
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-mid border-gray-border hover:border-navy/40'}`}>
            {r === '' ? 'Tous' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {/* Theme filter chips */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        <button
          onClick={() => changeFilter(result, '')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
            ${theme === ''
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-gray-mid border-gray-border hover:border-navy/40'}`}>
          Tous les thèmes
        </button>
        {THEMES.map((t) => (
          <button key={t}
            onClick={() => changeFilter(result, t)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${theme === t
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-mid border-gray-border hover:border-navy/40'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Count + clear */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-mid">
          {total} vote{total !== 1 ? 's' : ''}
          {result && ` · ${result.charAt(0).toUpperCase() + result.slice(1)}`}
          {theme  && ` · ${theme}`}
        </p>
        {(result || theme) && (
          <button onClick={() => changeFilter('', '')} className="text-xs text-red-civic hover:underline">
            Effacer les filtres
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-light rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {votes.map((vote) => (
            <Link key={vote.vote_id} href={`/votes/${vote.vote_id}`}
              className="bg-white rounded-lg border border-gray-border p-4 hover:border-navy/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy line-clamp-2 leading-snug">
                    {vote.vote_title}
                  </p>
                  {vote.summary_plain && (
                    <p className="text-xs text-gray-mid mt-1 line-clamp-2 italic">
                      <span className="text-red-civic font-medium not-italic">En clair</span>{' '}
                      {vote.summary_plain}
                    </p>
                  )}
                  <p className="text-xs text-gray-mid mt-1">{formatDate(vote.voted_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={vote.result === 'adopté' ? 'badge-adopte' : 'badge-rejete'}>
                    {vote.result}
                  </span>
                  {vote.theme && (
                    <span className="text-[10px] text-gray-mid bg-gray-off rounded px-1.5 py-0.5 whitespace-nowrap">
                      {vote.theme}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-light overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.round(vote.votes_for / (vote.total_voters || 1) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-mid mt-1">
                <span>{vote.votes_for} pour</span>
                <span>{vote.votes_against} contre · {vote.abstentions} abst.</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
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
