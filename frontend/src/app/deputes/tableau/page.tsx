import type { Metadata } from 'next'
import { api } from '@/lib/api'
import { TableauClient } from './TableauClient'
import { canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Tableau des députés - MonÉlu',
  description:
    "Tous les bilans de vote des députés de l'Assemblée nationale dans un tableau dense et triable : présence, positions, participation aux scrutins solennels. Export CSV.",
  alternates: { canonical: canonicalUrl('/deputes/tableau') },
}

// Rendered at request time, like /deputes: prerendering at build time would
// call the API's /deputies/scorecards during the deploy (and 404 until the
// API side of MON-97 is live). The fetch itself is cached for 1h (lib/api.ts).
export const dynamic = 'force-dynamic'

export default async function TableauPage() {
  const scorecards = await api.deputies.scorecards()
  return <TableauClient initial={scorecards} />
}
