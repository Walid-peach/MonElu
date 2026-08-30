import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import { getInitials, groupVotesByParty, normalizePartyShort, partyHex, partyShort } from '@/lib/utils'
import { VoteDetailClient } from './VoteDetailClient'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildVoteJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

export const dynamicParams = true
export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // The canonical is derived from the URL alone, so it survives a failed
  // metadata fetch - the build's prerender burst can trip the API's rate
  // limit, and a page that renders anyway must still state its own identity.
  const alternates = { canonical: canonicalUrl(`/votes/${id}`) }
  const vote = await api.votes.get(id).catch(() => null)
  if (!vote) return { alternates }
  const result = vote.result === 'adopté' ? 'Adopté' : 'Rejeté'
  const shortTitle = vote.vote_title.length > 80 ? vote.vote_title.slice(0, 80) + '…' : vote.vote_title
  const description = `${result} · ${vote.votes_for} pour · ${vote.votes_against} contre · ${vote.abstentions} abstentions.`
  return {
    title: `${result} - ${shortTitle} - MonÉlu`,
    description,
    alternates,
    openGraph: { title: `${result} - ${shortTitle} - MonÉlu`, description, url: `${SITE_URL}/votes/${id}` },
    twitter: { card: 'summary_large_image', title: `${result} - ${shortTitle} - MonÉlu`, description },
  }
}

export async function generateStaticParams() {
  try {
    const data = await api.votes.list({ limit: 100 })
    return data.items.map(v => ({ id: v.vote_id }))
  } catch { return [] }
}

export default async function VoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vote = await api.votes.get(id).catch(() => null)
  if (!vote) notFound()

  const pourPct   = Math.round(vote.votes_for     / (vote.total_voters || 1) * 100)
  const contrePct = Math.round(vote.votes_against / (vote.total_voters || 1) * 100)
  const abstPct   = Math.round(vote.abstentions   / (vote.total_voters || 1) * 100)

  // Build group rows
  const partyMap = groupVotesByParty(vote.positions ?? [])
  const groups = Object.entries(partyMap)
    .map(([name, counts]) => {
      const total  = counts.pour + counts.contre + counts.abstention + counts.nonVotant
      const forPct = Math.round(counts.pour   / (total || 1) * 100)
      const agtPct = Math.round(counts.contre / (total || 1) * 100)
      const position: 'Pour' | 'Contre' | 'Partagé' =
        counts.pour > counts.contre ? 'Pour' : counts.contre > counts.pour ? 'Contre' : 'Partagé'
      return { name, color: partyHex(name), pour: counts.pour, contre: counts.contre, abst: counts.abstention, nonVotant: counts.nonVotant, position, forPct, agtPct }
    })
    .sort((a, b) => (b.pour + b.contre + b.abst + b.nonVotant) - (a.pour + a.contre + a.abst + a.nonVotant))

  // Compute dissidents (deputies who voted against their party majority)
  const dissidents: {
    deputy_id: string; full_name: string; initials: string; party: string
    avatarColor: string; vote: string; note: string
  }[] = []

  if (vote.positions && vote.positions.length > 0) {
    const majorityByParty: Record<string, string> = {}
    for (const [party, counts] of Object.entries(partyMap)) {
      const entries = Object.entries(counts).filter(([k]) => k !== 'nonVotant')
      const majority = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      majorityByParty[party] = majority
    }
    for (const pos of vote.positions) {
      if (pos.position === 'nonVotant') continue
      const party = normalizePartyShort(pos.party_short) || 'Non inscrit'
      const majority = majorityByParty[party]
      if (majority && pos.position !== majority && dissidents.length < 4) {
        dissidents.push({
          deputy_id: pos.deputy_id,
          full_name: pos.full_name,
          initials: getInitials(pos.full_name),
          party,
          avatarColor: partyHex(party),
          vote: pos.position,
          note: 'Dissident · contre son groupe',
        })
      }
    }
  }

  // Related votes (same theme)
  let related: { vote_id: string; vote_title: string; voted_at: string; result: string }[] = []
  if (vote.theme) {
    try {
      const rel = await api.votes.list({ theme: vote.theme, limit: 4 })
      related = rel.items
        .filter(v => v.vote_id !== vote.vote_id)
        .slice(0, 3)
        .map(v => ({ vote_id: v.vote_id, vote_title: v.vote_title, voted_at: v.voted_at, result: v.result }))
    } catch { /* skip */ }
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://monelu-production.up.railway.app'

  // One seat per recorded position (pour/contre/abstention/nonVotant) for the
  // hemicycle chart (MON-104). Absent deputies have no vote_positions row and
  // are deliberately not seated - the /deputies roster has no active-mandate
  // filter, so padding with roster entries would seat ex-deputies.
  const hemicycleDeputies = (vote.positions ?? []).map(p => ({
    deputy_id: p.deputy_id,
    full_name: p.full_name,
    party: normalizePartyShort(p.party_short),
    position: p.position,
  }))

  // Full deputy roster (paginated — /deputies caps limit at 200) so "how did my
  // deputy vote?" can surface an explicit "absent / non enregistré" state for
  // deputies with no recorded position on this vote, not just an empty result.
  // These 3 URLs are identical across every vote page, so Next's fetch data
  // cache dedupes them to 3 real network calls per revalidate window rather
  // than 3 × (number of statically generated vote pages) — relevant if this
  // ever hits the API's 30 req/min limiter; failures degrade to an empty
  // roster (via .catch) rather than failing the build.
  const rosterPages = await Promise.all(
    [0, 200, 400].map(offset => api.deputies.list({ limit: 200, offset }).catch(() => ({ items: [] })))
  )
  const positionByDeputy = new Map(vote.positions?.map(p => [p.deputy_id, p]) ?? [])
  const deputyLookup = rosterPages.flatMap(page => page.items).map(d => {
    const pos = positionByDeputy.get(d.deputy_id)
    return {
      deputy_id: d.deputy_id,
      full_name: d.full_name,
      // Always a short code, whether it comes from the recorded position or is
      // derived from the deputy's full party name — keeps the lookup card and
      // suggestion list visually consistent regardless of whether the deputy
      // voted on this scrutin.
      party: normalizePartyShort(pos?.party_short ?? null) ?? partyShort(d.party),
      department: d.department,
      position: pos?.position ?? null,
    }
  })

  return (
    <>
      <JsonLd data={buildVoteJsonLd(vote)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Accueil', url: SITE_URL },
        { name: 'Votes', url: `${SITE_URL}/votes` },
        { name: vote.vote_title, url: `${SITE_URL}/votes/${vote.vote_id}` },
      ])} />
      <Suspense fallback={<div style={{ padding: '48px 32px', color: 'var(--dp-text-muted)', fontSize: 14 }}>Chargement…</div>}>
        <VoteDetailClient
          voteId={vote.vote_id}
          voteTitle={vote.vote_title}
          result={vote.result}
          votedAt={vote.voted_at}
          summary={vote.summary_plain ?? null}
          dossierId={vote.dossier_id ?? null}
          theme={vote.theme ?? null}
          votesFor={vote.votes_for}
          votesAgainst={vote.votes_against}
          abstentions={vote.abstentions}
          totalVoters={vote.total_voters}
          pourPct={pourPct}
          contrePct={contrePct}
          abstPct={abstPct}
          groups={groups}
          dissidents={dissidents}
          related={related}
          apiUrl={apiUrl}
          deputyLookup={deputyLookup}
          hemicycleDeputies={hemicycleDeputies}
        />
      </Suspense>
    </>
  )
}
