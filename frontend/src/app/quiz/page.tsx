import type { Metadata } from 'next'
import { Suspense } from 'react'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { QuizClient } from './QuizClient'

const TITLE = 'Quel député vote comme vous ? — MonÉlu'
const DESCRIPTION =
  'Répondez à une dizaine de vrais scrutins de l’Assemblée nationale et découvrez ' +
  'quel député vote comme vous. Sans compte, rien n’est enregistré.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/quiz` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/quiz`,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function QuizPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Accueil', url: SITE_URL },
          { name: 'Quel député vote comme vous ?', url: `${SITE_URL}/quiz` },
        ])}
      />
      <Suspense fallback={null}>
        <QuizClient />
      </Suspense>
    </>
  )
}
