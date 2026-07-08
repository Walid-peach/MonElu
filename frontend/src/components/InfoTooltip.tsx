'use client'
import { useState, useId } from 'react'
import Link from 'next/link'

type Props = {
  text: string
  ariaLabel?: string
  href?: string
  /** Direction the bubble opens relative to the trigger. Use 'bottom' when the trigger
   *  sits near the top of a container with `overflow: hidden` (e.g. a table header). */
  placement?: 'top' | 'bottom'
  /** Horizontal anchor. Use 'right' when the trigger sits at the right edge of its
   *  container to avoid the bubble overflowing past it. */
  align?: 'center' | 'right'
}

const NAVY = '#1B2B50'

export function InfoTooltip({
  text,
  ariaLabel = 'Plus d’informations',
  href,
  placement = 'top',
  align = 'center',
}: Props) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => { e.preventDefault(); setOpen(o => !o) }}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 999, border: `1px solid #C7CDD8`,
          background: '#fff', color: '#6B7280', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', padding: 0, lineHeight: 1,
        }}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={tooltipId}
          style={{
            position: 'absolute',
            ...(placement === 'top' ? { bottom: '140%' } : { top: '140%' }),
            ...(align === 'center'
              ? { left: '50%', transform: 'translateX(-50%)' }
              : { right: 0 }),
            width: 260, padding: '10px 12px', borderRadius: 8, background: NAVY, color: '#fff',
            fontSize: 12.5, lineHeight: 1.5, boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            zIndex: 10,
          }}
        >
          {text}
          {href && (
            <Link
              href={href}
              style={{ display: 'block', marginTop: 6, color: '#8FB2FF', fontWeight: 600 }}
            >
              En savoir plus →
            </Link>
          )}
          <span style={{
            position: 'absolute',
            ...(placement === 'top'
              ? { top: '100%', borderTop: `6px solid ${NAVY}` }
              : { bottom: '100%', borderBottom: `6px solid ${NAVY}` }),
            ...(align === 'center' ? { left: '50%', transform: 'translateX(-50%)' } : { right: 8 }),
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          }} />
        </span>
      )}
    </span>
  )
}
