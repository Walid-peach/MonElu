import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { ChatAnswerCard } from '@/components/ChatAnswerCard'
import { SITE_URL, canonicalUrl } from '@/lib/site'

// Chat shares are immutable snapshots (ADR-024, mirrors ADR-022 for
// verifications): this page reads the stored answer via GET /search/share/{id}
// — it must never re-run the RAG chain.
export const dynamicParams = true
export const revalidate = 86400

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const share = await api.chatShare(id).catch(() => null)
  if (!share) return {}
  const title = `« ${share.question} » - MonÉlu`
  const description = share.answer.length > 160 ? share.answer.slice(0, 160) + '…' : share.answer
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(`/chat/s/${id}`) },
    openGraph: { title, description, url: `${SITE_URL}/chat/s/${id}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function ChatSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await api.chatShare(id).catch(() => null)
  if (!result) notFound()

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
      <p className="text-xs uppercase tracking-wide text-gray-mid dark:text-[color:var(--dp-text-muted)] mb-4">
        MonÉlu — réponse partagée
      </p>
      <ChatAnswerCard result={result} />
      <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
        <Link
          href={`/chat?q=${encodeURIComponent(result.question)}`}
          className="border border-navy text-navy dark:border-[color:var(--dp-text)] dark:text-[color:var(--dp-text)] px-4 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors"
        >
          Reposer cette question avec les données du jour
        </Link>
        <Link href="/chat" className="text-gray-mid dark:text-[color:var(--dp-text-muted)] underline hover:text-navy dark:hover:text-[color:var(--dp-text)]">
          Poser une autre question
        </Link>
      </div>
    </main>
  )
}
