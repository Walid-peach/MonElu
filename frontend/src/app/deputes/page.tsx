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
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-serif text-display-sm md:text-display text-navy leading-tight">
          Annuaire des députés
        </h1>
        <p className="text-gray-mid text-sm mt-2">
          {initial.total} député·e·s · Assemblée Nationale · 17<sup>ème</sup> législature
        </p>
      </div>
      <Suspense fallback={<div className="text-gray-mid text-sm">Chargement...</div>}>
        <DeputiesClient initial={initial} />
      </Suspense>
    </div>
  )
}
