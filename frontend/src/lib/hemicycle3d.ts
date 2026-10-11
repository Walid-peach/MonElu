// Isometric 3D chamber for the vote replay (HemicycleReplay).
//
// Pure geometry, no React, so it can be unit-tested. Seats come from
// layoutSeats() in ./hemicycle: seat n here is seat n there - same deputy,
// same ring, same angle - so the 3D replay and the flat chart always agree
// on who sits where. Only the projection differs: the flat chart draws the
// rings as a half disc, this module stands them up as stepped tiers seen in
// three-quarter view, facing the perchoir and the tribune.
//
// The look (solid prisms, tones by facing, one projection for every part)
// follows the Anatomy figure kit used for docs/figures/hemicycle.

import { HEMICYCLE_CENTER, type Seat, type SeatPosition } from './hemicycle'

export type Point3 = [number, number, number]
export type Point2 = [number, number]

export interface Face {
  d: string
  /** 'top' for horizontal faces, otherwise a side shade 0 (darkest) to 3 (lightest). */
  tone: 'top' | 0 | 1 | 2 | 3
}

export interface Solid {
  faces: Face[]
  /** Painter's order key: larger is nearer the viewer. */
  depth: number
}

export interface Seat3D {
  index: number
  position: SeatPosition
  deputyId: string
  /** Where the seat's top face is, in world units - the vote lands here. */
  top: Point3
  solid: Solid
}

/** One thing to paint: a static solid, or a seat. */
export type Layer = { kind: 'solid'; solid: Solid } | { kind: 'seat'; seat: Seat3D }

export interface Chamber {
  width: number
  height: number
  /** Everything, in painter's order: plinth and wall, then each ring's tiers followed by its seats (outer ring first), then the floor and the tribune. */
  layers: Layer[]
  /** Seats by layoutSeats index. */
  seats: Seat3D[]
  project: (p: Point3) => Point2
}

// ---------------------------------------------------------------- camera

const AZIMUTH = (62 * Math.PI) / 180
const ELEVATION = (36 * Math.PI) / 180
const VIEW: Point3 = [Math.cos(AZIMUTH) * Math.cos(ELEVATION), Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION)]
const SCREEN_RIGHT: Point3 = [-Math.sin(AZIMUTH), Math.cos(AZIMUTH), 0]
const SCREEN_UP: Point3 = [
  -Math.cos(AZIMUTH) * Math.sin(ELEVATION),
  -Math.sin(AZIMUTH) * Math.sin(ELEVATION),
  Math.cos(ELEVATION),
]
const LIGHT: Point2 = [Math.cos(AZIMUTH + 0.9), Math.sin(AZIMUTH + 0.9)]

const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const depthOf = (p: Point3) => dot(p, VIEW)
const rawProject = (p: Point3): Point2 => [dot(p, SCREEN_RIGHT), -dot(p, SCREEN_UP)]

// ---------------------------------------------------------------- chamber frame

/** The chamber's axis is turned 30° off the line of sight for a three-quarter view. */
const YAW = (30 * Math.PI) / 180
const TOWARD_VIEWER: Point2 = [Math.cos(AZIMUTH), Math.sin(AZIMUTH)]
const BACK: Point2 = [
  -(TOWARD_VIEWER[0] * Math.cos(YAW) - TOWARD_VIEWER[1] * Math.sin(YAW)),
  -(TOWARD_VIEWER[0] * Math.sin(YAW) + TOWARD_VIEWER[1] * Math.cos(YAW)),
]
/** "Right" as the viewer sees it: the perpendicular of BACK that moves right on screen. */
const RIGHT: Point2 = (() => {
  const side: Point2 = [-BACK[1], BACK[0]]
  return rawProject([side[0], side[1], 0])[0] > 0 ? side : [BACK[1], -BACK[0]]
})()

/** Floor position at radius r and angle a (π = viewer's left, 0 = right, π/2 = across from the tribune). */
export function floorAt(r: number, a: number): Point2 {
  return [
    RIGHT[0] * Math.cos(a) * r + BACK[0] * Math.sin(a) * r,
    RIGHT[1] * Math.cos(a) * r + BACK[1] * Math.sin(a) * r,
  ]
}

