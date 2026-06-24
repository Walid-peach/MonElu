import { api, Vote, Deputy, Scorecard } from '@/lib/api'
import { AssemblyScrollExperience } from '@/components/home/AssemblyScrollExperience'

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
  presenceRate: number
  votesFor: number
  votesAgainst: number
  abstentions: number
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

    // Pick first deputy with a photo, fetch their scorecard
    let deputyInfo: DeputyInfo | null = null
    const deputies = deputyList?.items as Deputy[] | undefined
    const picked = deputies?.find(d => d.photo_url) ?? deputies?.[0] ?? null
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
          presenceRate: Math.round((sc.presence_rate ?? 0) * 100),
          votesFor: sc.votes_for ?? 0,
          votesAgainst: sc.votes_against ?? 0,
          abstentions: sc.abstentions ?? 0,
        }
      } catch { /* ignore */ }
    }

    return { health, featuredVote, deputyInfo }
  } catch {
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

export default async function Home() {
  const { health, featuredVote, deputyInfo } = await getStats()
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
    </div>
  )
}
