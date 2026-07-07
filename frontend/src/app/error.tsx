'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function Error({
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
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-16 text-center">
      <h2 className="font-serif text-2xl text-navy mb-3">
        Une erreur est survenue
      </h2>
      <p className="text-gray-mid text-sm mb-6">
        L&apos;API est temporairement indisponible. Les données seront de nouveau accessibles dans quelques instants.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="bg-navy text-white px-5 py-2 rounded font-medium text-sm hover:bg-navy/90 transition-colors"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="border border-navy/30 text-navy px-5 py-2 rounded font-medium text-sm hover:bg-navy/5 transition-colors"
        >
          Accueil
        </Link>
      </div>
    </div>
  )
}
