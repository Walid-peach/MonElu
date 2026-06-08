import Image from 'next/image'
import Link from 'next/link'
import { api, Vote } from '@/lib/api'
import { formatDate } from '@/lib/utils'

async function getStats() {
  try {
    const [health, latest] = await Promise.all([
      api.health(),
      api.votes.latest(),
    ])
    return { health, latest }
  } catch {
    return { health: null, latest: [] }
  }
}

export default async function Home() {
  const { health, latest } = await getStats()

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[85vh] md:min-h-[70vh] flex flex-col justify-center px-6 md:px-16 py-16">
        <Image
          src="/assemblee_nationale.jpg"
          alt="Hémicycle de l'Assemblée Nationale"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-navy/80" />
        <div className="relative z-10 max-w-2xl">
          <p className="text-red-civic text-xs font-medium tracking-widest uppercase mb-4">
            Plateforme civique open source
          </p>
          <h1 className="font-serif text-4xl md:text-6xl text-white leading-tight mb-6">
            Les données parlementaires{' '}
            <em className="text-red-civic not-italic">claires et accessibles.</em>
          </h1>
          <p className="text-white/60 text-base md:text-lg mb-8 max-w-lg leading-relaxed">
            Données officielles de l&apos;Assemblée Nationale. Ouvertes, vérifiables, mises à jour régulièrement.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/deputes"
              className="bg-red-civic text-white px-6 py-3 rounded font-medium text-sm text-center hover:bg-red-light transition-colors">
              Découvrir les députés →
            </Link>
            <Link href="/chat"
              className="border border-white/30 text-white px-6 py-3 rounded font-medium text-sm text-center hover:bg-white/10 transition-colors">
              Poser une question
            </Link>
          </div>
        </div>
      </section>

      {/* Live stats bar */}
      <section className="bg-navy-light border-t border-white/10">
        <div className="max-w-4xl mx-auto grid grid-cols-3 divide-x divide-white/10">
          {[
            { value: health?.deputies as number ?? null, label: 'Députés suivis' },
            { value: health?.votes as number ?? null, label: 'Votes analysés' },
            {
              value: health?.positions
                ? `${Math.round((health.positions as number) / 1000)}k`
                : null,
              label: 'Positions enregistrées',
            },
          ].map(({ value, label }) => (
            <div key={label} className="px-4 py-5 text-center">
              <div className="text-2xl md:text-3xl font-serif font-medium text-white">
                {value !== null
                  ? typeof value === 'number'
                    ? value.toLocaleString('fr-FR')
                    : value
                  : '—'}
              </div>
              <div className="text-xs text-white/50 uppercase tracking-wider mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Latest votes */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl text-navy">Derniers votes</h2>
          <Link href="/votes" className="text-sm text-red-civic font-medium hover:underline">
            Voir tous →
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {(latest as Vote[]).slice(0, 5).map((vote) => (
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
                <span>{vote.votes_against} contre</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
