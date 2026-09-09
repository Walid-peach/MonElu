import type { Metadata } from 'next'
import { MonDeputeClient } from './MonDeputeClient'
import { canonicalUrl } from '@/lib/site'

// Server component so the route can declare its own canonical (MON-269); the
// page itself is entirely client-side (the followed deputy lives in
// localStorage — see lib/mon-depute.ts).
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/mon-depute') },
}

export default function MonDeputePage() {
  return <MonDeputeClient />
}
