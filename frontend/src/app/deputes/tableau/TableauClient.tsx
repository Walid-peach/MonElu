'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { csvUrl, type ScorecardRow } from '@/lib/api'
import { partyHex, partyShort } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'

type ScorecardList = { total: number; items: ScorecardRow[] }

const NAVY = '#1B2B50'
const CREAM = '#F7F4ED'
const LINE = '#E4E6EA'

type ColumnKey =
  | 'full_name'
  | 'party'
  | 'department'
  | 'total_votes'
  | 'presence_rate'
  | 'votes_for'
  | 'votes_against'
  | 'abstentions'
  | 'votes_for_pct'
  | 'solennel_participation_rate'
  | 'voting_days_rate'

const COLUMNS: Array<{ key: ColumnKey; label: string; numeric: boolean; title?: string }> = [
  { key: 'full_name', label: 'Député·e', numeric: false },
  { key: 'party', label: 'Groupe', numeric: false },
  { key: 'department', label: 'Département', numeric: false },
  { key: 'total_votes', label: 'Votes', numeric: true, title: 'Scrutins où le député pouvait voter' },
  { key: 'presence_rate', label: 'Présence', numeric: true, title: 'Part des scrutins avec une position exprimée ou une abstention' },
  { key: 'votes_for', label: 'Pour', numeric: true },
  { key: 'votes_against', label: 'Contre', numeric: true },
  { key: 'abstentions', label: 'Abst.', numeric: true },
  { key: 'votes_for_pct', label: '% Pour', numeric: true, title: 'Votes pour / votes exprimés' },
  { key: 'solennel_participation_rate', label: 'Solennels', numeric: true, title: 'Participation aux scrutins solennels' },
  { key: 'voting_days_rate', label: 'Jours de vote', numeric: true, title: 'Jours de scrutin avec au moins un vote' },
]

const PCT_KEYS = new Set<ColumnKey>([
  'presence_rate',
  'votes_for_pct',
  'solennel_participation_rate',
  'voting_days_rate',
])

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function cellValue(row: ScorecardRow, key: ColumnKey): string | number | null {
  if (key === 'party') return row.party
  if (key === 'department') return row.department
  return row[key]
}

