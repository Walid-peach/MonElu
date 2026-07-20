'use client'
import { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  url: string
  title: string
  text?: string
  ariaLabel?: string
}

export function ShareButton({ url, title, text, ariaLabel }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  function fullUrl() {
    return typeof window !== 'undefined' ? `${window.location.origin}${url}` : url
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url: fullUrl(), title, text })
        return
      } catch (err) {
        // User cancelled the share sheet: respect that, don't fall back.
        if (err instanceof Error && err.name === 'AbortError') return
        // API genuinely unavailable — fall through to the desktop menu.
      }
    }
    setMenuOpen(open => !open)
  }

  const shareUrl = fullUrl()
  const shareText = text ?? title
  const socialLinks = [
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'Bluesky',
      href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
  ]

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); handleShare() }}
        className="flex items-center gap-1.5 text-xs text-gray-mid hover:text-navy transition-colors px-2.5 py-1.5 rounded border border-gray-border bg-white shrink-0"
        aria-label={ariaLabel ?? 'Partager'}
        aria-expanded={menuOpen}
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

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
            background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 160,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <button
            role="menuitem"
            onClick={e => { e.preventDefault(); e.stopPropagation(); copyLink(); setMenuOpen(false) }}
            style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 13, color: '#1B2B50', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Copier le lien
          </button>
          {socialLinks.map(social => (
            <a
              key={social.label}
              role="menuitem"
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, fontSize: 13, color: '#1B2B50', textDecoration: 'none' }}
            >
              Partager sur {social.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
