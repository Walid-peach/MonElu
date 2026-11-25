/**
 * The website's mirrored tables against `data/reference/*.json` (ADR-041 §4, #439).
 *
 * The JSON is the copy the iOS app bundles, generated from the API's own Python
 * maps. The website keeps its TypeScript copies because the frontend imports
 * nothing from outside `frontend/` (#356) - so the JSON is read here, at test
 * time only, and never reaches the bundle.
 *
 * Every key the JSON carries must resolve to the same name on the website.
 * The website's departments map may hold codes the JSON lacks; the reverse is
 * the bug this catches.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { departmentName } from '@/lib/departments'
import { GROUP_ENTRIES } from '@/lib/groups'
import { DOSSIER_STAGES, DOSSIER_STATUSES } from '@/lib/lois'
import { THEME_ENTRIES } from '@/lib/themes'
import { PARTY_SHORT_LABELS, SHORT_TO_FULL_PARTY } from '@/lib/utils'
import { POS } from '@/lib/vote-position'

const REFERENCE = join(__dirname, '..', '..', '..', 'data', 'reference')

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(REFERENCE, name), 'utf8')) as T
}

describe('reference data parity', () => {
  it('names every department code the way the API does', () => {
    const rows = read<Array<{ code: string; name: string }>>('departments.json')
    expect(rows.length).toBeGreaterThan(100)
    const mismatches = rows
      .filter(({ code, name }) => departmentName(code) !== name)
      .map(({ code, name }) => `${code}: API "${name}", website "${departmentName(code)}"`)
    expect(mismatches).toEqual([])
  })

  it('has the same twelve groups, in the same order', () => {
    const rows = read<Array<{ slug: string; name: string; short: string }>>('groups.json')
    expect(GROUP_ENTRIES).toEqual(rows.map(({ slug, name }) => ({ slug, name })))
  })

  it('abbreviates every group the way the API does (#726)', () => {
    const rows = read<Array<{ name: string; short: string }>>('groups.json')
    expect(PARTY_SHORT_LABELS).toEqual(Object.fromEntries(rows.map(({ name, short }) => [name, short])))
    const shortToName = Object.fromEntries(rows.map(({ name, short }) => [short, name]))
    for (const [short, name] of Object.entries(SHORT_TO_FULL_PARTY)) {
      expect([short, shortToName[short]]).toEqual([short, name])
    }
  })

  it('has the same ten themes, in the same order', () => {
    expect(THEME_ENTRIES).toEqual(read('themes.json'))
  })

  it('labels the four vote positions the same way', () => {
    const rows = read<Array<{ key: string; label: string }>>('vote_positions.json')
    expect(rows.map(({ key }) => key)).toEqual(Object.keys(POS))
    for (const { key, label } of rows) {
      expect(POS[key as keyof typeof POS].label).toBe(label)
    }
  })

  it('has the same bill statuses and reading stages as the API (#370)', () => {
    expect(DOSSIER_STATUSES).toEqual(read('dossier_statuses.json'))
    expect(DOSSIER_STAGES).toEqual(read('dossier_stages.json'))
  })
})
