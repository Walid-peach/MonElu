import type { Metadata } from 'next'
import { Suspense } from 'react'
import { VerifierClient } from './VerifierClient'

export const metadata: Metadata = {
  title: 'Vérifier une affirmation - MonÉlu',
  description:
    "Vérifiez une affirmation sur les votes d'un député de l'Assemblée Nationale contre la source primaire : verdict structuré, scrutins cités, position réellement enregistrée.",
  openGraph: {
    title: 'Vérifier une affirmation - MonÉlu',
    description:
      "Vérifiez une affirmation sur les votes d'un député contre les données officielles de l'Assemblée Nationale.",
    url: 'https://mon-elu.vercel.app/verifier',
  },
}

export default function VerifierPage() {
  return (
    <Suspense fallback={<div className="text-gray-mid text-sm p-8">Chargement...</div>}>
      <VerifierClient />
    </Suspense>
  )
}
