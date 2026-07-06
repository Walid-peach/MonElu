'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import './globals.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <div className="max-w-2xl mx-auto px-4 md:px-8 py-16 text-center">
          <h2 className="font-serif text-2xl text-navy mb-3">
            Une erreur est survenue
          </h2>
          <p className="text-gray-mid text-sm mb-6">
            L&apos;application a rencontré un problème inattendu.
          </p>
          <button
            onClick={reset}
            className="bg-navy text-white px-5 py-2 rounded font-medium text-sm hover:bg-navy/90 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
