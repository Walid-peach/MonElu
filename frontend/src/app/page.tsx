import Link from 'next/link'
import { api, Vote, SearchResult } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { ShareButton } from '@/components/ShareButton'
import { ChatRedirectInput } from '@/components/ChatRedirectInput'
import { UserBubble, AssistantBubble } from '@/components/chat/Bubbles'
import { HomeScrollStory } from '@/components/home/HomeScrollStory'

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

const FALLBACK_STATS = {
  deputies: 596,
  votes: 4262,
  positions: 685000,
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

function numericStat(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function formatFreshness(value: unknown) {
  if (typeof value !== 'string') return "Mise à jour aujourd'hui"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Mise à jour aujourd'hui"
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `Mis à jour : ${formatted}`
}

function resultLabel(result: string) {
  return result === 'adopté' ? 'Adopté' : 'Rejeté'
}

export default async function Home() {
  const { health, latest } = await getStats()
  const latestVotes = latest as Vote[]
  const leadVote = latestVotes[0]
  const lastUpdated = formatFreshness(
    health ? health.last_ingestion ?? health.last_ingestion_at ?? health.updated_at : null
  )

  const homeStats = {
    deputies: numericStat(health?.deputies, FALLBACK_STATS.deputies),
    votes: numericStat(health?.votes, FALLBACK_STATS.votes),
    positions: numericStat(health?.positions, FALLBACK_STATS.positions),
    lastUpdated,
  }

  const pulseVote = {
    title: leadVote?.summary_plain || leadVote?.vote_title || 'Réforme énergétique',
    votesFor: leadVote?.votes_for ?? 289,
    votesAgainst: leadVote?.votes_against ?? 223,
    abstentions: leadVote?.abstentions ?? 58,
    href: leadVote ? `/votes/${leadVote.vote_id}` : undefined,
  }

  return (
    <div className="overflow-x-clip bg-gray-off">
      <HomeScrollStory stats={homeStats} leadVote={pulseVote} />

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:grid-cols-[0.82fr_1fr] md:px-8 lg:px-12">
        <div>
          <p className="text-xs font-semibold uppercase text-red-civic">Intelligence artificielle sourcée</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-navy md:text-4xl">
            Posez une question politique. Obtenez une réponse lisible.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-navy/60">
            L&apos;IA MonÉlu répond en français, cite les données utilisées et garde le
            contexte parlementaire visible pour éviter les réponses hors-sol.
          </p>
        </div>

        <div className="border border-gray-border bg-white p-4 md:p-5">
          <p className="mb-4 text-xs font-semibold uppercase text-navy/40">Démonstration</p>
          <div className="space-y-4">
            <UserBubble text="Combien de votes ont été adoptés cette année ?" />
            <AssistantBubble result={EXAMPLE_RESULT} />
            <div className="border-t border-gray-border pt-4">
              <ChatRedirectInput />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 md:px-8 lg:px-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-red-civic">Le fil politique</p>
            <h2 className="mt-2 font-serif text-3xl text-navy">Derniers votes analysés</h2>
          </div>
          <Link href="/votes" className="text-sm font-semibold text-red-civic hover:underline">
            Voir tous →
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {latestVotes.slice(0, 6).map((vote) => {
            const total = vote.total_voters || vote.votes_for + vote.votes_against + vote.abstentions || 1
            const forPct = Math.round(vote.votes_for / total * 100)
            return (
              <Link
                key={vote.vote_id}
                href={`/votes/${vote.vote_id}`}
                className="group border border-gray-border bg-white p-4 transition-colors hover:border-navy/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={vote.result === 'adopté' ? 'badge-adopte' : 'badge-rejete'}>
                        {resultLabel(vote.result)}
                      </span>
                      {vote.theme && (
                        <span className="bg-gray-off px-2 py-0.5 text-xs font-medium text-navy/50">
                          {vote.theme}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-6 text-navy group-hover:text-red-civic">
                      {vote.summary_plain || vote.vote_title}
                    </p>
                    {vote.summary_plain && (
                      <p className="mt-2 line-clamp-1 text-xs text-gray-mid">
                        Titre officiel : {vote.vote_title}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-mid">{formatDate(vote.voted_at)}</p>
                  </div>
                  <ShareButton
                    url={`/votes/${vote.vote_id}`}
                    title={vote.vote_title}
                    text={`${resultLabel(vote.result)} — ${vote.vote_title} — MonÉlu`}
                    ariaLabel={`Partager : ${vote.vote_title}`}
                  />
                </div>
                <div className="mt-4 h-1.5 overflow-hidden bg-gray-light">
                  <div className="h-full bg-emerald-500" style={{ width: `${forPct}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-mid">
                  <span>{vote.votes_for} pour</span>
                  <span>{vote.votes_against} contre · {vote.abstentions} abst.</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="bg-navy py-12 md:py-16">
        <div className="mx-auto max-w-5xl px-4 md:px-8">
          <p className="text-center text-xs font-semibold uppercase text-white/45">Comment ça marche</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center font-serif text-3xl leading-tight text-white">
            Une chaîne simple : donnée officielle, traduction claire, preuve consultable.
          </h2>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {[
              ['01', 'Cherchez', 'Un député, un département ou un groupe politique.'],
              ['02', 'Comprenez', 'Les votes sont résumés en français courant.'],
              ['03', 'Vérifiez', 'Les chiffres, sources et positions restent accessibles.'],
            ].map(([number, title, desc]) => (
              <div key={title} className="border border-white/12 bg-white/5 p-5">
                <p className="font-serif text-3xl text-red-light">{number}</p>
                <p className="mt-4 font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-white/55">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
