import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'

export const runtime = 'edge'
export const alt = 'Résultat du scrutin — MonÉlu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const revalidate = 86400

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vote = await api.votes.get(id).catch(() => null)

  const adopted = vote?.result === 'adopté'
  const denom = vote?.total_voters || 1
  const pourPct = vote ? Math.round(vote.votes_for / denom * 100) : 0
  const contrePct = vote ? Math.round(vote.votes_against / denom * 100) : 0
  const abstPct = vote ? Math.round(vote.abstentions / denom * 100) : 0
  const title = vote ? (vote.vote_title.length > 90 ? vote.vote_title.slice(0, 90) + '…' : vote.vote_title) : 'Scrutin introuvable'

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0D1F3C',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              padding: '8px 20px',
              borderRadius: 999,
              background: adopted ? 'rgba(31,138,91,0.18)' : 'rgba(201,48,42,0.18)',
              color: adopted ? '#3FCB8D' : '#F0837C',
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {vote ? (adopted ? 'Adopté' : 'Rejeté') : 'Scrutin'}
          </div>
          {vote?.voted_at && (
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 18, fontFamily: 'sans-serif' }}>
              {new Date(vote.voted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 46,
            lineHeight: 1.25,
            fontFamily: 'serif',
            maxWidth: 1020,
            marginBottom: 44,
          }}
        >
          {title}
        </div>

        {vote && (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 1020 }}>
            <div style={{ display: 'flex', height: 22, borderRadius: 999, overflow: 'hidden', width: '100%' }}>
              <div style={{ width: `${pourPct}%`, background: '#1F8A5B', height: '100%' }} />
              <div style={{ width: `${contrePct}%`, background: '#C9302C', height: '100%' }} />
              <div style={{ width: `${abstPct}%`, background: 'rgba(255,255,255,0.3)', height: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 40, marginTop: 20 }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, fontFamily: 'sans-serif' }}>
                Pour <span style={{ color: '#3FCB8D', fontWeight: 700 }}>{pourPct}%</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, fontFamily: 'sans-serif' }}>
                Contre <span style={{ color: '#F0837C', fontWeight: 700 }}>{contrePct}%</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, fontFamily: 'sans-serif' }}>
                Abstention <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>{abstPct}%</span>
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            width: 8,
            height: 200,
            background: '#C9302C',
            borderRadius: 4,
          }}
        />
      </div>
    ),
    { ...size }
  )
}
