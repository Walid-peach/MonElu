import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DeputiesClient } from '../DeputiesClient'
import { api } from '@/lib/api'
import type { Deputy } from '@/lib/api'
import { canonicalUrl } from '@/lib/site'

// The `(liste)` route group exists only to scope this page's `loading.tsx`
// (MON-275). A `loading.tsx` wraps every route *nested* under its segment, so
// while it sat at `deputes/` it also wrapped `deputes/[id]` - and a
// streaming Suspense boundary flushes HTTP 200 before the page body runs, so
// the `notFound()` in the detail route could never set a 404. The group keeps
// the skeleton on this page and takes the boundary off the detail route.
// Route groups do not appear in the URL: this is still /deputes.

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/deputes') },
}

export const dynamic = 'force-dynamic'

async function fetchAllDeputies() {
  const first = await api.deputies.list({ limit: 200, offset: 0 })
  const total = first.total
  const items: Deputy[] = [...first.items]
  if (total > 200) {
    const pages = Math.ceil((total - 200) / 200)
    const rest = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        api.deputies.list({ limit: 200, offset: 200 + i * 200 })
      )
    )
    items.push(...rest.flatMap(r => r.items))
  }
  return { total, items, limit: 200, offset: 0 }
}

export default async function DeputiesPage() {
  const initial = await fetchAllDeputies()
  return (
    <Suspense fallback={<div className="min-h-screen bg-[color:var(--dp-page-bg)]" />}>
      <DeputiesClient initial={initial} />
    </Suspense>
  )
}
