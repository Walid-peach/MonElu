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
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
      <h1 className="font-serif text-3xl text-navy mb-2">Les députés</h1>
      <p className="text-gray-mid text-sm mb-6">Assemblée Nationale · 17ème législature</p>
      <Suspense fallback={<div className="text-gray-mid text-sm">Chargement...</div>}>
        <DeputiesClient initial={initial} />
      </Suspense>
    </div>
  )
}
