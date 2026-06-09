'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { resolvePostalCode } from '@/lib/postal'

export function HeroSearch() {
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
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Code postal ou département (ex: 75, Paris…)"
        className="flex-1 border border-gray-border rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:border-navy min-w-0"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="bg-red-civic text-white px-5 py-3 rounded-lg font-medium text-sm hover:bg-red-light transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
      >
        {loading ? '…' : 'Trouver →'}
      </button>
    </form>
  )
}
