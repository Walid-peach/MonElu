'use client'
import { Suspense } from 'react'
import { ComparerClient } from './ComparerClient'

export default function ComparerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#9CA3AF', fontSize: 14 }}>Chargement…</div>}>
      <ComparerClient />
    </Suspense>
  )
}
