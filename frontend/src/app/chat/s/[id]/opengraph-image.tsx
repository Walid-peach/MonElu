import { ImageResponse } from 'next/og'
import { SITE_HOST } from '@/lib/site'

export const runtime = 'edge'
export const alt = 'Réponse MonÉlu — recherche sur les votes et les députés'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Chat shares are immutable snapshots (ADR-024): cache the card aggressively.
export const revalidate = 86400

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const share = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'https://monelu-production.up.railway.app'}/search/share/${id}`,
    { signal: AbortSignal.timeout(5000) }
  )
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

  // Don't cache a failure render under `revalidate = 86400` above — a thrown
  // error bypasses the route's cache, so the next scrape retries instead of
  // getting stuck with a stale "Réponse introuvable" card for a day.
  if (!share) {
    throw new Error(`Chat share ${id} unavailable`)
  }

  const question = truncate(share.question, 120)
  const answer = truncate(share.answer.replace(/\*\*/g, ''), 220)

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
          MonÉlu — Recherche sur les votes et les députés
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 38,
            fontStyle: 'italic',
            lineHeight: 1.3,
            fontFamily: 'serif',
            maxWidth: 1000,
            marginBottom: 32,
          }}
        >
          « {question} »
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 24,
            lineHeight: 1.5,
            fontFamily: 'sans-serif',
            maxWidth: 1000,
          }}
        >
          {answer}
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
          {`${SITE_HOST}/chat`}
        </div>
      </div>
    ),
    { ...size }
  )
}
