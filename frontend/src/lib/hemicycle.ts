// Hemicycle seat layout for vote detail pages (MON-104).
//
// Pure geometry + assignment logic, kept out of the React component so it can
// be unit-tested. Produces one seat per deputy, laid out on concentric arcs
// and grouped left-to-right by parliamentary group (real chamber ordering),
// matching the iconic Assemblée Nationale seat map.

export type SeatPosition = 'pour' | 'contre' | 'abstention' | 'nonVotant' | 'absent'

export interface HemicycleDeputy {
  deputy_id: string
  full_name: string
  /** Short group code (e.g. "LFI", "RN") or null when unresolved. */
  party: string | null
  /** Recorded position, or null when the deputy has no row on this scrutin. */
  position: string | null
}

export interface Seat {
  deputy: HemicycleDeputy
  position: SeatPosition
  /** SVG coordinates in the HEMICYCLE_VIEWBOX space. */
  x: number
  y: number
  /** 0-based ring index, innermost first (drives dot radius). */
  ring: number
}

export interface GroupArc {
  /** Display group name ("Non inscrit" for unresolved/NI deputies). */
  group: string
  seatCount: number
  counts: Record<SeatPosition, number>
  /** Start/end angle in radians, π (far left) → 0 (far right). */
  startAngle: number
  endAngle: number
}

// Left-to-right political ordering of the 17th legislature's groups, mirroring
// where each group actually sits in the chamber. Unknown or unresolved groups
// fall to the end, next to the non-inscrits.
const GROUP_ORDER = ['LFI', 'GDR', 'ECS', 'SOC', 'LIOT', 'DEM', 'EPR', 'HOR', 'DR', 'UDR', 'RN']

export const NON_INSCRIT = 'Non inscrit'

export function groupRank(party: string | null): number {
  if (!party || party === 'NI') return GROUP_ORDER.length
  const idx = GROUP_ORDER.indexOf(party)
  return idx === -1 ? GROUP_ORDER.length : idx
}

export function normalizeSeatPosition(position: string | null): SeatPosition {
  switch (position) {
    case 'pour':
    case 'contre':
    case 'abstention':
    case 'nonVotant':
      return position
    default:
      return 'absent'
  }
}

// ViewBox of the generated SVG: a half-disc opening upward, centered at the
// bottom middle. Width 1000 gives comfortable integer-ish coordinates.
export const HEMICYCLE_VIEWBOX = { width: 1000, height: 520 }
const CX = HEMICYCLE_VIEWBOX.width / 2
const CY = HEMICYCLE_VIEWBOX.height - 10
const R_MIN = 210
const R_MAX = 490

/**
 * Distribute `total` seats across concentric rings so that seat spacing along
 * each arc stays roughly constant (outer rings hold more seats). Returns the
 * per-ring seat counts, summing exactly to `total`.
 */
export function ringDistribution(total: number, rings: number): number[] {
  if (total <= 0) return []
  const radii = Array.from({ length: rings }, (_, i) =>
    R_MIN + ((R_MAX - R_MIN) * i) / Math.max(1, rings - 1)
  )
  const radiusSum = radii.reduce((a, b) => a + b, 0)
  const counts = radii.map(r => Math.floor((total * r) / radiusSum))
  let remainder = total - counts.reduce((a, b) => a + b, 0)
  // Hand out the rounding remainder outermost-first, where spacing is loosest.
  for (let i = rings - 1; remainder > 0; i = (i - 1 + rings) % rings) {
    counts[i]!++
    remainder--
  }
  return counts
}

/**
 * Lay out one seat per deputy on a half-disc hemicycle.
 *
 * Deputies are sorted by group (left → right political ordering, then by name
 * for stability) and assigned to seats sorted by angle, so each group occupies
 * a contiguous angular wedge across all rings - the classic parliament chart.
 */
export function layoutSeats(deputies: HemicycleDeputy[]): Seat[] {
  const total = deputies.length
  if (total === 0) return []

  // Ring count grows with seat count; 11 rings comfortably holds 577.
  const rings = Math.max(3, Math.min(11, Math.ceil(Math.sqrt(total) * 0.46)))
  const perRing = ringDistribution(total, rings)

  // Generate raw slots: angle runs π (left) → 0 (right).
  const slots: { x: number; y: number; angle: number; ring: number }[] = []
  perRing.forEach((count, ring) => {
    const r = R_MIN + ((R_MAX - R_MIN) * ring) / Math.max(1, rings - 1)
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      const angle = Math.PI * (1 - t)
      slots.push({
        x: CX + Math.cos(angle) * r,
        y: CY - Math.sin(angle) * r,
        angle,
        ring,
      })
    }
  })
  // Angle descending = left → right; tie-break inner rings first.
  slots.sort((a, b) => b.angle - a.angle || a.ring - b.ring)

  const ordered = [...deputies].sort(
    (a, b) =>
      groupRank(a.party) - groupRank(b.party) || a.full_name.localeCompare(b.full_name, 'fr')
  )

  return ordered.map((deputy, i) => {
    const slot = slots[i]!
    return {
      deputy,
      position: normalizeSeatPosition(deputy.position),
      x: Math.round(slot.x * 10) / 10,
      y: Math.round(slot.y * 10) / 10,
      ring: slot.ring,
    }
  })
}

/**
 * Aggregate seats into contiguous group arcs (for the collapsed small-screen
 * view): each group gets an angular wedge proportional to its seat count,
 * π (left) → 0 (right), in the same order as the dot layout.
 */
export function groupArcs(deputies: HemicycleDeputy[]): GroupArc[] {
  const total = deputies.length
  if (total === 0) return []

  const byGroup = new Map<string, { rank: number; members: HemicycleDeputy[] }>()
  for (const d of deputies) {
    const name = d.party && d.party !== 'NI' && groupRank(d.party) < GROUP_ORDER.length ? d.party : NON_INSCRIT
    const entry = byGroup.get(name) ?? { rank: groupRank(d.party), members: [] }
    entry.rank = Math.min(entry.rank, groupRank(d.party))
    entry.members.push(d)
    byGroup.set(name, entry)
  }

  const groups = [...byGroup.entries()].sort((a, b) => a[1].rank - b[1].rank)
  const arcs: GroupArc[] = []
  let cursor = Math.PI
  for (const [group, { members }] of groups) {
    const span = (Math.PI * members.length) / total
    const counts: Record<SeatPosition, number> = {
      pour: 0,
      contre: 0,
      abstention: 0,
      nonVotant: 0,
      absent: 0,
    }
    for (const m of members) counts[normalizeSeatPosition(m.position)]++
    arcs.push({
      group,
      seatCount: members.length,
      counts,
      startAngle: cursor,
      endAngle: cursor - span,
    })
    cursor -= span
  }
  return arcs
}

export const HEMICYCLE_CENTER = { cx: CX, cy: CY, rMin: R_MIN, rMax: R_MAX }