export function TableauClient({ initial }: { initial: ScorecardList }) {
  const [sortKey, setSortKey] = useState<ColumnKey>('full_name')
  const [sortAsc, setSortAsc] = useState(true)
  const [filter, setFilter] = useState('')

  function toggleSort(key: ColumnKey, numeric: boolean) {
    if (key === sortKey) {
      setSortAsc(a => !a)
    } else {
      setSortKey(key)
      // Numeric columns open descending (biggest first) — that is the question
      // a ranking answers; text columns open A→Z.
      setSortAsc(!numeric)
    }
  }

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? initial.items.filter(r =>
          r.full_name.toLowerCase().includes(q) ||
          (r.party?.toLowerCase().includes(q) ?? false) ||
          partyShort(r.party).toLowerCase().includes(q) ||
          (departmentLabel(r.department)?.toLowerCase().includes(q) ?? false) ||
          (r.department?.toLowerCase().includes(q) ?? false)
        )
      : [...initial.items]

    const dir = sortAsc ? 1 : -1
    return filtered.sort((a, b) => {
      const va = cellValue(a, sortKey)
      const vb = cellValue(b, sortKey)
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'fr') * dir
    })
  }, [initial.items, filter, sortKey, sortAsc])

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>

      {/* Header */}
      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8"
        style={{
          background: 'linear-gradient(180deg,#fff 0%,' + CREAM + ' 100%)',
          borderBottom: '1px solid #ECE7DC',
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{
            fontWeight: 700, fontSize: 12, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#C9302A', marginBottom: 16,
          }}>
            Mode chercheur
          </div>
          <h1 className="font-newsreader text-[clamp(30px,4vw,44px)]" style={{
            fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em', color: NAVY, margin: 0,
          }}>
            Tous les bilans de vote, <span style={{ color: '#C9302A' }}>en un tableau</span>.
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 16, lineHeight: 1.6, color: '#4B5563', maxWidth: 620 }}>
            Les {initial.total} scorecards des députés sur un seul écran. Cliquez sur une colonne
            pour trier, filtrez par nom, groupe ou département — ou emportez tout en CSV.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:items-center">
            <label htmlFor="tableau-filter" className="sr-only">Filtrer le tableau</label>
            <input
              id="tableau-filter"
              type="search"
              placeholder="Filtrer par nom, groupe ou département…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                flex: 1, maxWidth: 420, height: 46, padding: '0 16px',
                background: '#fff', border: '1px solid ' + LINE, borderRadius: 10,
                fontSize: 15, color: '#1F2937', outline: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a
                href={csvUrl.scorecard()}
                download
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: NAVY, color: '#fff', height: 46, padding: '0 20px',
                  borderRadius: 10, fontWeight: 600, fontSize: 14.5, textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Télécharger CSV
              </a>
              <Link
                href="/donnees"
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: '#fff', color: NAVY, height: 46, padding: '0 18px',
                  border: '1px solid ' + LINE, borderRadius: 10, fontWeight: 600,
                  fontSize: 14.5, textDecoration: 'none', whiteSpace: 'nowrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                Toutes les données →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-3 sm:px-14 pt-7 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 12px' }}>
            <span className="font-mono" style={{ fontSize: 13, color: '#6B7280' }}>
              {rows.length} député{rows.length !== 1 ? 's' : ''}
            </span>
            <Link href="/deputes" style={{ fontSize: 13.5, color: NAVY, fontWeight: 600, textDecoration: 'none' }}>
              ← Vue annuaire
            </Link>
          </div>

          <div style={{
            background: '#fff', border: '1px solid ' + LINE, borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflowX: 'auto',
          }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980, fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#FBFAF6', borderBottom: '1px solid ' + LINE }}>
                  {COLUMNS.map(col => {
                    const active = sortKey === col.key
                    return (
                      <th key={col.key} scope="col" style={{ padding: 0, textAlign: col.numeric ? 'right' : 'left' }}>
                        <button
                          onClick={() => toggleSort(col.key, col.numeric)}
                          title={col.title}
                          aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : undefined}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 5,
                            justifyContent: col.numeric ? 'flex-end' : 'flex-start',
                            padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
                            font: '600 11.5px/1 var(--font-body)', letterSpacing: '0.07em',
                            textTransform: 'uppercase', color: active ? NAVY : '#9CA3AF',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.label}
                          <span aria-hidden="true" style={{ fontSize: 10, opacity: active ? 1 : 0.35 }}>
                            {active ? (sortAsc ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.deputy_id}
                    style={{ borderBottom: '1px solid #F0F1F3' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FBFAF6')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <Link href={`/deputes/${r.deputy_id}`} style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>
                        {r.full_name}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }} title={r.party ?? undefined}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: partyHex(r.party) }} />
                        <span style={{ color: '#374151' }}>{partyShort(r.party)}</span>
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {departmentLabel(r.department) ?? r.department ?? '—'}
                    </td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{r.total_votes}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{formatPct(r.presence_rate)}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{r.votes_for}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{r.votes_against}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{r.abstentions}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{formatPct(r.votes_for_pct)}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{formatPct(r.solennel_participation_rate)}</td>
                    <td className="font-mono" style={{ padding: '9px 14px', textAlign: 'right', color: '#374151' }}>{formatPct(r.voting_days_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ margin: '14px 4px 0', fontSize: 12.5, color: '#9CA3AF', lineHeight: 1.6 }}>
            Données : Assemblée nationale (Licence Ouverte 2.0), via MonÉlu. La « présence » mesure
            la participation aux scrutins publics, pas la présence physique en séance — voir la{' '}
            <Link href="/methodologie" style={{ color: '#6B7280' }}>méthodologie</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
