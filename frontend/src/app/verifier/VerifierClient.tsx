'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { VerifyResult } from '@/lib/api'
import { VerdictCard } from '@/components/VerdictCard'

const EXAMPLE_CLAIM = '« Le député X a voté contre l’augmentation du SMIC »'

const MIN_CLAIM_LENGTH = 10
const MAX_CLAIM_LENGTH = 500

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('429')) {
    return 'Trop de vérifications en peu de temps. Patientez une minute et réessayez.'
  }
  if (msg.includes('503')) {
    return "La vérification IA n'est pas disponible pour le moment."
  }
  return 'La vérification a échoué. Réessayez dans quelques secondes.'
}

export function VerifierClient() {
  const searchParams = useSearchParams()
  const prefill = searchParams.get('claim') ?? ''

  // Initial value only: a "re-vérifier" navigation from the share page mounts
  // this component fresh, so useState(prefill) covers the prefill case.
  const [claim, setClaim] = useState(prefill)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)

  const tooShort = claim.trim().length < MIN_CLAIM_LENGTH

  async function submit() {
    if (tooShort || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.verify(claim.trim()))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
      <h1 className="font-serif text-3xl md:text-4xl font-extrabold text-navy tracking-tight mb-3">
        Vérifier une affirmation
      </h1>
      <p className="text-gray-mid text-[15px] leading-relaxed mb-8 max-w-2xl">
        Collez une affirmation lue sur les réseaux sociaux — par exemple {EXAMPLE_CLAIM} — et
        confrontez-la aux votes réellement enregistrés à l&apos;Assemblée Nationale. Le verdict cite
        les scrutins officiels, jamais une opinion.
      </p>

      <form
        onSubmit={e => {
          e.preventDefault()
          submit()
        }}
        className="mb-8"
      >
        <label htmlFor="claim" className="sr-only">
          Affirmation à vérifier
        </label>
        <textarea
          id="claim"
          value={claim}
          onChange={e => setClaim(e.target.value.slice(0, MAX_CLAIM_LENGTH))}
          rows={3}
          placeholder="Le député X a voté contre l'augmentation du SMIC…"
          className="w-full border border-gray-border rounded-xl p-4 text-[15px] text-navy focus:outline-none focus:border-navy resize-y"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-mid">
            {claim.length}/{MAX_CLAIM_LENGTH}
          </span>
          <button
            type="submit"
            disabled={tooShort || loading}
            className="bg-navy text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-red-civic transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Vérification en cours…' : 'Vérifier'}
          </button>
        </div>
      </form>

      {loading && (
        <div
          className="border border-gray-border rounded-xl p-6 text-sm text-gray-mid animate-pulse"
          role="status"
        >
          Recherche des scrutins correspondants et de la position enregistrée du député…
        </div>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded-xl p-4 text-sm" role="alert">
          {error}
        </div>
      )}

      {result && !loading && <VerdictCard result={result} />}
    </main>
  )
}
