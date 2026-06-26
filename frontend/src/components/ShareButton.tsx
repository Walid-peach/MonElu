'use client'
import { useState } from 'react'

interface ShareButtonProps {
  url: string
  title: string
  text?: string
  ariaLabel?: string
}

export function ShareButton({ url, title, text, ariaLabel }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const fullUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${url}`
      : url

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url: fullUrl, title, text })
        return
      } catch (err) {
        // User cancelled the share sheet: respect that, don't copy instead.
        if (err instanceof Error && err.name === 'AbortError') return
        // API genuinely unavailable - fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard also unavailable — silent fail
    }
  }

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); handleShare() }}
      className="flex items-center gap-1.5 text-xs text-gray-mid hover:text-navy transition-colors px-2.5 py-1.5 rounded border border-gray-border bg-white shrink-0"
      aria-label={ariaLabel ?? 'Partager ce vote'}
    >
      {copied ? (
        <span className="text-emerald-700 font-medium">Copié !</span>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>Partager</span>
        </>
      )}
    </button>
  )
}
