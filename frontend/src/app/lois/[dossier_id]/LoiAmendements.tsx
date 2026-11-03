'use client'

import { useState } from 'react'
import { API_BASE } from '@/lib/api'
import type { LoiAmendementsResponse, LoiScrutin } from '@/lib/api'
import { LoiScrutinCard } from './LoiScrutinCard'

type State =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'open'; items: LoiScrutin[] }
  | { kind: 'error' }

/**
 * An acte's amendment and article votes, never inline by default (ADR-035 §4):
 * one bill counts 395 of them. The count is the button; the list loads on demand.
 */
export function LoiAmendements({
  dossierUid,
  acteUid,
  label,
}: {
  dossierUid: string
  acteUid: string | null
  label: string
}) {
  const [state, setState] = useState<State>({ kind: 'closed' })

  async function toggle() {
    if (state.kind === 'open') return setState({ kind: 'closed' })
    setState({ kind: 'loading' })
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (acteUid) params.set('acte_uid', acteUid)
      const res = await fetch(`${API_BASE}/lois/${encodeURIComponent(dossierUid)}/amendements?${params}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as LoiAmendementsResponse
      // With no acte, the list is the votes no séance acte precedes (`acte_uid` null).
      setState({ kind: 'open', items: acteUid ? data.items : data.items.filter(s => !s.acte_uid) })
    } catch {
      setState({ kind: 'error' })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={state.kind === 'open'}
        className="self-start text-left text-[13.5px] font-semibold text-[color:var(--dp-red)] underline-offset-2 hover:underline"
      >
        {state.kind === 'open' ? `Masquer les ${label}` : `Voir les ${label}`}
        {state.kind === 'loading' && ' …'}
      </button>
      {state.kind === 'error' && (
        <p className="text-[13px] text-[color:var(--dp-text-secondary)]">
          Impossible de charger ces votes pour le moment.
        </p>
      )}
      {state.kind === 'open' && (
        <ul className="flex flex-col gap-2">
          {state.items.map(s => (
            <li key={s.vote_id}>
              <LoiScrutinCard scrutin={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
