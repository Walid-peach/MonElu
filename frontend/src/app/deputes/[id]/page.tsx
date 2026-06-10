import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { DeputyVoteItem } from '@/lib/api'
import { partyColor, formatDate } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { ShareButton } from '@/components/ShareButton'

export const dynamicParams = true
export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const deputy = await api.deputies.get(id).catch(() => null)
  if (!deputy) return {}
  const description = `Bilan de mandat, votes et présence de ${deputy.full_name}${
    deputy.party ? ` (${deputy.party})` : deputy.department ? ` — ${deputy.department}` : ''
  }.`
  return {
    title: `${deputy.full_name} — MonÉlu`,
    description,
    openGraph: {
      title: `${deputy.full_name} — MonÉlu`,
      description,
      url: `https://mon-elu.vercel.app/deputes/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${deputy.full_name} — MonÉlu`,
      description,
    },
  }
}

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

const POSITION_LABEL: Record<string, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  nonVotant: 'Non votant',
}

const POSITION_CLASS: Record<string, string> = {
  pour: 'bg-emerald-100 text-emerald-800',
  contre: 'bg-red-50 text-red-700',
  abstention: 'bg-amber-100 text-amber-800',
  nonVotant: 'bg-gray-100 text-gray-500',
}

export default async function DeputyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deputy, scorecard, deputyStats, recentVotes] = await Promise.all([
    api.deputies.get(id).catch(() => null),
    api.deputies.scorecard(id).catch(() => null),
    api.deputies.stats().catch(() => null),
    api.deputies.votes(id, 10).catch(() => null),
  ])
  if (!deputy) notFound()

  const presencePct    = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const avgPresencePct = deputyStats ? Math.round((deputyStats.avg_presence_rate ?? 0) * 100) : null
  const denom          = scorecard ? (scorecard.present_votes || 1) : 1
  const pourPct        = scorecard ? Math.round(scorecard.votes_for      / denom * 100) : null
  const contrePct      = scorecard ? Math.round(scorecard.votes_against  / denom * 100) : null
  const abstPct        = scorecard ? Math.round(scorecard.abstentions    / denom * 100) : null

  const aboveAvg =
    presencePct !== null && avgPresencePct !== null
      ? presencePct > avgPresencePct
        ? 'above'
        : presencePct < avgPresencePct
        ? 'below'
        : 'equal'
      : null

  const firstName = deputy.first_name || deputy.full_name.split(' ')[0]

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
      <Link href="/deputes" className="text-sm text-gray-mid hover:text-navy mb-6 inline-flex items-center gap-1">
        ← Tous les députés
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-border rounded-xl p-6 mb-4 mt-4">
        <div className="flex items-start gap-4">
          <DeputyAvatar name={deputy.full_name} photoUrl={deputy.photo_url} size="lg" priority />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl text-navy leading-tight">{deputy.full_name}</h1>
            <p className="text-sm text-gray-mid mt-0.5">{deputy.department}</p>
            {deputy.party && (
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-medium ${partyColor(deputy.party)}`}>
                {deputy.party}
              </span>
            )}
          </div>
          <ShareButton
            url={`/deputes/${id}`}
            title={`${deputy.full_name} — MonÉlu`}
            text={`Découvrez le bilan de ${deputy.full_name} sur MonÉlu`}
            ariaLabel={`Partager le profil de ${deputy.full_name}`}
          />
        </div>

        {/* Plain-language summary */}
        {presencePct !== null && avgPresencePct !== null && (
          <p className="mt-4 text-sm text-navy/70 bg-gray-off rounded-lg px-4 py-2.5 leading-relaxed">
            {firstName} a participé à{' '}
            <span className="font-medium text-navy">{presencePct}%</span> des votes —{' '}
            {aboveAvg === 'above' && (
              <span className="text-emerald-700 font-medium">au-dessus</span>
            )}
            {aboveAvg === 'below' && (
              <span className="text-red-700 font-medium">en dessous</span>
            )}
            {aboveAvg === 'equal' && (
              <span className="font-medium">dans</span>
            )}{' '}
            de la moyenne nationale ({avgPresencePct}%).
          </p>
        )}
      </div>

      {/* Scorecard */}
      {scorecard && (
        <div className="bg-white border border-gray-border rounded-xl p-6 mb-4">
          <h2 className="font-serif text-xl text-navy mb-5">Bilan de mandat</h2>

          {/* Presence */}
          <div className="mb-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-mid font-medium">Taux de présence</span>
              <div className="flex items-center gap-2">
                {avgPresencePct !== null && aboveAvg && (
                  <span className={`text-xs font-medium ${aboveAvg === 'above' ? 'text-emerald-700' : aboveAvg === 'below' ? 'text-red-700' : 'text-gray-mid'}`}
                    aria-label={`${aboveAvg === 'above' ? 'Au-dessus' : aboveAvg === 'below' ? 'En dessous' : 'Dans'} de la moyenne nationale (${avgPresencePct}%)`}>
                    {aboveAvg === 'above' ? '↑' : aboveAvg === 'below' ? '↓' : '≈'} moy. {avgPresencePct}%
                  </span>
                )}
                <span className="font-medium text-navy">{presencePct}%</span>
              </div>
            </div>
            <div className="relative h-2 bg-gray-light rounded-full">
              <div className="h-full bg-navy rounded-full transition-all"
                style={{ width: `${presencePct}%` }} />
              {avgPresencePct !== null && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-gray-mid/60"
                  style={{ left: `${avgPresencePct}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            {avgPresencePct !== null && (
              <p className="text-[11px] text-gray-mid mt-1">
                Trait vertical = moyenne nationale ({avgPresencePct}%)
              </p>
            )}
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
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                Pour {pourPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-civic inline-block" aria-hidden="true" />
                Contre {contrePct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-light inline-block border border-gray-border" aria-hidden="true" />
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

      {/* Recent votes */}
      {recentVotes && recentVotes.items.length > 0 && (
        <div className="bg-white border border-gray-border rounded-xl p-6 mb-4">
          <h2 className="font-serif text-xl text-navy mb-4">Votes récents</h2>
          <div className="flex flex-col divide-y divide-gray-border">
            {recentVotes.items.map((v: DeputyVoteItem) => (
              <Link
                key={v.vote_id}
                href={`/votes/${v.vote_id}`}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-gray-off -mx-2 px-2 rounded transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy line-clamp-2 leading-snug">{v.vote_title}</p>
                  <p className="text-xs text-gray-mid mt-0.5">{v.voted_at ? formatDate(v.voted_at) : ''}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 mt-0.5 ${POSITION_CLASS[v.position] ?? 'bg-gray-100 text-gray-500'}`}
                  aria-label={`Position : ${POSITION_LABEL[v.position] ?? v.position}`}
                >
                  {POSITION_LABEL[v.position] ?? v.position}
                </span>
              </Link>
            ))}
          </div>
          {recentVotes.total > 10 && (
            <p className="text-xs text-gray-mid mt-4">
              {recentVotes.total.toLocaleString('fr-FR')} votes au total sur ce mandat
            </p>
          )}
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
