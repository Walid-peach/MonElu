import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Quel député vote comme vous ? — MonÉlu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Quiz shares are immutable snapshots (ADR-025): cache the card aggressively.
export const revalidate = 86400

type ShareBest = {
  full_name: string | null
  party: string | null
  department: string | null
  agreement_pct: number | null
}

export default async function OGImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const share = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'https://monelu-production.up.railway.app'}/quiz/share/${id}`,
    { signal: AbortSignal.timeout(5000) }
  )
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)

  // Don't cache a failure render under `revalidate = 86400` above — a thrown
  // error bypasses the route's cache, so the next scrape retries instead of
  // getting stuck with a stale "Résultat introuvable" card for a day.
  if (!share) {
    throw new Error(`Quiz share ${id} unavailable`)
  }

  const best: ShareBest | null = share?.result?.top_matches?.[0] ?? null
  const headline =
    best && best.agreement_pct !== null
      ? `Je vote à ${best.agreement_pct}% comme ${best.full_name}`
      : 'Quel député vote comme vous ?'
  const subline = best
    ? [best.party, best.department].filter(Boolean).join(' · ')
    : 'Résultat introuvable'

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
          MonÉlu — Quel député vote comme vous ?
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 54,
            lineHeight: 1.25,
            fontFamily: 'serif',
            maxWidth: 1000,
            marginBottom: 28,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: 'flex',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 26,
            lineHeight: 1.5,
            fontFamily: 'sans-serif',
            maxWidth: 1000,
          }}
        >
          {subline}
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
