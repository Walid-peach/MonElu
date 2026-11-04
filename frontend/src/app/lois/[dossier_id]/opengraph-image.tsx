import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { shortTitle, statusLabel } from '@/lib/lois'

export const runtime = 'edge'
export const alt = 'Où en est ce texte de loi ? - MonÉlu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const revalidate = 86400

/** A bill's card: its status and its title, cut so the longest one still fits (#372). */
export default async function OGImage({ params }: { params: Promise<{ dossier_id: string }> }) {
  const { dossier_id } = await params
  const loi = await api.lois.get(dossier_id).catch(() => null)
  const status = statusLabel(loi?.status)
  const title = loi ? shortTitle(loi.titre, 120) : 'Texte introuvable'

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
              background: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {status ?? 'Texte de loi'}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 52,
            lineHeight: 1.2,
            fontFamily: 'serif',
            maxWidth: 1040,
            marginBottom: 40,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', color: 'rgba(255,255,255,0.7)', fontSize: 24, fontFamily: 'sans-serif' }}>
          Où en est cette loi ? Son parcours et les votes, sur MonÉlu
        </div>
      </div>
    ),
    size,
  )
}