const R0 = 66 // innermost seat ring
const ROW_D = 10 // depth of one row
const STEP_H = 3.6 // each ring one step higher
const FLOOR_Z = 2
const ARC: Point2 = [-0.05, Math.PI + 0.05]
const AISLES = [1, 2, 3, 4, 5, 6].map(i => (Math.PI * i) / 7)
const AISLE_W = 0.05

export const ringRadius = (ring: number) => R0 + ring * ROW_D
export const ringTop = (ring: number) => FLOOR_Z + (ring + 1) * STEP_H

// ---------------------------------------------------------------- solids

/** A prism: a floor outline extruded from z to z + h, with its visible faces toned by facing. */
export function prism(ring: Point2[], z: number, h: number, project: (p: Point3) => Point2): Solid {
  const path = (pts: Point3[]) => 'M' + pts.map(p => project(p).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z'
  // orient the outline counter-clockwise so outward normals point out
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]!
    const [x1, y1] = ring[(i + 1) % ring.length]!
    area += x0 * y1 - x1 * y0
  }
  const pts = area < 0 ? [...ring].reverse() : ring
  const faces: Face[] = []
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[(i + 1) % pts.length]!
    const nx = y1 - y0
    const ny = x0 - x1
    const len = Math.hypot(nx, ny) || 1
    if ((nx * VIEW[0] + ny * VIEW[1]) / len <= 0) continue
    const lit = (nx * LIGHT[0] + ny * LIGHT[1]) / len // -1 .. 1
    const tone = Math.max(0, Math.min(3, Math.round((lit + 1) * 1.5))) as 0 | 1 | 2 | 3
    faces.push({ d: path([[x0, y0, z], [x1, y1, z], [x1, y1, z + h], [x0, y0, z + h]]), tone })
  }
  faces.push({ d: path(pts.map(([x, y]) => [x, y, z + h])), tone: 'top' })
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return { faces, depth: depthOf([cx, cy, z]) }
}

function sector(r0: number, r1: number, a0: number, a1: number, steps = 10): Point2[] {
  const out: Point2[] = []
  for (let s = 0; s <= steps; s++) out.push(floorAt(r1, a0 + ((a1 - a0) * s) / steps))
  for (let s = steps; s >= 0; s--) out.push(floorAt(r0, a0 + ((a1 - a0) * s) / steps))
  return out
}

/** A w (along the row) by d (radial) rectangle at radius r and angle a, square to the centre. */
function facing(r: number, a: number, w: number, d: number): Point2[] {
  const [cx, cy] = floorAt(r, a)
  const [rx, ry] = floorAt(1, a)
  const tx = -ry
  const ty = rx
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [
    cx + (tx * u! * w) / 2 + (rx * v! * d) / 2,
    cy + (ty * u! * w) / 2 + (ry * v! * d) / 2,
  ])
}

// ---------------------------------------------------------------- layout

/** The angle a flat-chart seat sits at, π (left) to 0 (right). */
export function seatAngle(seat: Pick<Seat, 'x' | 'y'>): number {
  return Math.atan2(HEMICYCLE_CENTER.cy - seat.y, seat.x - HEMICYCLE_CENTER.cx)
}

