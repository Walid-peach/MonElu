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

    if (featuredVote) {
      try {
        const voteDetail = await api.votes.get(featuredVote.vote_id)
        const eligible = (voteDetail.positions ?? []).filter(
          (p): p is typeof p & { position: 'pour' | 'contre' | 'abstention' } =>
            p.position === 'pour' || p.position === 'contre' || p.position === 'abstention'
        )
        const withPhoto = eligible
          .map(p => ({ pos: p, deputy: deputies?.find(d => d.deputy_id === p.deputy_id) }))
          .find(x => x.deputy?.photo_url)
        if (withPhoto?.deputy) {
          picked = withPhoto.deputy
          pickedPosition = withPhoto.pos.position
        } else if (eligible.length) {
          const fallback = eligible[Math.floor(eligible.length / 2)]
          picked = await api.deputies.get(fallback.deputy_id)
          pickedPosition = fallback.position
        }
      } catch { /* ignore */ }
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
          presenceRate: Math.round((sc.presence_rate ?? 0) * 100),
          votesFor: sc.votes_for ?? 0,
          votesAgainst: sc.votes_against ?? 0,
          abstentions: sc.abstentions ?? 0,
          votePosition: pickedPosition,
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
