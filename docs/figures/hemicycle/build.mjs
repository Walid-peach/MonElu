// L'hémicycle: the Assemblée nationale's chamber in isometric, 577 seats on 11 stepped rows
// facing the perchoir and the tribune. Seats are ordered left to right by angle, the same rule
// frontend/src/lib/hemicycle.ts uses, so a vote's positions can be dropped into the same seats.
//   node build.mjs [--light]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { f1, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- layout
const SEATS = 577;
const ROWS = 11;
const R0 = 66; // first row's seat radius
const ROW_D = 10; // row depth
const STEP_H = 3.6; // each row one step higher
const FLOOR_Z = 2;
const AISLES = 6; // radial stairs splitting the rows into 7 blocks
const AISLE_W = 0.05; // radians
const ARC = [-0.05, Math.PI + 0.05]; // the tiers run a little past a half circle
const rowR = (i) => R0 + i * ROW_D;
const rowZ = (i) => FLOOR_Z + (i + 1) * STEP_H;

const WIDTH = 680;
const HEIGHT = 440;
const AZ = 62;
const T = [Math.cos((AZ * Math.PI) / 180), Math.sin((AZ * Math.PI) / 180)]; // toward the viewer
// the chamber's axis is turned YAW away from the line of sight, for a three-quarter view
const YAW = (30 * Math.PI) / 180;
const BACK = [-(T[0] * Math.cos(YAW) - T[1] * Math.sin(YAW)), -(T[0] * Math.sin(YAW) + T[1] * Math.cos(YAW))];
const FRONT = [-BACK[0], -BACK[1]];
// "right" as the viewer sees it: the perpendicular of BACK whose screen x grows
const probe = k.fitProjection([[-1, -1, 0], [1, 1, 0]], 100, 100, { azimuth: AZ });
const side = [-BACK[1], BACK[0]];
const RIGHT = k.iso([side[0], side[1], 0], probe)[0] > k.iso([0, 0, 0], probe)[0] ? side : [BACK[1], -BACK[0]];
// angle a runs π (viewer's left) -> 0 (viewer's right); a = π/2 is straight across from the tribune
const at2 = (r, a) => [RIGHT[0] * Math.cos(a) * r + BACK[0] * Math.sin(a) * r, RIGHT[1] * Math.cos(a) * r + BACK[1] * Math.sin(a) * r];

const aisleAngles = Array.from({ length: AISLES }, (_, i) => Math.PI * ((i + 1) / (AISLES + 1)));
const blocks = [];
{
  let from = ARC[0];
  for (const a of aisleAngles) { blocks.push([from, a - AISLE_W / 2]); from = a + AISLE_W / 2; }
  blocks.push([from, ARC[1]]);
}

// seats per row in proportion to radius (as ringDistribution does), spread over each row's blocks
function rowCounts() {
  const radii = Array.from({ length: ROWS }, (_, i) => rowR(i));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((SEATS * r) / sum));
  let left = SEATS - counts.reduce((a, b) => a + b, 0);
  for (let i = ROWS - 1; left > 0; i = (i - 1 + ROWS) % ROWS) { counts[i]++; left--; }
  return counts;
}
const SEAT_LIST = [];
rowCounts().forEach((count, row) => {
  const usable = blocks.map(([a, b]) => [Math.max(a, 0.02), Math.min(b, Math.PI - 0.02)]);
  const total = usable.reduce((s, [a, b]) => s + (b - a), 0);
  let placed = 0;
  usable.forEach(([a, b], bi) => {
    const share = bi === usable.length - 1 ? count - placed : Math.round((count * (b - a)) / total);
    for (let j = 0; j < share; j++) {
      const ang = b - ((j + 0.5) / share) * (b - a); // left to right inside the block
      SEAT_LIST.push({ row, angle: ang });
    }
    placed += share;
  });
});
// left to right by angle, inner rows first on ties (layoutSeats' order)
SEAT_LIST.sort((p, q) => q.angle - p.angle || p.row - q.row);