export function buildChamber(seats: Seat[], { width = 680, pad = 16 } = {}): Chamber {
  const rings = seats.reduce((m, s) => Math.max(m, s.ring + 1), 1)
  const outer = ringRadius(rings - 1) + ROW_D / 2

  // the blocks between aisles, for tiers and desks
  const blocks: Point2[] = []
  {
    let from = ARC[0]
    for (const a of AISLES) {
      blocks.push([from, a - AISLE_W / 2])
      from = a + AISLE_W / 2
    }
    blocks.push([from, ARC[1]])
  }
  const front: Point2 = [-BACK[0], -BACK[1]]
  const plinth: Point2[] = []
  for (let s = 0; s <= 40; s++) plinth.push(floorAt(outer + 10, ARC[1] - ((ARC[1] - ARC[0]) * s) / 40))
  {
    const [rx, ry] = floorAt(outer + 10, ARC[0])
    const [lx, ly] = floorAt(outer + 10, ARC[1])
    plinth.push([rx + front[0] * 34, ry + front[1] * 34], [lx + front[0] * 34, ly + front[1] * 34])
  }

  // fit the drawing to the width: project every extreme point, then scale and offset
  const extremes: Point3[] = [
    ...plinth.map(([x, y]) => [x, y, -10] as Point3),
    ...plinth.map(([x, y]) => [x, y, 0] as Point3),
    ...[ARC[0], Math.PI / 2, ARC[1]].map(a => [...floorAt(outer + 3, a), ringTop(rings - 1) + 10 + 70] as Point3),
  ]
  const raw = extremes.map(rawProject)
  const minX = Math.min(...raw.map(p => p[0]))
  const maxX = Math.max(...raw.map(p => p[0]))
  const minY = Math.min(...raw.map(p => p[1]))
  const maxY = Math.max(...raw.map(p => p[1]))
  const scale = (width - pad * 2) / (maxX - minX)
  const height = Math.ceil((maxY - minY) * scale + pad * 2)
  const project = (p: Point3): Point2 => {
    const [x, y] = rawProject(p)
    return [(x - minX) * scale + pad, (y - minY) * scale + pad]
  }

  const layers: Layer[] = []
  const solid = (x: Solid) => layers.push({ kind: 'solid', solid: x })
  solid(prism(plinth, -10, 10, project))
  // the back wall behind the last ring
  for (const [a0, a1] of blocks) solid(prism(sector(outer, outer + 3, a0, a1), 0, ringTop(rings - 1) + 10, project))

  const seats3d: Seat3D[] = seats.map((s, index) => {
    const a = seatAngle(s)
    const r = ringRadius(s.ring) + 1.6
    const z = ringTop(s.ring)
    const [x, y] = floorAt(r, a)
    return {
      index,
      position: s.position,
      deputyId: s.deputy.deputy_id,
      top: [x, y, z + 3.4],
      solid: prism(facing(r, a, 3.4, 3.4), z, 3.4, project),
    }
  })

  // ring by ring, outer first: the ring's tier blocks (far to near), then the seats on its tread
  for (let ring = rings - 1; ring >= 0; ring--) {
    const r0 = ringRadius(ring) - ROW_D / 2
    const r1 = ringRadius(ring) + ROW_D / 2
    blocks
      .map(([a0, a1]) => {
        const tier = prism(sector(r0, r1, a0, a1), 0, ringTop(ring), project)
        const desk = prism(sector(r0 + 0.4, r0 + 2.2, a0 + 0.004, a1 - 0.004), ringTop(ring), 3.2, project)
        return { faces: [...tier.faces, ...desk.faces], depth: tier.depth }
      })
      .sort((p, q) => p.depth - q.depth)
      .forEach(solid)
    seats3d
      .filter(s => seats[s.index]!.ring === ring)
      .sort((p, q) => p.solid.depth - q.solid.depth)
      .forEach(seat => layers.push({ kind: 'seat', seat }))
  }

  // the floor in front of the first ring, then the perchoir and the tribune facing the tiers
  const floor: Point2[] = []
  for (let s = 0; s <= 32; s++) floor.push(floorAt(R0 - ROW_D / 2, ARC[0] + ((ARC[1] - ARC[0]) * s) / 32))
  floor.push([0, 0])
  solid(prism(floor, 0, FLOOR_Z, project))
  solid(prism(facing(-24, Math.PI / 2, 64, 30), 0, FLOOR_Z + 2, project))
  solid(prism(facing(-30, Math.PI / 2, 40, 12), FLOOR_Z + 2, 22, project))
  solid(prism(facing(-18, Math.PI / 2, 56, 10), FLOOR_Z + 2, 13, project))
  solid(prism(facing(-6, Math.PI / 2, 14, 8), FLOOR_Z + 2, 10, project))

  return { width, height, layers, seats: seats3d, project }
}
