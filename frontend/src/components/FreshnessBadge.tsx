import { api } from '@/lib/api'

const STALE_AFTER_MS = 4 * 24 * 60 * 60 * 1000 // matches dbt's warn_after: 4 days

function describeFreshness(lastIngestion: string): { stale: boolean; formatted: string } | null {
  const date = new Date(lastIngestion)
  if (Number.isNaN(date.getTime())) return null

  return {
    stale: Date.now() - date.getTime() > STALE_AFTER_MS,
    formatted: new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date),
  }
}

/**
 * Rendered from the root layout, so its `/health` fetch sets the floor for the
 * ISR revalidation interval of every route on the site (GH #354). It is cached
 * by tag and refreshed by `/api/revalidate` after ingestion - see
 * `@/lib/cacheTags` - rather than on a five-minute timer.
 *
 * It fails closed: if `/health` is unreachable, or has no `last_ingestion`,
 * nothing renders rather than a stale or invented date. A failed fetch is not
 * cached by Next, but the badge-less render of the page it was in is, so a
 * `/health` outage can hide the badge until the next revalidation - which the
 * post-ingestion `/api/revalidate` call, not the fallback interval, normally
 * provides.
 */
export async function FreshnessBadge() {
  let lastIngestion: string | null = null
  try {
    const health = await api.health()
    lastIngestion = typeof health.last_ingestion === 'string' ? health.last_ingestion : null
  } catch {
    return null
  }

  if (!lastIngestion) return null

  const freshness = describeFreshness(lastIngestion)
  if (!freshness) return null
  const { stale, formatted } = freshness

  return (
    <div
      className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium border-b ${
        stale
          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          : 'bg-gray-off text-gray-mid border-gray-border dark:bg-[color:var(--dp-page-bg)] dark:text-[color:var(--dp-text-muted)] dark:border-[color:var(--dp-border)]'
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-emerald-500'}`}
      />
      Données à jour au {formatted}
    </div>
  )
}
