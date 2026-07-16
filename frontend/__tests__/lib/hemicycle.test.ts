import {
  layoutSeats,
  groupArcs,
  ringDistribution,
  groupRank,
  normalizeSeatPosition,
  HEMICYCLE_VIEWBOX,
  NON_INSCRIT,
  type HemicycleDeputy,
} from '@/lib/hemicycle'

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

describe('normalizeSeatPosition', () => {
  it('passes through the four recorded positions', () => {
    for (const p of ['pour', 'contre', 'abstention', 'nonVotant']) {
      expect(normalizeSeatPosition(p)).toBe(p)
    }
  })
  it('maps null and unknown values to absent', () => {
    expect(normalizeSeatPosition(null)).toBe('absent')
    expect(normalizeSeatPosition('autre')).toBe('absent')
  })
})

describe('groupRank', () => {
  it('orders left-wing groups before right-wing groups', () => {
    expect(groupRank('LFI')).toBeLessThan(groupRank('SOC'))
    expect(groupRank('SOC')).toBeLessThan(groupRank('EPR'))
    expect(groupRank('EPR')).toBeLessThan(groupRank('RN'))
  })
  it('sends NI, null, and unknown groups to the end', () => {
    expect(groupRank('NI')).toBeGreaterThan(groupRank('RN'))
    expect(groupRank(null)).toBe(groupRank('NI'))
    expect(groupRank('XYZ')).toBe(groupRank('NI'))
  })
})

describe('ringDistribution', () => {
  it('sums exactly to the total', () => {
    for (const total of [1, 57, 289, 577]) {
      const counts = ringDistribution(total, 11)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total)
    }
  })
  it('puts more seats on outer rings', () => {
    const counts = ringDistribution(577, 11)
    expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]!)
  })
  it('returns empty for zero seats', () => {
    expect(ringDistribution(0, 11)).toEqual([])
  })
})

describe('layoutSeats', () => {
  const deputies = makeDeputies([
    ['LFI', 'contre', 70],
    ['RN', 'pour', 120],
    ['EPR', 'pour', 90],
    ['SOC', 'abstention', 60],
    [null, 'nonVotant', 5],
  ])

  it('produces one seat per deputy', () => {
    expect(layoutSeats(deputies)).toHaveLength(deputies.length)
  })

  it('keeps every seat inside the viewBox', () => {
    for (const s of layoutSeats(deputies)) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(HEMICYCLE_VIEWBOX.width)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(HEMICYCLE_VIEWBOX.height)
    }
  })

  it('seats LFI on the left and RN on the right', () => {
    const seats = layoutSeats(deputies)
    const avgX = (party: string | null) => {
      const xs = seats.filter(s => s.deputy.party === party).map(s => s.x)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(avgX('LFI')).toBeLessThan(avgX('SOC'))
    expect(avgX('SOC')).toBeLessThan(avgX('EPR'))
    expect(avgX('EPR')).toBeLessThan(avgX('RN'))
  })

  it('is deterministic', () => {
    expect(layoutSeats(deputies)).toEqual(layoutSeats(deputies))
  })

  it('handles the empty vote', () => {
    expect(layoutSeats([])).toEqual([])
  })
})

describe('groupArcs', () => {
  const deputies = makeDeputies([
    ['LFI', 'contre', 30],
    ['RN', 'pour', 60],
    [null, 'pour', 10],
  ])

  it('spans exactly the half circle, left to right in group order', () => {
    const arcs = groupArcs(deputies)
    expect(arcs.map(a => a.group)).toEqual(['LFI', 'RN', NON_INSCRIT])
    expect(arcs[0]!.startAngle).toBeCloseTo(Math.PI)
    expect(arcs[arcs.length - 1]!.endAngle).toBeCloseTo(0)
    for (let i = 1; i < arcs.length; i++) {
      expect(arcs[i]!.startAngle).toBeCloseTo(arcs[i - 1]!.endAngle)
    }
  })

  it('sizes each arc proportionally and counts positions', () => {
    const arcs = groupArcs(deputies)
    const rn = arcs.find(a => a.group === 'RN')!
    expect(rn.seatCount).toBe(60)
    expect(rn.startAngle - rn.endAngle).toBeCloseTo(Math.PI * 0.6)
    expect(rn.counts.pour).toBe(60)
    expect(rn.counts.contre).toBe(0)
  })

  it('returns empty for the empty vote', () => {
    expect(groupArcs([])).toEqual([])
  })
})
