import { SITE_URL } from './site'

/**
 * Reporting a share snapshot (#707, App Review Guideline 1.2).
 *
 * `/chat/s/[id]`, `/verifier/v/[id]` and `/quiz/s/[id]` are public pages built
 * from what a visitor typed (ADR-036). Each one links to `/contact` with its
 * kind and id, and `/contact` turns that back into the page's full URL, so a
 * report names the page without the reporter copying it.
 *
 * The parameter is read in the browser and printed on the contact page, so it
 * is parsed strictly: a known kind and a UUID (the ids the API issues), or
 * nothing at all.
 */

export const REPORT_SECTION_ID = 'signaler-un-contenu'
export const REPORT_PARAM = 'signaler'

const SNAPSHOT_PATHS = {
  chat: '/chat/s/',
  verifier: '/verifier/v/',
  quiz: '/quiz/s/',
} as const

export type SnapshotKind = keyof typeof SNAPSHOT_PATHS

const SNAPSHOT_KINDS = Object.keys(SNAPSHOT_PATHS) as SnapshotKind[]

const SNAPSHOT_LABELS: Record<SnapshotKind, string> = {
  chat: 'une réponse partagée',
  verifier: 'un verdict partagé',
  quiz: 'un résultat de quiz partagé',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function reportHref(kind: SnapshotKind, id: string): string {
  return `/contact?${REPORT_PARAM}=${kind}-${encodeURIComponent(id)}#${REPORT_SECTION_ID}`
}

export interface ReportTarget {
  kind: SnapshotKind
  label: string
  url: string
}

export function parseReportTarget(value: string | null | undefined): ReportTarget | null {
  if (!value) return null
  const dash = value.indexOf('-')
  if (dash < 1) return null
  const kind = value.slice(0, dash)
  const id = value.slice(dash + 1)
  if (!(SNAPSHOT_KINDS as readonly string[]).includes(kind) || !UUID.test(id)) return null
  const k = kind as SnapshotKind
  return { kind: k, label: SNAPSHOT_LABELS[k], url: `${SITE_URL}${SNAPSHOT_PATHS[k]}${id.toLowerCase()}` }
}
