'use client'
import { useState, useId } from 'react'

type Props = {
  text: string
  ariaLabel?: string
}

const NAVY = '#1B2B50'

export function InfoTooltip({ text, ariaLabel = 'Plus d’informations' }: Props) {
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
            position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-50%)',
            width: 260, padding: '10px 12px', borderRadius: 8, background: NAVY, color: '#fff',
            fontSize: 12.5, lineHeight: 1.5, boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            zIndex: 10,
          }}
        >
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: `6px solid ${NAVY}`,
          }} />
        </span>
      )}
    </span>
  )
}
