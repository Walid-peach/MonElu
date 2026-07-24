import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Quel député vote comme vous ? — MonÉlu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static hook card, no data fetch — safe to cache for a long time.
export const revalidate = 86400

export default function OGImage() {
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
            display: 'flex',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 18,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 28,
            fontFamily: 'sans-serif',
          }}
        >
          MonÉlu
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 60,
            lineHeight: 1.2,
            fontFamily: 'serif',
            maxWidth: 1000,
            marginBottom: 28,
          }}
        >
          Quel député vote comme vous ?
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 28,
            lineHeight: 1.5,
            fontFamily: 'sans-serif',
            maxWidth: 1000,
          }}
        >
          10 vrais scrutins, 577 députés
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 22,
            fontFamily: 'sans-serif',
            marginTop: 44,
          }}
        >
          mon-elu.vercel.app/quiz — faites le test
        </div>
      </div>
    ),
    { ...size }
  )
}
