import type { Metadata } from 'next'
import * as Sentry from '@sentry/nextjs'
import { api, Vote, Deputy, Scorecard } from '@/lib/api'
import { AssemblyScrollExperience } from '@/components/home/AssemblyScrollExperience'
import { HomeSummary } from '@/components/home/HomeSummary'
import { UpcomingAgenda } from '@/components/home/UpcomingAgenda'
import { addDays, parisToday } from '@/lib/agenda'
import { canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/') },
}

const FALLBACK_STATS = {
  deputies: 596,
  votes: 4262,
  positions: 685000,
}

export type DeputyInfo = {
  name: string
  party: string
  department: string
  photoUrl: string | null
  deputyId: string
  totalVotes: number
  solennelParticipationRate: number
  votesFor: number
  votesAgainst: number
  abstentions: number
  /** This deputy's real position on the featured vote (pour/contre/abstention). */
  votePosition: 'pour' | 'contre' | 'abstention' | null
}

async function getStats() {
  try {
    const [health, voteList, deputyList] = await Promise.all([
      api.health(),
      api.votes.list({ limit: 100 }),
      api.deputies.list({ limit: 20 }),
    ])

    // Pick the vote with the most voters (most significant/representative scrutin)
    const votes = (voteList?.items ?? []) as Vote[]
    const featuredVote = votes.reduce<Vote | null>((best, v) => {
      const total = v.total_voters || v.votes_for + v.votes_against + v.abstentions
      const bestTotal = best ? (best.total_voters || best.votes_for + best.votes_against + best.abstentions) : 0
      return total > bestTotal ? v : best
    }, null) ?? votes[0] ?? null

    // Pick a deputy who actually voted on the featured scrutin, so the "your
    // deputy" card reflects a real vote_positions row instead of an unrelated
    // deputy (MON-102).
    let deputyInfo: DeputyInfo | null = null
    const deputies = deputyList?.items as Deputy[] | undefined
    let picked: Deputy | null = null
    let pickedPosition: 'pour' | 'contre' | 'abstention' | null = null

    const votingPositions = ['pour', 'contre', 'abstention'] as const
    const isVotingPosition = (position: string): position is (typeof votingPositions)[number] =>
      (votingPositions as readonly string[]).includes(position)

    if (featuredVote) {
      try {
        const voteDetail = await api.votes.get(featuredVote.vote_id)
        const eligible = (voteDetail.positions ?? []).filter(p => isVotingPosition(p.position))
        if (eligible.length) {
          const middle = eligible[Math.floor(eligible.length / 2)]
          picked = await api.deputies.get(middle.deputy_id)
          pickedPosition = middle.position as (typeof votingPositions)[number]
        }
      } catch (err) {
        Sentry.captureException(err)
      }
    }

    if (!picked) {
      picked = deputies?.find(d => d.photo_url) ?? deputies?.[0] ?? null
    }

    if (picked) {
      try {
        const sc: Scorecard = await api.deputies.scorecard(picked.deputy_id)
        deputyInfo = {
          name: picked.full_name,
          party: picked.party ?? 'Groupe parlementaire',
          department: picked.department ?? 'France',
          photoUrl: picked.photo_url,
          deputyId: picked.deputy_id,
          totalVotes: sc.total_votes ?? 0,
          solennelParticipationRate: Math.round((sc.solennel_participation_rate ?? 0) * 100),
          votesFor: sc.votes_for ?? 0,
          votesAgainst: sc.votes_against ?? 0,
          abstentions: sc.abstentions ?? 0,
          votePosition: pickedPosition,
        }
      } catch (err) {
        Sentry.captureException(err)
      }
    }

    return { health, featuredVote, deputyInfo }
  } catch (err) {
    Sentry.captureException(err)
    return { health: null, featuredVote: null, deputyInfo: null }
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

function formatVoteDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date).toUpperCase()
}

/**
 * The next seven days, not the current ISO week: on a Friday, "cette semaine"
 * from the API is mostly sittings that already happened. Fetched separately
 * from `getStats()` so an agenda outage cannot take the hero's stats with it -
 * the teaser renders nothing on null (MON-213).
 */
async function getUpcomingAgenda() {
  const today = parisToday()
  return api.agenda.get({ from: today, to: addDays(today, 7) }).catch(err => {
    Sentry.captureException(err)
    return null
  })
}

export default async function Home() {
  const [{ health, featuredVote, deputyInfo }, agenda] = await Promise.all([
    getStats(),
    getUpcomingAgenda(),
  ])
  const lastUpdated = formatFreshness(
    health ? health.last_ingestion ?? health.last_ingestion_at ?? health.updated_at : null
  )

  const homeStats = {
    deputies: numericStat(health?.deputies, FALLBACK_STATS.deputies),
    votes: numericStat(health?.votes, FALLBACK_STATS.votes),
    positions: numericStat(health?.positions, FALLBACK_STATS.positions),
    lastUpdated,
  }

  const resultLabel = (r: string) => r === 'adopté' ? 'Adopté' : 'Rejeté'

  const pulseVote = {
    title: featuredVote?.summary_plain || featuredVote?.vote_title || 'Vote solennel',
    result: featuredVote ? resultLabel(featuredVote.result) : 'Adopté',
    votesFor: featuredVote?.votes_for ?? 289,
    votesAgainst: featuredVote?.votes_against ?? 223,
    abstentions: featuredVote?.abstentions ?? 58,
    href: featuredVote ? `/votes/${featuredVote.vote_id}` : undefined,
    votedAt: formatVoteDate(featuredVote?.voted_at),
    voteId: featuredVote?.vote_id ?? '',
  }

  return (
    <div className="overflow-x-clip bg-[#070b14]">
      <AssemblyScrollExperience stats={homeStats} leadVote={pulseVote} deputyInfo={deputyInfo} />
      <UpcomingAgenda agenda={agenda} />
      <HomeSummary stats={homeStats} />
    </div>
  )
}
