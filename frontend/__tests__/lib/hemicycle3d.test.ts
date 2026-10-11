import { layoutSeats, type HemicycleDeputy } from '@/lib/hemicycle'
import { buildChamber, depthOf, floorAt, ringRadius, seatAngle } from '@/lib/hemicycle3d'

function makeDeputies(spec: Array<[party: string | null, position: string | null, count: number]>): HemicycleDeputy[] {
  const out: HemicycleDeputy[] = []
  let n = 0
  for (const [party, position, count] of spec) {
    for (let i = 0; i < count; i++) {
      out.push({ deputy_id: `PA${n}`, full_name: `Député ${String(n).padStart(3, '0')}`, party, position })
      n++
    }
  }
  return out
}

const FULL = makeDeputies([
  ['LFI', 'contre', 71],
  ['SOC', 'pour', 66],
  ['EPR', 'pour', 92],
  ['DR', 'abstention', 47],
  ['RN', 'contre', 123],
  [null, 'nonVotant', 9],
])

describe('buildChamber', () => {
  const seats = layoutSeats(FULL)
  const chamber = buildChamber(seats)

  it('builds one 3D seat per flat-chart seat, keeping its index, deputy and position', () => {
    expect(chamber.seats).toHaveLength(seats.length)
    chamber.seats.forEach((s, i) => {
      expect(s.index).toBe(i)
      expect(s.deputyId).toBe(seats[i]!.deputy.deputy_id)
      expect(s.position).toBe(seats[i]!.position)
    })
  })

  it('stands each seat on the same ring and at the same angle as the flat chart', () => {
    chamber.seats.forEach((s, i) => {
      const flat = seats[i]!
      const [x, y] = floorAt(ringRadius(flat.ring) + 1.6, seatAngle(flat))
      expect(s.top[0]).toBeCloseTo(x, 6)
      expect(s.top[1]).toBeCloseTo(y, 6)
    })
  })

  it('paints every seat exactly once', () => {
    const painted = chamber.layers.flatMap(l => (l.kind === 'seat' ? [l.seat] : []))
    expect(painted).toHaveLength(seats.length)
    expect(new Set(painted.map(s => s.index)).size).toBe(seats.length)
  })

  it('paints the nearer of two neighbouring rows last, on both arms of the chamber', () => {
    // with the chamber turned three-quarters, the outer row is the nearer one on the left arm
    // and the farther one across from the tribune; either way the nearer row must cover the other
    const order = new Map<number, number>()
    chamber.layers.forEach((l, i) => { if (l.kind === 'seat') order.set(l.seat.index, i) })
    let checked = 0
    for (const [left, right] of [[2.9, 3.05], [1.5, 1.64]] as const) {
      const inArc = chamber.seats.filter(s => {
        const a = seatAngle(seats[s.index]!)
        return a >= left && a <= right
      })
      for (const p of inArc) for (const q of inArc) {
        const rp = seats[p.index]!.ring, rq = seats[q.index]!.ring
        // only seats in the same angular column of neighbouring rows overlap on screen
        if (rq !== rp + 1 || Math.abs(seatAngle(seats[p.index]!) - seatAngle(seats[q.index]!)) > 0.012) continue
        const nearer = depthOf(p.top) > depthOf(q.top) ? p : q
        const farther = nearer === p ? q : p
        expect(order.get(nearer.index)!).toBeGreaterThan(order.get(farther.index)!)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('keeps every projected seat inside the viewBox, with room above for the falling votes', () => {
    for (const s of chamber.seats) {
      const [x, y] = chamber.project(s.top)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(chamber.width)
      expect(y).toBeLessThanOrEqual(chamber.height)
      const [, top] = chamber.project([s.top[0], s.top[1], s.top[2] + 70])
      expect(top).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic for the same deputies', () => {
    const again = buildChamber(layoutSeats(FULL))
    expect(again.height).toBe(chamber.height)
    expect(again.seats[100]!.solid.faces.map(f => f.d)).toEqual(chamber.seats[100]!.solid.faces.map(f => f.d))
  })

  it('handles a small vote', () => {
    const few = buildChamber(layoutSeats(makeDeputies([['RN', 'pour', 3]])))
    expect(few.seats).toHaveLength(3)
    expect(few.height).toBeGreaterThan(0)
  })
})
