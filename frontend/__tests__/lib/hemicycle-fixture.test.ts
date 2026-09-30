/**
 * The hemicycle golden fixture the iOS app is tested against (#461).
 *
 * `scripts/hemicycle-fixture.ts` runs the real `hemicycle.ts` over a fixed set
 * of deputies; the result is committed in the iOS test folder, read here at
 * test time only (the frontend imports nothing from outside `frontend/`, #356).
 * Changing the layout without regenerating the fixture fails this test, and
 * regenerating it makes the Swift test prove the port still matches.
 *
 * `npm run export:hemicycle-fixture` runs this file with
 * UPDATE_HEMICYCLE_FIXTURE=1, which writes the fixture instead of checking it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIXTURE_PATH, buildHemicycleFixture, renderHemicycleFixture } from '../../scripts/hemicycle-fixture'

const FIXTURE = join(__dirname, '..', '..', ...FIXTURE_PATH)
const UPDATE = process.env.UPDATE_HEMICYCLE_FIXTURE === '1'

describe('hemicycle golden fixture', () => {
  it(UPDATE ? 'writes the fixture' : 'matches what hemicycle.ts produces today', () => {
    if (UPDATE) {
      writeFileSync(FIXTURE, renderHemicycleFixture(), 'utf8')
      return
    }
    expect(existsSync(FIXTURE)).toBe(true)
    // A failure here means hemicycle.ts changed: run
    // `npm run export:hemicycle-fixture` and commit the result.
    expect(readFileSync(FIXTURE, 'utf8')).toBe(renderHemicycleFixture())
  })

  it('covers the cases the Swift port must reproduce', () => {
    const { cases } = buildHemicycleFixture()
    expect(cases.map(c => c.name)).toEqual(['empty', 'single', 'small', 'medium', 'chamber'])
    const chamber = cases[4]!
    expect(chamber.seats).toHaveLength(577)
    // Repeated names make the sort's tie-break part of the contract.
    const names = chamber.deputies.map(d => d.full_name)
    expect(new Set(names).size).toBeLessThan(names.length)
    // Every group kind is present: known, NI, unresolved and unknown.
    const parties = new Set(chamber.deputies.map(d => d.party))
    expect(parties.has('NI') && parties.has(null) && parties.has('XYZ') && parties.has('RN')).toBe(true)
    expect(chamber.arcs.some(a => a.group === 'Non inscrit')).toBe(true)
  })
})
