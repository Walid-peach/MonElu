import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { QuizResultSections } from '../../QuizResultSections'

// Quiz shares are immutable snapshots of server-computed results (ADR-025,
// mirrors ADR-024 chat shares): this page reads the stored result via
// GET /quiz/share/{id} — it never recomputes the match.
export const dynamicParams = true
export const revalidate = 86400

const CREAM = '#F7F4ED'
const RED = '#C9302A'

function hookTitle(share: Awaited<ReturnType<typeof api.quiz.getShare>>): string {
  const best = share.result.top_matches[0]
  return best && best.agreement_pct !== null
    ? `Je vote à ${best.agreement_pct}% comme ${best.full_name}`
    : 'Quel député vote comme vous ?'
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const share = await api.quiz.getShare(id).catch(() => null)
  if (!share) return {}
  const title = `${hookTitle(share)} — MonÉlu`
  const description =
    'Une dizaine de vrais scrutins de l’Assemblée nationale, comparés aux votes réels ' +
    'des 577 députés. Faites le test sur MonÉlu.'
  return {
    title,
    description,
    openGraph: { title, description, url: `https://mon-elu.vercel.app/quiz/s/${id}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function QuizSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const share = await api.quiz.getShare(id).catch(() => null)
  if (!share) notFound()

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 96px' }}>
        <p
          style={{
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: RED,
            margin: '0 0 16px',
          }}
        >
          MonÉlu — résultat partagé
        </p>
        <QuizResultSections result={share.result} />
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <Link
            href="/quiz"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#E0786E',
              color: '#fff',
              padding: '13px 30px',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 15.5,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(224,120,110,0.35)',
            }}
          >
            Faites le test — quel député vote comme vous ?
          </Link>
        </div>
      </main>
    </div>
  )
}
