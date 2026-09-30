/**
 * Golden fixture for the iOS app's hemicycle (#461, ADR-041 §4).
 *
 * The app lays out the hemicycle in Swift (`MonEluCore.Hemicycle`), a port of
 * `src/lib/hemicycle.ts`. Two implementations of one layout drift unless
 * something fails when they do, so this runs the real TypeScript over a fixed
 * set of deputies and records what it produces. A Swift test must reproduce
 * every seat and arc, and `__tests__/lib/hemicycle-fixture.test.ts` fails when
 * the committed file no longer matches this output.
 *
 * Regenerate after changing `hemicycle.ts`:
 *
 *     npm run export:hemicycle-fixture
 *
 * The deputies are synthetic and deterministic. The names are chosen to
 * exercise French collation (accents, case, particles, apostrophes, hyphens)
 * and repeat on purpose, so a tie in the sort is part of the contract too.
 */
import { groupArcs, layoutSeats, type HemicycleDeputy } from '../src/lib/hemicycle'

export const FIXTURE_PATH = [
  '..', 'ios', 'Packages', 'MonEluCore', 'Tests', 'MonEluCoreTests', 'Fixtures', 'hemicycle.json',
]

const GROUPS: Array<string | null> = [
  'LFI', 'GDR', 'ECS', 'SOC', 'LIOT', 'DEM', 'EPR', 'HOR', 'DR', 'UDR', 'RN',
  'NI', null, 'XYZ', // non-inscrit, unresolved, and a group the layout does not know
]
const POSITIONS: Array<string | null> = ['pour', 'contre', 'abstention', 'nonVotant', null, 'excusé']
const FIRST = [
  'Éric', 'Émilie', 'Zoé', 'André', 'Anne-Laure', 'Jean', 'jean', 'Noël',
  'Élodie', 'Inès', 'Ségolène', 'Loïc', 'Maël', 'Cécile', 'Agnès',
]
const LAST = [
  'Dupont', "d'Aubigny", 'de La Tour', 'Lefèvre', 'Le Gall', 'Müller', 'Zola', "N'Diaye",
  'Çelik', 'Abad', 'Élie', 'Étienne', "O'Neil", 'Martin-Dupré', 'Lefevre',
]

/** Park-Miller generator: the same sequence on every run, exact in doubles. */
function sequence(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 48271) % 2147483647
    return state
  }
}

function deputies(count: number, seed: number): HemicycleDeputy[] {
  const next = sequence(seed)
  return Array.from({ length: count }, (_, i) => ({
    deputy_id: `PA${1000 + i}`,
    full_name: `${FIRST[next() % FIRST.length]} ${LAST[next() % LAST.length]}`,
    party: GROUPS[next() % GROUPS.length] ?? null,
    position: POSITIONS[next() % POSITIONS.length] ?? null,
  }))
}

export interface HemicycleFixtureCase {
  name: string
  deputies: HemicycleDeputy[]
  seats: Array<{ deputy_id: string; position: string; x: number; y: number; ring: number }>
  arcs: ReturnType<typeof groupArcs>
}

export function buildHemicycleFixture(): { cases: HemicycleFixtureCase[] } {
  const inputs: Array<[string, HemicycleDeputy[]]> = [
    ['empty', []],
    ['single', deputies(1, 7)],
    ['small', deputies(7, 11)],
    ['medium', deputies(60, 23)],
    ['chamber', deputies(577, 41)],
  ]
  return {
    cases: inputs.map(([name, input]) => ({
      name,
      deputies: input,
      seats: layoutSeats(input).map(seat => ({
        deputy_id: seat.deputy.deputy_id,
        position: seat.position,
        x: seat.x,
        y: seat.y,
        ring: seat.ring,
      })),
      arcs: groupArcs(input),
    })),
  }
}

export function renderHemicycleFixture(): string {
  return JSON.stringify(buildHemicycleFixture(), null, 1) + '\n'
}
