import { Suspense } from 'react'
import { DeputiesClient } from './DeputiesClient'
import { api } from '@/lib/api'

export const revalidate = 3600

export default async function DeputiesPage() {
  const initial = await api.deputies.list({ limit: 50 })
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
