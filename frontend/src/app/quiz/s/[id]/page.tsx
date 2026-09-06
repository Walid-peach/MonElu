import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api, nullIfMissing } from '@/lib/api'
import { SITE_URL } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'
import { QuizResultCard } from '../../QuizResultCard'
import { QuizResultSections } from '../../QuizResultSections'

// Quiz shares are immutable snapshots of server-computed results (ADR-025,
// mirrors ADR-024 chat shares): this page reads the stored result via
// GET /quiz/share/{id} — it never recomputes the match.
export const dynamicParams = true
export const revalidate = 86400

const CREAM = 'var(--dp-page-bg)'
const RED = 'var(--dp-red)'

function hookTitle(share: Awaited<ReturnType<typeof api.quiz.getShare>>): string {
  const best = share.result.top_matches[0]
  return best && best.agreement_pct !== null
    ? `Je vote à ${best.agreement_pct}% comme ${best.full_name}`
    : 'Quel député vote comme vous ?'
}

// Snapshot pages are noindex (ADR-036, MON-264): the corpus is user-submitted
// and unmoderated, so it stays out of the index, not merely out of the sitemap.
// `follow: true` - the outbound links here point at pages that should be crawled.
const SNAPSHOT_ROBOTS = { index: false, follow: true } as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const alternates = { canonical: canonicalUrl(`/quiz/s/${id}`) }
  const share = await api.quiz.getShare(id).catch(() => null)
  if (!share) return { alternates, robots: SNAPSHOT_ROBOTS }
  const title = `${hookTitle(share)} — MonÉlu`
  const description =
    'Une dizaine de vrais scrutins de l’Assemblée nationale, comparés aux votes réels ' +
    'des 577 députés. Faites le test sur MonÉlu.'
  return {
    title,
    description,
    alternates,
    robots: SNAPSHOT_ROBOTS,
    openGraph: { title, description, url: `${SITE_URL}/quiz/s/${id}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function QuizSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const share = await api.quiz.getShare(id).catch(nullIfMissing)
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
        <QuizResultCard result={share.result} />
        {/* The card is the hero; the full sections stay below it so the
            crawlable detail and the internal links to /deputes and /votes
            survive the redesign (MON-203). */}
        <div style={{ marginTop: 48 }}>
          <QuizResultSections result={share.result} />
        </div>
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <Link
            href={share.result.answers ? `/quiz?compare=${id}&ref=share` : '/quiz?ref=share'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--dp-cta-bg)',
              color: '#fff',
              padding: '13px 30px',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 15.5,
              textDecoration: 'none',
              boxShadow: '0 2px 8px var(--dp-cta-shadow)',
            }}
          >
            {share.result.answers
              ? 'Faites le test et comparez-vous'
              : 'Faites le test — quel député vote comme vous ?'}
          </Link>
        </div>
      </main>
    </div>
  )
}