// ---------------------------------------------------------------- camera
const OUTER = rowR(ROWS - 1) + ROW_D / 2 + 6;
// the plinth: a half disc around the tiers plus a forecourt for the tribune, in one convex outline
const PLINTH = [];
for (let s = 0; s <= 40; s++) PLINTH.push(at2(OUTER + 10, ARC[1] - ((ARC[1] - ARC[0]) * s) / 40));
{
  const [rx, ry] = at2(OUTER + 10, ARC[0]), [lx, ly] = at2(OUTER + 10, ARC[1]);
  PLINTH.push([rx + FRONT[0] * 56, ry + FRONT[1] * 56], [lx + FRONT[0] * 56, ly + FRONT[1] * 56]);
}
const fitPts = [];
for (let a = ARC[0]; a <= ARC[1]; a += 0.2) { const [x, y] = at2(OUTER, a); fitPts.push([x, y, rowZ(ROWS - 1) + 14]); }
for (const [x, y] of [at2(OUTER, 0), at2(OUTER, Math.PI)]) fitPts.push([x, y, -8]);
for (const [x, y] of PLINTH) fitPts.push([x, y, -10]);
const P = k.fitProjection(fitPts, WIDTH, HEIGHT, { pad: 20, azimuth: AZ, elevation: 38 });
const { at, S, L, D } = tools(P);
const depth2 = (x, y, z = 0) => k.depthOf([x, y, z], P);

// ---------------------------------------------------------------- parts
function sector(r0, r1, a0, a1, steps = 10) {
  const ring = [];
  for (let s = 0; s <= steps; s++) ring.push(at2(r1, a0 + ((a1 - a0) * s) / steps));
  for (let s = steps; s >= 0; s--) ring.push(at2(r0, a0 + ((a1 - a0) * s) / steps));
  return ring;
}
// a box of size w (along the row) x d (radial) standing at radius r, angle a, facing the centre
function seatRing(r, a, w, d) {
  const c = at2(r, a);
  const radial = [(at2(1, a)[0]), (at2(1, a)[1])];
  const tang = [-radial[1], radial[0]];
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [c[0] + tang[0] * u * w / 2 + radial[0] * v * d / 2, c[1] + tang[1] * u * w / 2 + radial[1] * v * d / 2]);
  return pts;
}

function floor() {
  const out = [];
  // the floor of the hemicycle, a half disc in front of the first row
  const disc = [];
  for (let s = 0; s <= 32; s++) disc.push(at2(R0 - ROW_D / 2, ARC[0] + ((ARC[1] - ARC[0]) * s) / 32));
  disc.push(at2(0, 0));
  out.push(S(k.extrude(disc, 0, FLOOR_Z, P, { convex: false }), { tone: "hi", crease: "lo" }));
  // floor pattern: three faint arcs
  for (const r of [24, 40, 54]) {
    const pts = [];
    for (let s = 0; s <= 24; s++) pts.push(at2(r, (Math.PI * s) / 24));
    out.push(L(k.onTop(pts, FLOOR_Z, P), { tone: "faint" }));
  }
  return out.join("");
}

function tiers() {
  // every (row, block) is one stepped solid; paint outer rows first, and within a row far to near
  const items = [];
  for (let i = ROWS - 1; i >= 0; i--) {
    const r0 = rowR(i) - ROW_D / 2, r1 = rowR(i) + ROW_D / 2;
    const row = [];
    blocks.forEach(([a0, a1]) => {
      const mid = (a0 + a1) / 2;
      const [mx, my] = at2(rowR(i), mid);
      const parts = [];
      parts.push(S(k.extrude(sector(r0, r1, a0, a1), 0, rowZ(i), P, { convex: false }), { tone: "mid" }));
      // the desk along the front of the row
      parts.push(S(k.extrude(sector(r0 + 0.4, r0 + 2.2, a0 + 0.004, a1 - 0.004), rowZ(i), 3.2, P, { convex: false }), { tone: "mid" }));
      row.push({ d: depth2(mx, my), svg: parts.join("") });
    });
    row.sort((p, q) => p.d - q.d).forEach((it) => items.push(it.svg));
    // the aisle stairs between blocks: a faint line down each aisle on this row's tread
    const lines = aisleAngles.map((a) => k.onTop([at2(r0, a), at2(r1, a)], rowZ(i) - STEP_H / 2, P)).join("");
    items.push(L(lines, { tone: "faint" }));
    // this row's seats, far to near
    const seats = SEAT_LIST.map((s, n) => ({ ...s, n })).filter((s) => s.row === i);
    seats.sort((p, q) => depth2(...at2(rowR(p.row), p.angle)) - depth2(...at2(rowR(q.row), q.angle)));
    for (const s of seats) {
      const ring = seatRing(rowR(i) + 1.6, s.angle, 3.4, 3.4);
      items.push(`<g class="hc-seat" data-seat="${s.n}">${S(k.extrude(ring, rowZ(i), 3.4, P), { tone: "hi", crease: "lo" })}</g>`);
    }
  }
  return items.join("");
}

