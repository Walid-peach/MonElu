import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api, nullIfMissing } from '@/lib/api'
import { VerdictCard } from '@/components/VerdictCard'
import { SITE_URL, canonicalUrl } from '@/lib/site'

// Verdicts are immutable snapshots (ADR-022): this page reads the stored
// verdict via GET /verify/{id} — it must never trigger a new verification.
export const dynamicParams = true
export const revalidate = 86400

const VERDICT_LABELS: Record<string, string> = {
  vrai: 'Vrai',
  faux: 'Faux',
  trompeur: 'Trompeur',
  inverifiable: 'Invérifiable',
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
  const alternates = { canonical: canonicalUrl(`/verifier/v/${id}`) }
  const v = await api.verification(id).catch(() => null)
  if (!v) return { alternates, robots: SNAPSHOT_ROBOTS }
  const label = VERDICT_LABELS[v.verdict] ?? v.verdict
  const shortClaim = v.claim.length > 90 ? v.claim.slice(0, 90) + '…' : v.claim
  const title = `${label} - « ${shortClaim} » - MonÉlu Vérification`
  const description = v.explanation.length > 160 ? v.explanation.slice(0, 160) + '…' : v.explanation
  return {
    title,
    description,
    alternates,
    robots: SNAPSHOT_ROBOTS,
    openGraph: { title, description, url: `${SITE_URL}/verifier/v/${id}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await api.verification(id).catch(nullIfMissing)
  if (!result) notFound()

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
      <p className="text-xs uppercase tracking-wide text-gray-mid dark:text-[color:var(--dp-text-muted)] mb-4">
        Vérification MonÉlu — verdict enregistré
      </p>
      <VerdictCard result={result} />
      <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
        <Link
          href={`/chat?mode=verify&claim=${encodeURIComponent(result.claim)}`}
          className="border border-navy text-navy dark:border-[color:var(--dp-text)] dark:text-[color:var(--dp-text)] px-4 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors"
        >
          Re-vérifier avec les données du jour
        </Link>
        <Link href="/chat?mode=verify" className="text-gray-mid dark:text-[color:var(--dp-text-muted)] underline hover:text-navy dark:hover:text-[color:var(--dp-text)]">
          Vérifier une autre affirmation
        </Link>
      </div>
    </main>
  )
}
