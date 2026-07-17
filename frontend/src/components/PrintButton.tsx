'use client'

type Props = {
  label?: string
}

export function PrintButton({ label = 'Imprimer / Enregistrer en PDF' }: Props) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-print-hide
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#E0786E', color: '#fff', padding: '12px 24px',
        borderRadius: 9, fontWeight: 600, fontSize: 15, border: 'none',
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(224,120,110,0.35)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
      </svg>
      {label}
    </button>
  )
}
