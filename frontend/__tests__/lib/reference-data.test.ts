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
import { THEME_ENTRIES } from '@/lib/themes'
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
    expect(GROUP_ENTRIES).toEqual(read('groups.json'))
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
})
