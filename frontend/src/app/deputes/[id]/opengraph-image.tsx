import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { partyHex } from '@/lib/utils'

export const runtime = 'edge'
export const alt = 'Bilan de mandat — MonÉlu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const revalidate = 86400

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deputy, scorecard] = await Promise.all([
    api.deputies.get(id).catch(() => null),
    api.deputies.scorecard(id).catch(() => null),
  ])

  const presencePct = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const hex = deputy ? partyHex(deputy.party) : '#9CA3AF'

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0D1F3C',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '80px',
        }}
      >
        {deputy?.photo_url && (
          <img
            src={deputy.photo_url}
            width={280}
            height={280}
            style={{ borderRadius: 20, objectFit: 'cover', marginRight: 56, border: '2px solid rgba(255,255,255,0.15)' }}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div
            style={{
              display: 'flex',
              color: '#C9302C',
              fontSize: 18,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 22,
              fontFamily: 'sans-serif',
            }}
          >
            Député·e · MonÉlu
          </div>

          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: 54,
              lineHeight: 1.15,
              fontFamily: 'serif',
              maxWidth: 780,
              marginBottom: 20,
            }}
          >
            {deputy?.full_name ?? 'Député introuvable'}
          </div>

          {deputy?.party && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 32,
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 999, background: hex }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 24, fontFamily: 'sans-serif' }}>
                {deputy.party}
              </span>
            </div>
          )}

          {presencePct !== null && (
            <div style={{ display: 'flex', gap: 48 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#ffffff', fontSize: 40, fontFamily: 'serif', fontWeight: 700 }}>{presencePct}%</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>
                  Taux de présence
                </span>
              </div>
              {scorecard && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#ffffff', fontSize: 40, fontFamily: 'serif', fontWeight: 700 }}>
                    {scorecard.total_votes.toLocaleString('fr-FR')}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>
                    Scrutins votés
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

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
