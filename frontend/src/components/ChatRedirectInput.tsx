'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CHAT_SUGGESTIONS } from '@/lib/chat-suggestions'

export function ChatRedirectInput() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function submit(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={e => { e.preventDefault(); submit(value) }} className="flex gap-2">
        <label htmlFor="landing-ai-input" className="sr-only">
          Posez votre question sur l&apos;Assemblée Nationale
        </label>
        <input
          id="landing-ai-input"
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Posez votre question à votre tour…"
          className="flex-1 border border-gray-border rounded-xl px-4 py-3 text-sm bg-white focus:border-navy min-w-0"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="bg-navy text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-navy-light transition-colors disabled:opacity-40 shrink-0"
        >
          →
        </button>
      </form>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {CHAT_SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => submit(s)}
            className="text-xs border border-gray-border rounded-full px-3 py-1.5 bg-white text-navy hover:border-navy/40 hover:bg-gray-off transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
