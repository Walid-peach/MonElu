'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { resolvePostalCode } from '@/lib/postal'

type HeroSearchProps = {
  id?: string
  placeholder?: string
  buttonLabel?: string
}

export function HeroSearch({
  id = 'hero-deputy-search',
  placeholder = 'Nom ou département (ex: Marine Le Pen, Paris...)',
  buttonLabel = 'Trouver mon député',
}: HeroSearchProps) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setLoading(true)
    const resolved = await resolvePostalCode(trimmed)
    const query = resolved ?? trimmed
    router.push(`/deputes?search=${encodeURIComponent(query)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor={id} className="sr-only">
        Rechercher un député ou un département
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border border-navy/15 bg-white/95 px-4 py-4 text-sm text-navy shadow-sm outline-none transition-colors placeholder:text-navy/35 focus:border-navy"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="shrink-0 bg-red-civic px-5 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-light disabled:opacity-60"
      >
        {loading ? 'Recherche...' : buttonLabel}
      </button>
    </form>
  )
}
