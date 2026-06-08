import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MonÉlu — Chaque vote. Chaque député.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
          }}
        >
          Chaque vote. Chaque député. En clair.
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
