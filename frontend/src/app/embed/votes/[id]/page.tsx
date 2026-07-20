import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { SITE_URL } from '@/lib/seo'

export const dynamicParams = true
export const revalidate = 86400

const NAVY = '#1B2B50'
const LINE = '#E4E6EA'
const RED = '#C9302A'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const vote = await api.votes.get(id).catch(() => null)
  if (!vote) return {}
  return { title: `${vote.vote_title} - MonÉlu`, robots: { index: false, follow: true } }
}

export default async function EmbedVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vote = await api.votes.get(id).catch(() => null)
  if (!vote) notFound()

  const denom = vote.total_voters || 1
  const pourPct = Math.round(vote.votes_for / denom * 100)
  const contrePct = Math.round(vote.votes_against / denom * 100)
  const abstPct = Math.round(vote.abstentions / denom * 100)
  const adopted = vote.result === 'adopté'
  const voteUrl = `${SITE_URL}/votes/${id}`

  return (
    <div style={{ background: '#fff', fontFamily: 'sans-serif', padding: 20, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            display: 'inline-flex', padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: adopted ? '#1F8A5B' : RED,
            background: adopted ? 'rgba(31,138,91,0.1)' : 'rgba(201,48,42,0.1)',
          }}
        >
          {adopted ? 'Adopté' : 'Rejeté'}
        </span>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          {new Date(vote.voted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <a
        href={voteUrl}
        target="_top"
        rel="noopener noreferrer"
        style={{ display: 'block', fontSize: 17, lineHeight: 1.35, color: NAVY, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}
      >
        {vote.vote_title}
      </a>

      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pourPct}%`, background: '#1F8A5B' }} />
        <div style={{ width: `${contrePct}%`, background: RED }} />
        <div style={{ width: `${abstPct}%`, background: '#D1D5DB' }} />
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#374151', marginBottom: 18 }}>
        <span>Pour <strong>{pourPct}%</strong> ({vote.votes_for})</span>
        <span>Contre <strong>{contrePct}%</strong> ({vote.votes_against})</span>
        <span>Abst. <strong>{abstPct}%</strong> ({vote.abstentions})</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>
          Données Assemblée nationale · <strong style={{ color: NAVY }}>MonÉlu</strong>
        </span>
        <a href={voteUrl} target="_top" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: RED, textDecoration: 'none' }}>
          Voir la fiche complète →
        </a>
      </div>
    </div>
  )
}
