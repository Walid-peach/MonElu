'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { LoiListItem } from '@/lib/api'
import { DOSSIER_STATUSES, statusLabel } from '@/lib/lois'
import { formatDate } from '@/lib/utils'

/** The order the index groups bills in: settled first, then those still moving. */
const STATUS_ORDER = DOSSIER_STATUSES.map(s => s.status)

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${
        active
          ? 'border-[color:var(--dp-text)] bg-[color:var(--dp-text)] text-[color:var(--dp-page-bg)]'
          : 'border-[color:var(--dp-border)] text-[color:var(--dp-text-secondary)]'
      }`}
    >
      {children}
    </button>
  )
}

export function LoisIndexClient({ items }: { items: LoiListItem[] }) {
  const [status, setStatus] = useState<string | null>(null)
  const [theme, setTheme] = useState<string | null>(null)

  const statuses = STATUS_ORDER.filter(s => items.some(i => i.status === s))
  const themes = [...new Set(items.map(i => i.theme).filter((t): t is string => !!t))].sort()

  const groups = useMemo(() => {
    const shown = items.filter(i => (!status || i.status === status) && (!theme || i.theme === theme))
    const known = STATUS_ORDER.map(s => ({ status: s, items: shown.filter(i => i.status === s) }))
    const other = shown.filter(i => !i.status || !STATUS_ORDER.includes(i.status))
    return [...known, { status: null, items: other }].filter(g => g.items.length > 0)
  }, [items, status, theme])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          <Chip active={!status} onClick={() => setStatus(null)}>Tous les statuts</Chip>
          {statuses.map(s => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? null : s)}>
              {statusLabel(s)}
            </Chip>
          ))}
        </div>
        {themes.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par thème">
            <Chip active={!theme} onClick={() => setTheme(null)}>Tous les thèmes</Chip>
            {themes.map(t => (
              <Chip key={t} active={theme === t} onClick={() => setTheme(theme === t ? null : t)}>{t}</Chip>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 && (
        <p className="text-[14px] text-[color:var(--dp-text-secondary)]">Aucun texte ne correspond à ces filtres.</p>
      )}
      {groups.map(group => (
        <section key={group.status ?? 'autre'} className="flex flex-col gap-3">
          <h2 className="font-newsreader text-[24px] font-medium text-[color:var(--dp-text)]">
            {statusLabel(group.status) ?? 'Autres'} <span className="text-[16px] text-[color:var(--dp-text-muted)]">({group.items.length})</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {group.items.map(item => (
              <li key={item.dossier_uid}>
                <Link
                  href={`/lois/${item.dossier_uid}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-4"
                >
                  <span className="break-words text-[15.5px] font-semibold leading-snug text-[color:var(--dp-text)]">
                    {item.titre ?? item.dossier_uid}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
                    {item.theme && <span>{item.theme}</span>}
                    {item.last_scrutin_at && <span>Dernier vote le {formatDate(item.last_scrutin_at)}</span>}
                    <span>
                      {item.headline_scrutin_count} vote{item.headline_scrutin_count > 1 ? 's' : ''} sur le texte
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
