import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ComparerClient } from './ComparerClient'
import { canonicalUrl } from '@/lib/site'

// Server component so the route can declare its own canonical (MON-269):
// the interactive part lives in ComparerClient, and the deputy ids this page
// compares travel in the query string, which the canonical deliberately drops.
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/deputes/comparer') },
}

export default function ComparerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--dp-text-muted)', fontSize: 14 }}>Chargement…</div>}>
      <ComparerClient />
    </Suspense>
  )
}
