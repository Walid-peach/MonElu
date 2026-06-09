import { Fragment } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { api, Vote, SearchResult } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { HeroSearch } from '@/components/HeroSearch'
import { ShareButton } from '@/components/ShareButton'
import { ChatRedirectInput } from '@/components/ChatRedirectInput'
import { UserBubble, AssistantBubble } from '@/components/chat/Bubbles'

const EXAMPLE_RESULT: SearchResult = {
  answer:
    "Depuis juillet 2025, l'Assemblée Nationale a enregistré plus de 4 200 scrutins. Environ deux tiers ont été adoptés et un tiers rejetés. Le groupe Ensemble pour la République vote le plus souvent avec la majorité.",
  question: "Combien de votes ont été adoptés cette année ?",
  chunks_retrieved: 2,
  confidence: "high",
  data_source: "postgresql",
  sources: [
    {
      content:
        "Statistiques globales — 17ème législature. Total scrutins enregistrés : 4 214. Adoptés : 2 847. Rejetés : 1 367.",
      metadata: { chunk_type: "global_stats" } as Record<string, string>,
      similarity: 0.94,
    },
    {
      content:
        "Groupe Ensemble pour la République — 166 députés actifs. Cohésion de vote avec la majorité : 89 %.",
      metadata: { chunk_type: "party" } as Record<string, string>,
      similarity: 0.81,
    },
  ],
}

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

  const stats = [
    { value: health ? (health.deputies as number) : null, label: 'Députés', sub: null },
    { value: health ? (health.votes as number) : null, label: 'Votes analysés', sub: null },
    {
      value: health?.positions
        ? `${Math.round((health.positions as number) / 1000)}k`
        : null,
      label: 'Positions',
      sub: 'votes individuels',
    },
  ]

  return (
    <div>
      {/* Hero — split layout */}
      <section className="bg-gray-off min-h-screen flex items-stretch">
        {/* Left: text content */}
        <div className="flex flex-col justify-center px-8 md:px-16 lg:px-20 py-16 w-full md:w-1/2">
          <p className="text-red-civic text-xs font-medium tracking-widest uppercase mb-4">
            Plateforme civique open source
          </p>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-[3.25rem] text-navy font-bold leading-tight mb-4">
            Votre député a‑t‑il voté la réforme&nbsp;?{' '}
            <span className="text-red-civic">Trouvez la réponse en 10 secondes.</span>
          </h1>
          <p className="text-navy/60 text-base md:text-lg mb-6 max-w-md leading-relaxed">
            MonÉlu expose chaque vote de chaque député de l&apos;Assemblée Nationale — en clair, sans parti pris.
          </p>

          {/* Primary action: find my deputy */}
          <div className="mb-6 max-w-md">
            <HeroSearch />
          </div>

          {/* Secondary actions */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Link href="/votes"
              className="border border-navy/30 text-navy px-5 py-2.5 rounded font-medium text-sm text-center hover:bg-navy/5 transition-colors">
              Explorer les votes
            </Link>
            <a href="https://monelu-production.up.railway.app/docs" target="_blank" rel="noopener noreferrer"
              className="border border-navy/15 text-navy/40 px-5 py-2.5 rounded font-medium text-sm text-center hover:bg-navy/5 transition-colors">
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
              {stats.map(({ value, label, sub }) => (
                <div key={label} className="px-4 text-center first:pl-0 last:pr-0">
                  <div className="text-2xl md:text-3xl font-serif font-bold text-navy">
                    {value !== null
                      ? typeof value === 'number'
                        ? value.toLocaleString('fr-FR')
                        : value
                      : '—'}
                  </div>
                  <div className="text-xs text-navy/40 uppercase tracking-wider mt-1">{label}</div>
                  {sub && <div className="text-[10px] text-navy/30 mt-0.5">{sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile stats bar */}
      <section className="md:hidden bg-white border-t border-gray-border">
        <div className="grid grid-cols-3 divide-x divide-gray-border">
          {stats.map(({ value, label, sub }) => (
            <div key={label} className="px-4 py-5 text-center">
              <div className="text-2xl font-serif font-bold text-navy">
                {value !== null
                  ? typeof value === 'number'
                    ? value.toLocaleString('fr-FR')
                    : value
                  : '—'}
              </div>
              <div className="text-xs text-navy/40 uppercase tracking-wider mt-1">{label}</div>
              {sub && <div className="text-[10px] text-navy/30 mt-0.5">{sub}</div>}
            </div>
          ))}
        </div>
      </section>


      {/* AI section */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        <p className="text-red-civic text-xs font-medium tracking-widest uppercase mb-3">Intelligence artificielle</p>
        <h2 className="font-serif text-2xl md:text-3xl text-navy mb-2">
          Posez votre question sur l&apos;Assemblée
        </h2>
        <p className="text-navy/60 text-sm md:text-base mb-8 max-w-xl">
          Posez votre question en français. L&apos;IA répond en s&apos;appuyant sur les données officielles, sources à l&apos;appui.
        </p>

        {/* Conversation thread — static demo, same components as /chat */}
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-medium text-navy/30 uppercase tracking-widest text-right select-none">
            Démonstration
          </p>

          <UserBubble text="Combien de votes ont été adoptés cette année ?" />

          <AssistantBubble result={EXAMPLE_RESULT} />

          {/* Input as next thread turn */}
          <div className="border-t border-gray-border pt-4">
            <ChatRedirectInput />
          </div>
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
          {(latest as Vote[]).slice(0, 7).map((vote) => (
            <Link key={vote.vote_id} href={`/votes/${vote.vote_id}`}
              className="bg-white rounded-lg border border-gray-border p-4 hover:border-navy/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy line-clamp-2 leading-snug">
                    {vote.vote_title}
                  </p>
                  <p className="text-xs text-gray-mid mt-1">{formatDate(vote.voted_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={vote.result === 'adopté' ? 'badge-adopte' : 'badge-rejete'}>
                    {vote.result}
                  </span>
                  <ShareButton
                    url={`/votes/${vote.vote_id}`}
                    title={vote.vote_title}
                    text={`${vote.result === 'adopté' ? '✅' : '❌'} ${vote.vote_title} — MonÉlu`}
                    ariaLabel={`Partager : ${vote.vote_title}`}
                  />
                </div>
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

      {/* Comment ça marche */}
      <section className="bg-navy py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <h2 className="font-serif text-xl text-white text-center mb-10">Comment ça marche</h2>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-0">
            {[
              { icon: '🔍', step: 'Cherchez votre député', desc: 'Par code postal, département ou nom.' },
              { icon: '📋', step: 'Consultez son bilan', desc: 'Taux de présence, votes pour et contre.' },
              { icon: '💡', step: 'Comprenez ses votes', desc: 'Chaque scrutin expliqué en clair.' },
            ].map(({ icon, step, desc }, i) => (
              <Fragment key={step}>
                <div className="flex flex-col items-center text-center flex-1">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl mb-4">
                    {icon}
                  </div>
                  <p className="text-white font-medium mb-1">{step}</p>
                  <p className="text-white/50 text-sm">{desc}</p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block text-white/20 text-2xl px-3 self-center">→</div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
