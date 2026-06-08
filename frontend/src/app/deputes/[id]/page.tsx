import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { partyColor, getInitials } from '@/lib/utils'

export const dynamicParams = true
export const revalidate = 86400

export async function generateStaticParams() {
  try {
    const first = await api.deputies.list({ limit: 200, offset: 0 })
    const total = first.total
    const items = [...first.items]
    if (total > 200) {
      const pages = Math.ceil((total - 200) / 200)
      const rest = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          api.deputies.list({ limit: 200, offset: 200 + i * 200 })
        )
      )
      items.push(...rest.flatMap(r => r.items))
    }
    return items.map(d => ({ id: d.deputy_id }))
  } catch {
    return []
  }
}

export default async function DeputyPage({ params }: { params: { id: string } }) {
  const [deputy, scorecard] = await Promise.all([
    api.deputies.get(params.id).catch(() => null),
    api.deputies.scorecard(params.id).catch(() => null),
  ])
  if (!deputy) notFound()

  const presencePct = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const denom       = scorecard ? (scorecard.present_votes || 1) : 1
  const pourPct     = scorecard ? Math.round(scorecard.votes_for      / denom * 100) : null
  const contrePct   = scorecard ? Math.round(scorecard.votes_against  / denom * 100) : null
  const abstPct     = scorecard ? Math.round(scorecard.abstentions    / denom * 100) : null

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
      <Link href="/deputes" className="text-sm text-gray-mid hover:text-navy mb-6 inline-flex items-center gap-1">
        ← Tous les députés
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-border rounded-xl p-6 mb-4 mt-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-navy-muted flex items-center justify-center text-navy font-medium text-xl flex-shrink-0">
            {getInitials(deputy.full_name)}
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl text-navy leading-tight">{deputy.full_name}</h1>
            <p className="text-sm text-gray-mid mt-0.5">{deputy.department}</p>
            {deputy.party && (
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-medium ${partyColor(deputy.party)}`}>
                {deputy.party}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scorecard */}
      {scorecard && (
        <div className="bg-white border border-gray-border rounded-xl p-6 mb-4">
          <h2 className="font-serif text-xl text-navy mb-5">Bilan de mandat</h2>

          {/* Presence */}
          <div className="mb-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-mid font-medium">Taux de présence</span>
              <span className="font-medium text-navy">{presencePct}%</span>
            </div>
            <div className="h-2 bg-gray-light rounded-full">
              <div className="h-full bg-navy rounded-full transition-all"
                style={{ width: `${presencePct}%` }} />
            </div>
          </div>

          {/* Vote breakdown */}
          <div className="mb-5">
            <p className="text-sm text-gray-mid font-medium mb-2">Répartition des votes</p>
            <div className="h-3 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full" style={{ width: `${pourPct}%` }} />
              <div className="bg-red-civic h-full" style={{ width: `${contrePct}%` }} />
              <div className="bg-gray-light h-full flex-1" />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-mid">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Pour {pourPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-civic inline-block" />
                Contre {contrePct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-light inline-block border border-gray-border" />
                Abstention {abstPct}%
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Votes exprimés', value: (scorecard.total_votes ?? 0).toLocaleString('fr-FR') },
              { label: 'Pour',           value: (scorecard.votes_for   ?? 0).toLocaleString('fr-FR') },
              { label: 'Contre',         value: (scorecard.votes_against ?? 0).toLocaleString('fr-FR') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-off rounded-lg p-3 text-center">
                <div className="text-lg font-medium text-navy">{value}</div>
                <div className="text-xs text-gray-mid mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ask the AI */}
      <Link
        href={`/chat?q=${encodeURIComponent(`Quel est le bilan de ${deputy.full_name} ?`)}`}
        className="w-full flex items-center justify-center gap-2 border border-navy text-navy rounded-xl py-3 text-sm font-medium hover:bg-navy hover:text-white transition-colors">
        Poser une question sur ce député →
      </Link>
    </div>
  )
}