function tribune() {
  const out = [];
  // the perchoir (the president's desk, highest) and in front of it the tribune for speakers
  const perch = seatRing(-30, Math.PI / 2, 40, 12);
  const bureau = seatRing(-18, Math.PI / 2, 56, 10);
  const trib = seatRing(-6, Math.PI / 2, 14, 8);
  out.push(S(k.extrude(seatRing(-24, Math.PI / 2, 64, 30), 0, FLOOR_Z + 2, P), { tone: "lo" }));
  out.push(S(k.extrude(perch, FLOOR_Z + 2, 22, P), { tone: "mid", className: "hc-perch" }));
  out.push(S(k.extrude(bureau, FLOOR_Z + 2, 13, P), { tone: "mid" }));
  out.push(S(k.extrude(trib, FLOOR_Z + 2, 10, P), { tone: "hi", crease: "lo" }));
  return out.join("");
}

function backWall() {
  // a low wall behind the last row, the outline of the chamber
  const r = rowR(ROWS - 1) + ROW_D / 2;
  const out = [];
  blocks.forEach(([a0, a1]) => out.push(S(k.extrude(sector(r, r + 3, a0, a1), 0, rowZ(ROWS - 1) + 10, P, { convex: false }), { tone: "mid" })));
  return out.join("");
}

// ---------------------------------------------------------------- the vote (DEMO DATA)
// Not a real scrutin. Seven blocks of seats, left to right, each with a majority position and a
// little dissent, so the drop can be judged before real per-deputy positions are wired in.
// To use a real vote: replace POSITIONS with GET /votes/{id}'s positions, ordered by group then
// name as frontend/src/lib/hemicycle.ts layoutSeats orders them (seat n = n-th deputy).
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rand = rng(2026);
const DEMO_BLOCKS = [[64, "contre"], [72, "contre"], [58, "pour"], [96, "pour"], [92, "pour"], [70, "abstention"], [125, "contre"]];
const POSITIONS = [];
for (const [size, main] of DEMO_BLOCKS) for (let i = 0; i < size; i++) {
  const r = rand();
  POSITIONS.push(r < 0.06 ? "absent" : r < 0.08 ? "nonVotant" : r < 0.13 ? (main === "pour" ? "contre" : "pour") : main);
}
while (POSITIONS.length < SEATS) POSITIONS.push("absent");
POSITIONS.length = SEATS;
const COUNT = (p) => POSITIONS.filter((x) => x === p).length;
// the order votes land in: shuffled, absents never land
const ORDER = POSITIONS.map((_, n) => n).filter((n) => POSITIONS[n] !== "absent").sort(() => rand() - 0.5);

const SEAT_XYZ = SEAT_LIST.map((s) => { const [x, y] = at2(rowR(s.row) + 1.6, s.angle); return [f1(x), f1(y), f1(rowZ(s.row) + 3.4)]; });

