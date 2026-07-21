'use client'
import { Suspense } from 'react'
import { ComparerClient } from './ComparerClient'

export default function ComparerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--dp-text-muted)', fontSize: 14 }}>Chargement…</div>}>
      <ComparerClient />
    </Suspense>
  )
}
