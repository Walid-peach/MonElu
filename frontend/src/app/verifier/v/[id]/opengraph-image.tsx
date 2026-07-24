import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Vérification MonÉlu — verdict sur une affirmation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Verdicts are immutable snapshots (ADR-022): cache the card aggressively.
export const revalidate = 86400

const VERDICT_STYLES: Record<string, { label: string; color: string }> = {
  vrai: { label: 'VRAI', color: '#059669' },
  faux: { label: 'FAUX', color: '#C9302C' },
  trompeur: { label: 'TROMPEUR', color: '#D97706' },
  inverifiable: { label: 'INVÉRIFIABLE', color: '#6B7280' },
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const verdict = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'https://monelu-production.up.railway.app'}/verify/${id}`,
    { signal: AbortSignal.timeout(5000) }
  )
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

  // Don't cache a failure render under `revalidate = 86400` above — a thrown
  // error bypasses the route's cache, so the next scrape retries instead of
  // getting stuck with a stale "Vérification introuvable" card for a day.
  if (!verdict) {
    throw new Error(`Verification ${id} unavailable`)
  }

  const style = VERDICT_STYLES[verdict.verdict] ?? VERDICT_STYLES.inverifiable
  const claim = truncate(verdict.claim, 150)
  const citations = verdict.citations?.length ?? 0
  const horizon = verdict.data_horizon ?? null

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
          MonÉlu — Vérification d&apos;une affirmation
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 36,
          }}
        >
          <div
            style={{
              background: style.color,
              color: '#ffffff',
              fontSize: 44,
              fontWeight: 700,
              fontFamily: 'sans-serif',
              letterSpacing: '0.08em',
              padding: '14px 36px',
              borderRadius: 12,
            }}
          >
            {style.label}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 40,
            fontStyle: 'italic',
            lineHeight: 1.3,
            fontFamily: 'serif',
            maxWidth: 1000,
            marginBottom: 44,
          }}
        >
          « {claim} »
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 22,
            fontFamily: 'sans-serif',
          }}
        >
          {citations > 0
            ? `${citations} scrutin${citations > 1 ? 's' : ''} officiel${citations > 1 ? 's' : ''} cité${citations > 1 ? 's' : ''}`
            : 'Vérifié contre les scrutins officiels'}
          {horizon ? ` · données depuis le ${horizon}` : ''}
          {' · mon-elu.vercel.app/verifier'}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            width: 8,
            height: 200,
            background: style.color,
            borderRadius: 4,
          }}
        />
      </div>
    ),
    { ...size }
  )
}