const DROP = 7.5; // seconds over which the votes come in
const FALL = 0.6;
const START = 0.8;
const END = START + DROP + FALL;
const LOOP = END + 3.6;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `L'hémicycle de l'Assemblée nationale : ${SEATS} sièges sur ${ROWS} rangs en gradins, face au perchoir et à la tribune. Démonstration : des votes tombent dans les sièges et les colorent, pour en vert, contre en rouge, abstention en ambre. Données fictives.`,
  body: [
    `<path class="iso-halo" d="${k.extrude(PLINTH, -10, 10, P).fill}"/>`,
    S(k.extrude(PLINTH, -10, 10, P, { bevel: 1.2 }), { tone: "mid" }),
    L(k.onTop(PLINTH.map(([x, y]) => [x * 0.985, y * 0.985]), 0, P, true), { tone: "faint" }),
    backWall(), tiers(), floor(), tribune(),
    `<g data-part="balls">${Array.from({ length: 80 }, () => `<circle class="hc-ball" r="${f1(1.9 * P.scale)}" cx="-99" cy="-99"/>`).join("")}</g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const XYZ = ${JSON.stringify(SEAT_XYZ)};
const POS = ${JSON.stringify(POSITIONS)};
const ORDER = ${JSON.stringify(ORDER)};
const START = ${START}, DROP = ${DROP}, FALL = ${FALL}, END = ${END};
const seats = [...document.querySelectorAll(".hc-seat")].sort((a, b) => a.dataset.seat - b.dataset.seat);
const pool = [...document.querySelectorAll(".hc-ball")];
const readout = document.querySelector("[data-readout]");
const landAt = new Array(XYZ.length).fill(Infinity);
ORDER.forEach((n, i) => (landAt[n] = START + (DROP * i) / ORDER.length + FALL));
const shown = new Array(XYZ.length).fill("");
function draw(t) {
  const counts = { pour: 0, contre: 0, abstention: 0, nonVotant: 0 };
  let ball = 0;
  for (let n = 0; n < XYZ.length; n++) {
    const L = landAt[n];
    let state = "";
    if (t >= L) { state = POS[n]; counts[POS[n]]++; }
    else if (t > L - FALL && ball < pool.length) {
      // falling under gravity from 70 units above the seat
      const u = (t - (L - FALL)) / FALL;
      const [x, y, z] = XYZ[n];
      const [sx, sy] = iso([x, y, z + 70 * (1 - u * u)], P);
      const el = pool[ball++];
      el.setAttribute("cx", sx.toFixed(1)); el.setAttribute("cy", sy.toFixed(1));
      if (el.dataset.pos !== POS[n]) el.dataset.pos = POS[n];
    }
    if (shown[n] !== state) { shown[n] = state; state ? seats[n].setAttribute("data-pos", state) : seats[n].removeAttribute("data-pos"); }
  }
  for (; ball < pool.length; ball++) if (pool[ball].getAttribute("cx") !== "-99") { pool[ball].setAttribute("cx", "-99"); pool[ball].setAttribute("cy", "-99"); }
  const text = "démo · pour " + counts.pour + " · contre " + counts.contre + " · abst. " + counts.abstention;
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: END, step: 0.5, rest: END })}
`;

const CSS = `
.hc-ball{stroke:var(--anatomy-paper);stroke-width:.6px;vector-effect:non-scaling-stroke}
.hc-ball[data-pos="pour"]{fill:var(--anatomy-green)}
.hc-ball[data-pos="contre"]{fill:var(--anatomy-red)}
.hc-ball[data-pos="abstention"]{fill:#d99a2b}
.hc-ball[data-pos="nonVotant"]{fill:var(--anatomy-mid)}
.hc-seat[data-pos="pour"] .iso-top{fill:var(--anatomy-green)}
.hc-seat[data-pos="pour"] .iso-shade{fill:color-mix(in srgb,var(--anatomy-green) 60%,var(--anatomy-paper))}
.hc-seat[data-pos="contre"] .iso-top{fill:var(--anatomy-red)}
.hc-seat[data-pos="contre"] .iso-shade{fill:color-mix(in srgb,var(--anatomy-red) 60%,var(--anatomy-paper))}
.hc-seat[data-pos="abstention"] .iso-top{fill:#d99a2b}
.hc-seat[data-pos="abstention"] .iso-shade{fill:color-mix(in srgb,#d99a2b 60%,var(--anatomy-paper))}
.hc-seat[data-pos="nonVotant"] .iso-top{fill:var(--anatomy-mid)}
`;

writePage({
  here: HERE,
  name: "hemicycle",
  title: "L'hémicycle · démo",
  fig: "Fig 9",
  hint: "Données de démonstration",
  readout: "démo · pour 0 · contre 0 · abst. 0",
  keys: [
    { mark: "green", label: "Pour" },
    { mark: "red", label: "Contre" },
    { mark: "raised", label: "Ambre : abstention · gris : non-votant · vide : absent" },
  ],
  caption: `Données de démonstration, pas un scrutin réel : les positions sont inventées pour juger l'effet. L'hémicycle du Palais Bourbon compte ${SEATS} sièges sur ${ROWS} rangs, face au perchoir et à la tribune ; chaque vote tombe dans un siège et le colore. Ici ${COUNT("pour")} pour, ${COUNT("contre")} contre, ${COUNT("abstention")} abstentions, ${COUNT("nonVotant")} non-votants et ${COUNT("absent")} absents, tous fictifs. La version publiable utilisera les positions réelles d'un scrutin, député par député, dans l'ordre de la carte des votes du site.`,
  svg,
  ariaLabel: "Hémicycle, démonstration : flèches gauche et droite pour faire avancer le vote",
  ariaValue: "Données de démonstration",
  live,
  css: CSS,
});
writeFileSync(join(HERE, "seats.json"), `${JSON.stringify(SEAT_LIST.map((s) => [s.row, f1(s.angle * 1000) / 1000]))}\n`);
