import type { Metadata } from 'next'
import { Suspense } from 'react'
import { VotesClient } from './VotesClient'
import { api } from '@/lib/api'
import { canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/votes') },
}

export const revalidate = 900

export default async function VotesPage() {
  const initial = await api.votes.list({ limit: 50 })

  // Compute hero stats from a larger sample
  const sample = await api.votes.list({ limit: 200 }).catch(() => initial)
  const adoptedCount = sample.items.filter(v => v.result === 'adopté').length
  const adoptionRate = sample.items.length > 0
    ? Math.round(adoptedCount / sample.items.length * 100)
    : 0
  const avgParticipation = sample.items.length > 0
    ? Math.round(sample.items.reduce((s, v) => s + (v.total_voters / 577), 0) / sample.items.length * 100)
    : 0

  const heroStats = [
    { value: initial.total.toLocaleString('fr-FR'), label: 'scrutins XVIIᵉ législature' },
    { value: `${adoptionRate} %`, label: "taux d'adoption" },
    { value: `${avgParticipation} %`, label: 'participation moyenne' },
    { value: '17ᵉ', label: 'législature · depuis 2024' },
  ]

  return (
    <Suspense fallback={<div className="text-gray-mid text-sm p-8">Chargement...</div>}>
      <VotesClient initial={initial} heroStats={heroStats} />
    </Suspense>
  )
}
