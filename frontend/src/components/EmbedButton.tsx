'use client'
import { useEffect, useRef, useState } from 'react'

interface EmbedButtonProps {
  path: string
  width?: number
  height?: number
}

export function EmbedButton({ path, width = 560, height = 220 }: EmbedButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const embedUrl = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
  const snippet = `<iframe src="${embedUrl}" width="${width}" height="${height}" style="border:1px solid #E4E6EA;border-radius:12px" loading="lazy" title="MonÉlu"></iframe>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1.5 text-xs text-gray-mid hover:text-navy transition-colors px-2.5 py-1.5 rounded border border-gray-border bg-white shrink-0"
        aria-label="Intégrer ce vote sur un autre site"
        aria-expanded={open}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
        <span>Intégrer</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
            background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14, width: 320,
          }}
        >
          <p style={{ fontSize: 12.5, color: '#4B5563', marginBottom: 8 }}>
            Collez ce code dans votre page pour afficher ce vote en direct.
          </p>
          <code style={{ display: 'block', fontSize: 11, color: '#1B2B50', background: '#F7F4ED', borderRadius: 6, padding: 8, wordBreak: 'break-all', marginBottom: 10 }}>
            {snippet}
          </code>
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); copySnippet() }}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              color: '#fff', background: '#1B2B50', border: 'none', cursor: 'pointer',
            }}
          >
            {copied ? 'Copié !' : 'Copier le code'}
          </button>
        </div>
      )}
    </div>
  )
}
