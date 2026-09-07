import { ImageResponse } from 'next/og'
import { SITE_HOST } from '@/lib/site'

// The card's copy is deliberately apostrophe-free. Satori breaks a word on
// the apostrophe and lays the halves out with a gap, so "l'Assemblée examine"
// rendered with a visible hole after it - straight quote and typographic quote
// alike, and inside a JS string as much as in JSX text.
export const runtime = 'edge'
export const alt = "À l'ordre du jour de l'Assemblée nationale - MonÉlu"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static card, no data fetch - the agenda itself changes daily, but a card
// naming a specific sitting would be stale the moment it is shared.
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
          Ce que les députés examinent cette semaine
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
          Le calendrier de la séance publique, jour par jour
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
          {`${SITE_HOST}/agenda`}
        </div>
      </div>
    ),
    { ...size }
  )
}
