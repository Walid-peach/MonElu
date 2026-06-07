'use client'
import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Vote } from '@/lib/api'
import { formatDate } from '@/lib/utils'

type VoteList = { total: number; items: Vote[]; limit: number; offset: number }

export function VotesClient({ initial }: { initial: VoteList }) {
  const [result, setResult] = useState('')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useSWR(
    `votes:${result}:${offset}`,
    () => api.votes.list({ result: result || undefined, limit: 50, offset }),
    { fallbackData: initial }
  )

  const votes = data?.items ?? initial.items
  const total = data?.total ?? initial.total

  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['', 'adopté', 'rejeté'] as const).map((r) => (
          <button key={r}
            onClick={() => { setResult(r); setOffset(0) }}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors
              ${result === r
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-mid border-gray-border hover:border-navy/40'}`}>
            {r === '' ? 'Tous' : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-mid mb-4">{total} votes</p>

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
                  <p className="text-xs text-gray-mid mt-1">{formatDate(vote.voted_at)}</p>
                </div>
                <span className={vote.result === 'adopté' ? 'badge-adopte' : 'badge-rejete'}>
                  {vote.result}
                </span>
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
            disabled={offset === 0}
            className="px-4 py-2 text-sm border border-gray-border rounded disabled:opacity-40">
            ← Précédent
          </button>
          <span className="px-4 py-2 text-sm text-gray-mid">
            {offset + 1}–{Math.min(offset + 50, total)} sur {total}
          </span>
          <button onClick={() => setOffset(offset + 50)}
            disabled={offset + 50 >= total}
            className="px-4 py-2 text-sm border border-gray-border rounded disabled:opacity-40">
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
