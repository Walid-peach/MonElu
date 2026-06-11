import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MonÉlu — Chaque vote. Chaque député.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const revalidate = 3600

export default async function OGImage() {
  const health = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'https://monelu-production.up.railway.app'}/health/`
  ).then(r => r.json()).catch(() => null)

  const deputies = health?.deputies ? Number(health.deputies).toLocaleString('fr-FR') : null
  const votes = health?.votes ? Number(health.votes).toLocaleString('fr-FR') : null

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
        <div
          style={{
            color: '#C9302C',
            fontSize: 18,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 24,
            fontFamily: 'sans-serif',
          }}
        >
          Plateforme civique open source
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 400,
            lineHeight: 1.1,
            marginBottom: 32,
            fontFamily: 'serif',
          }}
        >
          MonÉlu
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 28,
            fontFamily: 'sans-serif',
            maxWidth: 700,
            marginBottom: 48,
          }}
        >
          Chaque vote. Chaque député. En clair.
        </div>

        {(deputies || votes) && (
          <div style={{ display: 'flex', gap: 48 }}>
            {deputies && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#ffffff', fontSize: 36, fontFamily: 'serif', fontWeight: 700 }}>{deputies}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>Députés</span>
              </div>
            )}
            {votes && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#ffffff', fontSize: 36, fontFamily: 'serif', fontWeight: 700 }}>{votes}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>Votes analysés</span>
              </div>
            )}
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
