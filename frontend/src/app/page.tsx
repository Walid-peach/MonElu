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
      {/* Hero — split layout */}
      <section className="bg-gray-off min-h-screen flex items-stretch">
        {/* Left: text content */}
        <div className="flex flex-col justify-center px-8 md:px-16 lg:px-20 py-16 w-full md:w-1/2">
          <p className="text-red-civic text-xs font-medium tracking-widest uppercase mb-4">
            Plateforme civique open source
          </p>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-[3.25rem] text-navy font-bold leading-tight mb-6">
            Les données parlementaires claires, neutres et accessibles.
          </h1>
          <p className="text-navy/60 text-base md:text-lg mb-8 max-w-md leading-relaxed">
            MonÉlu transforme les données officielles de l&apos;Assemblée Nationale en informations compréhensibles pour tous.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Link href="/chat"
              className="bg-red-civic text-white px-6 py-3 rounded font-medium text-sm text-center hover:bg-red-light transition-colors">
              Poser une question →
            </Link>
            <a href="https://monelu-production.up.railway.app/docs" target="_blank" rel="noopener noreferrer"
              className="border border-navy/30 text-navy px-6 py-3 rounded font-medium text-sm text-center hover:bg-navy/5 transition-colors">
              Documentation API
            </a>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-navy/40 border-t border-navy/10 pt-5">
            <span>🔒 Données officielles · 100% transparentes</span>
            <span>⚖ Neutre &amp; indépendant · Sans parti pris</span>
          </div>
        </div>

        {/* Right: image + floating stats card */}
        <div className="hidden md:block relative flex-1">
          <div
            className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, #F8F7F4, transparent)' }}
          />
          <Image
            src="/assemblee_nationale.jpg"
            alt="Assemblée Nationale, Paris"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Floating stats card */}
          <div className="absolute bottom-10 left-10 right-10 bg-white rounded-2xl shadow-xl p-6 z-20">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-red-civic" />
              <span className="text-sm font-medium text-navy">En direct à l&apos;Assemblée</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-navy/10">
              {[
                { value: health?.deputies as number ?? null, label: 'Députés' },
                { value: health?.votes as number ?? null, label: 'Votes analysés' },
                {
                  value: health?.positions
                    ? `${Math.round((health.positions as number) / 1000)}k`
                    : null,
                  label: 'Positions',
                },
              ].map(({ value, label }) => (
                <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                  <div className="text-2xl md:text-3xl font-serif font-bold text-navy">
                    {value !== null
                      ? typeof value === 'number'
                        ? value.toLocaleString('fr-FR')
                        : value
                      : '—'}
                  </div>
                  <div className="text-xs text-navy/40 uppercase tracking-wider mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile stats bar */}
      <section className="md:hidden bg-white border-t border-gray-border">
        <div className="grid grid-cols-3 divide-x divide-gray-border">
          {[
            { value: health?.deputies as number ?? null, label: 'Députés' },
            { value: health?.votes as number ?? null, label: 'Votes' },
            {
              value: health?.positions
                ? `${Math.round((health.positions as number) / 1000)}k`
                : null,
              label: 'Positions',
            },
          ].map(({ value, label }) => (
            <div key={label} className="px-4 py-5 text-center">
              <div className="text-2xl font-serif font-bold text-navy">
                {value !== null
                  ? typeof value === 'number'
                    ? value.toLocaleString('fr-FR')
                    : value
                  : '—'}
              </div>
              <div className="text-xs text-navy/40 uppercase tracking-wider mt-1">{label}</div>
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
