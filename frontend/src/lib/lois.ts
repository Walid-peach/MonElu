/**
 * Display logic for the bill pages (#370, ADR-035).
 *
 * The status and stage tables mirror `data/reference/dossier_statuses.json` and
 * `dossier_stages.json` (from `api/lois_data.py`): the frontend imports nothing
 * from outside `frontend/` (#356), so `reference-data.test.ts` holds the copies
 * to the JSON. The parcours grouping is the website twin of the app's
 * `ParcoursSection` (`LoiModels.swift`): a display grouping of what the API
 * returned, in its `ordinal` order, with nothing recomputed.
 */
import type { LoiActe, LoiDetail } from '@/lib/api'

export const DOSSIER_STATUSES: ReadonlyArray<{ status: string; label: string }> = [
  { status: 'promulguee', label: 'Promulguée' },
  { status: 'conseil_constitutionnel', label: 'Devant le Conseil constitutionnel' },
  { status: 'rejetee', label: 'Rejetée' },
  { status: 'adoptee_definitivement', label: 'Adoptée définitivement' },
  { status: 'deposee', label: 'Déposée' },
  { status: 'en_commission', label: 'En commission' },
  { status: 'en_navette', label: 'En navette parlementaire' },
]

export const DOSSIER_STAGES: ReadonlyArray<{ code: string; step: string; label: string }> = [
  { code: 'AN1', step: 'an', label: '1re lecture' },
  { code: 'AN2', step: 'an', label: '2e lecture' },
  { code: 'ANNLEC', step: 'an', label: 'Nouvelle lecture' },
  { code: 'ANLUNI', step: 'an', label: 'Lecture unique' },
  { code: 'ANLDEF', step: 'an', label: 'Lecture définitive' },
  { code: 'SN1', step: 'senat', label: '1re lecture' },
  { code: 'SN2', step: 'senat', label: '2e lecture' },
  { code: 'SNNLEC', step: 'senat', label: 'Nouvelle lecture' },
  { code: 'CMP', step: 'cmp', label: 'Commission mixte paritaire' },
  { code: 'CC', step: 'loi', label: 'Conseil constitutionnel' },
  { code: 'PROM', step: 'loi', label: 'Promulgation' },
]

/** A status in words; an unknown value shows as sent. */
export function statusLabel(status: string | null | undefined): string | null {
  if (!status) return null
  return DOSSIER_STATUSES.find(s => s.status === status)?.label ?? status
}

const STEP_NAMES: Record<string, string> = {
  an: 'Assemblée nationale',
  senat: 'Sénat',
  cmp: 'Commission mixte paritaire',
  loi: 'Loi',
}

/** "Assemblée nationale · 1re lecture" for a top-level stage, or null when unknown. */
export function stageTitle(code: string): string | null {
  const stage = DOSSIER_STAGES.find(s => s.code === code)
  if (!stage) return null
  const step = STEP_NAMES[stage.step]
  return step && step !== stage.label ? `${step} · ${stage.label}` : stage.label
}

export type ParcoursRow =
  /** An undated grouping node ("Travaux des commissions"). */
  | { kind: 'group'; acte: LoiActe }
  /** A dated step; `repeats` holds the identical sibling steps folded into it. */
  | { kind: 'acte'; acte: LoiActe; repeats: LoiActe[] }

export type ParcoursSection = {
  /** The top-level stage, or null for actes listed before any stage. */
  stage: LoiActe | null
  rows: ParcoursRow[]
}

function hasVotes(acte: LoiActe): boolean {
  return acte.scrutins.length > 0 || acte.amendement_count + acte.article_count > 0
}

/** Same parent, step, wording, and no vote or outcome on either: only the date differs. */
function folds(acte: LoiActe, previous: LoiActe): boolean {
  return (
    acte.parent_uid === previous.parent_uid &&
    acte.code_acte === previous.code_acte &&
    acte.libelle === previous.libelle &&
    !hasVotes(acte) && !hasVotes(previous) &&
    !acte.statut_label && !previous.statut_label
  )
}

/** The parcours split into its top-level stages, in one pass over the flat array. */
export function parcoursSections(parcours: readonly LoiActe[]): ParcoursSection[] {
  const sections: ParcoursSection[] = []
  let current: ParcoursSection | null = null
  for (const acte of parcours) {
    if (acte.depth === 0) {
      current = { stage: acte, rows: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { stage: null, rows: [] }
      sections.push(current)
    }
    const last = current.rows[current.rows.length - 1]
    if (!acte.date_acte) current.rows.push({ kind: 'group', acte })
    else if (last?.kind === 'acte' && folds(acte, last.acte)) last.repeats.push(acte)
    else current.rows.push({ kind: 'acte', acte, repeats: [] })
  }
  return sections
}

/** "62 amendements et 13 articles votés", or null when none. */
export function collapsedVotesLabel(amendements: number, articles: number): string | null {
  const parts = [
    amendements > 0 ? `${amendements.toLocaleString('fr-FR')} amendement${amendements > 1 ? 's' : ''}` : null,
    articles > 0 ? `${articles.toLocaleString('fr-FR')} article${articles > 1 ? 's' : ''}` : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return `${parts.join(' et ')} ${amendements + articles > 1 ? 'votés' : 'voté'}`
}

/** Whether the bill has any headline scrutin to show yet. */
export function hasHeadlineScrutin(loi: Pick<LoiDetail, 'parcours' | 'unattached_scrutins'>): boolean {
  return loi.unattached_scrutins.length > 0 || loi.parcours.some(a => a.scrutins.length > 0)
}
