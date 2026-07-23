import { Suspense } from 'react'
import { DeputiesClient } from './DeputiesClient'
import { api } from '@/lib/api'
import type { Deputy } from '@/lib/api'

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
