import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatDate, partyShort, partyColor } from '@/lib/utils'

export const dynamicParams = true
export const revalidate = 86400 // fallback if the /api/revalidate webhook is not called

export async function generateStaticParams() {
  try {
    const data = await api.votes.list({ limit: 100 })
    return data.items.map(v => ({ id: v.vote_id }))
  } catch {
    return []
  }
}

export default async function VoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vote = await api.votes.get(id).catch(() => null)
  if (!vote) notFound()

  const pourPct = Math.round(vote.votes_for / (vote.total_voters || 1) * 100)
  const contrePct = Math.round(vote.votes_against / (vote.total_voters || 1) * 100)
  const abstPct = Math.round(vote.abstentions / (vote.total_voters || 1) * 100)

  // Group positions by position type
  const byPosition: Record<string, typeof vote.positions> = {}
  for (const p of vote.positions ?? []) {
    if (!byPosition[p.position]) byPosition[p.position] = []
    byPosition[p.position]!.push(p)
  }

  const positionOrder = ['pour', 'contre', 'abstention', 'nonVotant']
  const positionLabel: Record<string, string> = {
    pour: 'Pour',
    contre: 'Contre',
    abstention: 'Abstention',
    nonVotant: 'Non-votant',
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
      <Link href="/votes" className="text-sm text-gray-mid hover:text-navy mb-6 inline-flex items-center gap-1">
        ← Tous les votes
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-border rounded-xl p-6 mb-4 mt-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="font-serif text-xl text-navy leading-snug flex-1">{vote.vote_title}</h1>
          <span className={`flex-shrink-0 ${vote.result === 'adopté' ? 'badge-adopte' : 'badge-rejete'}`}>
            {vote.result}
          </span>
        </div>
        <p className="text-sm text-gray-mid">{formatDate(vote.voted_at)}</p>
      </div>

      {/* Results bar */}
      <div className="bg-white border border-gray-border rounded-xl p-6 mb-4">
        <h2 className="font-serif text-lg text-navy mb-4">Résultat du scrutin</h2>

        <div className="h-4 rounded-full overflow-hidden flex mb-3">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pourPct}%` }} />
          <div className="bg-red-civic h-full transition-all" style={{ width: `${contrePct}%` }} />
          <div className="bg-gray-light h-full flex-1" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pour', value: vote.votes_for, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Contre', value: vote.votes_against, color: 'text-red-700', bg: 'bg-red-50' },
            { label: 'Abstention', value: vote.abstentions, color: 'text-gray-mid', bg: 'bg-gray-off' },
            { label: 'Total', value: vote.total_voters, color: 'text-navy', bg: 'bg-navy-muted' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
              <div className={`text-xl font-medium ${color}`}>{value.toLocaleString('fr-FR')}</div>
              <div className="text-xs text-gray-mid mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 mt-4 text-xs text-gray-mid">
          <span>{pourPct}% pour</span>
          <span>{contrePct}% contre</span>
          <span>{abstPct}% abstention</span>
        </div>
      </div>

      {/* Positions by group */}
      {vote.positions && vote.positions.length > 0 && (
        <div className="bg-white border border-gray-border rounded-xl p-6 mb-4">
          <h2 className="font-serif text-lg text-navy mb-4">Positions par groupe</h2>

          {/* Party breakdown */}
          {(() => {
            const partyMap: Record<string, Record<string, number>> = {}
            for (const p of vote.positions ?? []) {
              const party = p.party || 'Non inscrit'
              if (!partyMap[party]) partyMap[party] = { pour: 0, contre: 0, abstention: 0, nonVotant: 0 }
              partyMap[party][p.position] = (partyMap[party][p.position] || 0) + 1
            }
            return (
              <div className="space-y-3">
                {Object.entries(partyMap)
                  .sort(([, a], [, b]) => (b.pour + b.contre + b.abstention) - (a.pour + a.contre + a.abstention))
                  .map(([party, counts]) => {
                    const total = counts.pour + counts.contre + counts.abstention + counts.nonVotant
                    return (
                      <div key={party} className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 w-12 text-center ${partyColor(party)}`}>
                          {partyShort(party)}
                        </span>
                        <div className="flex-1 h-2 bg-gray-light rounded-full overflow-hidden flex">
                          <div className="bg-emerald-500 h-full" style={{ width: `${Math.round(counts.pour / total * 100)}%` }} />
                          <div className="bg-red-civic h-full" style={{ width: `${Math.round(counts.contre / total * 100)}%` }} />
                          <div className="bg-amber-300 h-full" style={{ width: `${Math.round(counts.abstention / total * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-mid flex-shrink-0 w-16 text-right">
                          {counts.pour}p · {counts.contre}c
                        </span>
                      </div>
                    )
                  })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Individual positions */}
      {vote.positions && vote.positions.length > 0 && (
        <div className="bg-white border border-gray-border rounded-xl p-6">
          <h2 className="font-serif text-lg text-navy mb-4">Votes individuels</h2>
          <div className="space-y-6">
            {positionOrder
              .filter(pos => byPosition[pos]?.length)
              .map(pos => (
                <div key={pos}>
                  <h3 className="text-sm font-medium text-gray-mid mb-2">
                    {positionLabel[pos]} ({byPosition[pos]!.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {byPosition[pos]!.map(p => (
                      <Link key={p.deputy_id} href={`/deputes/${p.deputy_id}`}
                        className={`text-xs px-2 py-1 rounded font-medium ${partyColor(p.party)}`}>
                        {p.full_name.split(' ').slice(-1)[0]}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
