// La machine à scrutin: one real scrutin counted as a ball-drop machine.
// Built with the Anatomy kit (github.com/wheresryan22/anatomy, MIT, vendored in ../_kit).
//   node build.mjs           -> ball-drop.html (dark)
//   node build.mjs --light   -> ball-drop-light.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const kitScript = () => readFileSync(join(HERE, "../_kit/iso-kit.mjs"), "utf8").replace(/^export /gm, "");

// ---------------------------------------------------------------- truth
// GET /votes/VTANR5L17V8434, recorded from the production API
// (ios/Packages/MonEluFeatures/Tests/MonEluFeaturesTests/Fixtures/vote_detail.json).
const VOTE = {
  id: "VTANR5L17V8434",
  date: "21 juillet 2026",
  title:
    "l'ensemble de la proposition de loi visant à moderniser la gestion du patrimoine immobilier de l'État (texte de la commission mixte paritaire)",
  pour: 276,
  contre: 86,
  abstention: 2,
  result: "adopté",
};
const SEATS = 577;
const CAST = VOTE.pour + VOTE.contre + VOTE.abstention; // 364 votants
const EXPRIMES = VOTE.pour + VOTE.contre; // abstentions are not suffrages exprimés
const MAJORITY = Math.floor(EXPRIMES / 2) + 1; // 182
const SILENT = SEATS - CAST; // 213: absents, non-votants, vacant seats

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 420;
const PLATE = { x: -166, y: -124, w: 314, d: 222, r: 9 };
const PLATE_H = 12;
const FOOT_H = 5;

// The rack: one hole per seat, a neutral grid (it is not the hemicycle).
const RACK_COLS = 29;
const RACK_ROWS = 20; // 580 places, the last 3 are solid
const RACK_GAP = 4.4;
const RACK = { x: -154, y: -112, w: RACK_COLS * RACK_GAP + 10, d: RACK_ROWS * RACK_GAP + 10, r: 4 };
const RACK_Z = 30;
const RACK_H = 6;
const RACK_TOP = RACK_Z + RACK_H;

// Counting trays: one column of 10 hollows = 10 voices.
const TRAY_GAP = 4.3;
const TRAY_Y = 14;
const TRAY_H = 6;
const COLUMN = 10;
const TRAY_D = COLUMN * TRAY_GAP + 9;
const trayCols = (n) => Math.max(1, Math.ceil(n / COLUMN));
const TRAYS = [];
{
  let x = -154;
  for (const [key, count] of [["pour", VOTE.pour], ["contre", VOTE.contre], ["abstention", VOTE.abstention]]) {
    const cols = trayCols(count);
    const plan = { x, y: TRAY_Y, w: cols * TRAY_GAP + 9, d: TRAY_D, r: 2.5 };
    TRAYS.push({ key, count, cols, plan });
    x += plan.w + 9;
  }
}

const BALL_R = 1.75;
const DIAL = [104, 36];
const DIAL_R = 28;
const DIAL_Z = 34;
const DIAL_H = 9;
const DIAL_TOP = DIAL_Z + DIAL_H;
const SWEEP = (Math.PI * 5) / 3; // 300° of scale
const SWEEP_FROM = -SWEEP / 2;
const LAMP = [108, -64];

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [RACK.x, RACK.y, RACK_TOP + 34], [-60, -40, RACK_TOP + 34],
    [DIAL[0] + DIAL_R, DIAL[1] - DIAL_R, DIAL_TOP + 2],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 56, elevation: 36 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const f1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- places
const rackHoles = [];
for (let row = 0; row < RACK_ROWS; row++)
  for (let col = 0; col < RACK_COLS; col++)
    rackHoles.push([RACK.x + 5 + RACK_GAP * (col + 0.5), RACK.y + 5 + RACK_GAP * (row + 0.5)]);
const seatHoles = rackHoles.slice(0, SEATS);
const solidHoles = rackHoles.slice(SEATS);

const trayHoles = (tray) => {
  const out = [];
  for (let col = 0; col < tray.cols; col++)
    for (let row = 0; row < COLUMN; row++)
      out.push([tray.plan.x + 4.5 + TRAY_GAP * (col + 0.5), tray.plan.y + 4.5 + TRAY_GAP * (row + 0.5)]);
  return out;
};

// Deterministic shuffle: which hole empties, and in which order the voices are counted.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const shuffle = (list, rand) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const rand = rng(8434);
const voices = shuffle(
  [...Array(VOTE.pour).fill(0), ...Array(VOTE.contre).fill(1), ...Array(VOTE.abstention).fill(2)],
  rand,
);
const seatOrder = shuffle(seatHoles.map((_, i) => i), rand);
const filled = [0, 0, 0];
const slots = TRAYS.map(trayHoles);
// BALLS[i] = [fromX, fromY, toX, toY, tray] for the i-th counted ball; seat i of seatOrder leaves.
const BALLS = voices.map((tray) => {
  const [tx, ty] = slots[tray][filled[tray]++];
  return { tray, to: [tx, ty] };
});
const leaving = seatOrder.slice(0, CAST);
const staying = seatOrder.slice(CAST);

// ---------------------------------------------------------------- art
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // label plate on the right front corner, with three rule lines of "printed text"
  const label = { x: 82, y: -112, w: 50, d: 15, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 5], [label.x + 34, label.y + 5], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 8], [label.x + 42, label.y + 8], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 11], [label.x + 24, label.y + 11], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.6, label.y + label.d / 2, 0.8]), at([label.x + label.w - 2.6, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

function rack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(RACK, 6), 0, 1, P)}" style="filter:blur(6px)"/>`];
  // two cheeks carry the rack plate, each on a foot block with two screws
  const cheeks = [
    { x: RACK.x + 8, y: RACK.y + 8, w: 8, d: RACK.d - 16, r: 1.5 },
    { x: RACK.x + RACK.w - 16, y: RACK.y + 8, w: 8, d: RACK.d - 16, r: 1.5 },
  ];
  for (const c of cheeks) {
    const foot = { x: c.x - 3, y: c.y - 2, w: c.w + 6, d: c.d + 4, r: 2 };
    out.push(S(k.slabOf(foot, 0, 3, P, 3, 0.5), { tone: "lo" }));
    out.push(D([at([foot.x + foot.w / 2, foot.y + 4, 3]), at([foot.x + foot.w / 2, foot.y + foot.d - 4, 3])], { size: 0.45 }));
    out.push(S(k.slabOf(c, 3, RACK_Z - 3, P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(c, 16, P, 3), { tone: "faint" }) }));
  }
  // tie bar between the cheeks, front side
  out.push(S(k.slabOf({ x: RACK.x + 16, y: RACK.y + RACK.d - 14, w: RACK.w - 32, d: 4, r: 1 }, 12, 5, P, 2, 0.3), { tone: "mid" }));
  // the rack plate
  out.push(S(k.slabOf(RACK, RACK_Z, RACK_H, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(RACK, RACK_Z + 2.2, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(RACK, 2.6), RACK_TOP, P, 4), { tone: "faint" }));
  out.push(L(seatHoles.map(([x, y]) => k.ring(x, y, BALL_R + 0.35, RACK_TOP, P, 12)).join(""), { tone: "lo" }));
  out.push(D(solidHoles.map(([x, y]) => at([x, y, RACK_TOP])), { size: 0.5, tone: "mid" }));
  out.push(D(k.corners(RACK, 2.2).map(([x, y]) => at([x, y, RACK_TOP])), { size: 0.45 }));
  // a knurled release knob on the cheek's front face
  const knob = [RACK.x + RACK.w - 12, RACK.y + RACK.d + 4];
  out.push(S(k.slabOf({ x: knob[0] - 1.6, y: RACK.y + RACK.d - 8, w: 3.2, d: 9, r: 0.8 }, 18, 3.2, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(knob[0], knob[1], 3.4, 16, 7, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 3.4, 16, 23, 20, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([knob[0], knob[1]], [knob[0] + 3, knob[1]], 23, P), { tone: "hi", free: "end" }));
  return out.join("");
}

function tray(t) {
  const { plan } = t;
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, 2), 0, 1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(plan, 0, TRAY_H, P, 4, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), TRAY_H, P, 3), { tone: "faint" }));
  const holes = trayHoles(t);
  out.push(L(holes.map(([x, y]) => k.ring(x, y, BALL_R + 0.3, TRAY_H, P, 12)).join(""), { tone: "lo" }));
  // column rule: a faint line between every fifth column (50 voices)
  for (let col = 5; col < t.cols; col += 5) {
    const x = plan.x + 4.5 + TRAY_GAP * col;
    out.push(L(k.lineOnTop([x, plan.y + 2], [x, plan.y + plan.d - 2], TRAY_H, P), { tone: "faint" }));
  }
  // front ruler strip on the base, a tick per column, a major every 5th
  const strip = { x: plan.x, y: plan.y + plan.d + 2, w: plan.w, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const x0 = plan.x + 4.5 + TRAY_GAP * 0.5;
  const ticks = k.topTicks(x0, x0 + TRAY_GAP * (t.cols - 1) + 0.01, TRAY_GAP, 5, strip.y + 0.6, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // engraved name on the strip's end
  out.push(k.faceTextSvg(k.topMatrix([plan.x + 1.2, strip.y + 5.2], 0.6, P, "x"), t.key === "abstention" ? "ABST" : t.key.toUpperCase(), { size: 3.4, tone: "mid" }));
  return out.join("");
}

function dial() {
  const out = [];
  const [x, y] = DIAL;
  const base = { x: x - 13, y: y - 13, w: 26, d: 26, r: 3 };
  out.push(`<path class="iso-halo" d="${k.haloOf(base, 0, 1, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(base, 0, 8, P, 4, 0.6), { tone: "mid" }));
  out.push(D(k.corners(base, 3.2).map(([px, py]) => at([px, py, 8])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 5, 8, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3.4, 12, DIAL_Z - 12, P, 24), { tone: "mid", crease: "none" }));
  out.push(L([20, 30].map((z) => k.sideArc(x, y, 3.4, z, P, 16)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 72, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3.2, DIAL_TOP, 96, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3.2, P, 48), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2.2, DIAL_TOP, P, 72), { tone: "lo" }));
  // scale: 0 to 362 suffrages exprimés over 300°, a tick every 10, a major every 50
  const count = 37; // 0..360 by 10
  const span = (SWEEP * 360) / EXPRIMES;
  const t = k.radialTicks(x, y, DIAL_R - 2.2, count - 1, 5, DIAL_TOP, [1.4, 3], P, SWEEP_FROM, span);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  // majority mark: a wedge rooted on the bezel ring at 182
  const a = SWEEP_FROM + (SWEEP * MAJORITY) / EXPRIMES;
  const p = (r, da = 0) => [x + Math.sin(a + da) * r, y - Math.cos(a + da) * r];
  out.push(`<path class="iso-line" data-tone="hi" style="stroke-width:1.2" d="${k.onTop([p(DIAL_R - 2.2), p(DIAL_R - 7)], DIAL_TOP, P)}"/>`);
  out.push(L(k.onTop([p(DIAL_R - 2.2, -0.05), p(DIAL_R - 5.4), p(DIAL_R - 2.2, 0.05)], DIAL_TOP, P), { tone: "hi" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 10], DIAL_TOP, P, "x"), "MAJ 182", { size: 3.2, tone: "lo", anchor: "middle" }));
  // crown on the +x side
  out.push(S(k.slabOf({ x: x + DIAL_R - 1, y: y - 2.4, w: 5, d: 4.8, r: 1.2 }, DIAL_Z + 2, 5, P, 3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x + DIAL_R + 3.6, y: y - 3.2, w: 2.6, d: 6.4, r: 1.2 }, DIAL_Z + 1.2, 6.6, P, 3), { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.8, DIAL_TOP, P, 16), { tone: "mid" }));
  return out.join("");
}

const needleAt = (voices) => {
  const a = SWEEP_FROM + (SWEEP * Math.min(voices, EXPRIMES)) / EXPRIMES;
  const [x, y] = DIAL;
  return k.lineOnTop([x - Math.sin(a) * 4, y + Math.cos(a) * 4], [x + Math.sin(a) * (DIAL_R - 4.5), y - Math.cos(a) * (DIAL_R - 4.5)], DIAL_TOP + 0.2, P);
};

function lamp() {
  const out = [];
  const [x, y] = LAMP;
  out.push(S(k.cylinder(x, y, 9, 0, 3, P, 32, 0.5), { tone: "lo" }));
  out.push(D([0, 1, 2, 3].map((i) => at([x + Math.cos(i * 1.5708 + 0.785) * 7, y + Math.sin(i * 1.5708 + 0.785) * 7, 3])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 6, 3, 10, P, 28), { tone: "mid", inner: L(k.sideArc(x, y, 6, 8, P, 20), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 6.8, 13, 2, P, 28), { tone: "mid" }));
  return out.join("");
}
const lensSvg = (on) => S(k.cylinder(LAMP[0], LAMP[1], 5, 15, 5, P, 28, 0.5), { tone: "hi", crease: "lo", lit: on, className: "bd-lens" });

// balls: one <circle> per seat, in the top layer, moved by the live code
const ballR = f1(BALL_R * P.scale);
function balls() {
  const out = [];
  seatHoles.forEach(([x, y], seat) => {
    const [sx, sy] = at([x, y, RACK_TOP + 0.6]);
    out.push(`<circle class="bd-ball" data-seat="${seat}" cx="${f1(sx)}" cy="${f1(sy)}" r="${ballR}" fill="url(#bd-steel)"/>`);
  });
  return `<defs><radialGradient id="bd-steel" cx=".5" cy=".5" r=".55" fx=".34" fy=".3"><stop offset="0" class="bd-s0"/><stop offset=".45" class="bd-s1"/><stop offset="1" class="bd-s2"/></radialGradient></defs>${out.join("")}`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `Une machine à compter un scrutin. Un râtelier porte 577 billes, une par siège de député. ${CAST} billes descendent dans trois plateaux de comptage : ${VOTE.pour} pour, ${VOTE.contre} contre, ${VOTE.abstention} abstentions ; ${SILENT} restent sur le râtelier. Un cadran mesure les voix pour face à la majorité absolue de ${MAJORITY}.`,
  body: [
    plate(),
    rack(),
    ...TRAYS.map(tray),
    lamp(),
    `<g data-part="lens">${lensSvg(false)}</g>`,
    dial(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(0)}" style="stroke-width:1.1"/>`,
    `<g data-part="balls">${balls()}</g>`,
  ],
});

// ---------------------------------------------------------------- live
const LAUNCH = 7.2; // seconds over which the 364 voices are counted
const FLIGHT = 0.8;
const START = 1.0;
const DONE = START + LAUNCH + FLIGHT;
const HOLD = 4.2;
const RETURN = 1.4;
const LOOP = DONE + HOLD + RETURN;

const ballFrom = leaving.map((seat) => seatHoles[seat]);
const live = `
const P = ${JSON.stringify(P)};
const FROM = ${JSON.stringify(ballFrom.map((p) => p.map(f1)))};
const TO = ${JSON.stringify(BALLS.map((b) => b.to.map(f1)))};
const TRAY = ${JSON.stringify(BALLS.map((b) => b.tray))};
const SEAT = ${JSON.stringify(leaving)};
const STAY = ${JSON.stringify(staying)};
const RACK_TOP = ${RACK_TOP}, TRAY_TOP = ${TRAY_H}, BALL = 0.6;
const START = ${START}, LAUNCH = ${LAUNCH}, FLIGHT = ${FLIGHT}, DONE = ${DONE}, HOLD = ${HOLD}, RETURN = ${RETURN}, LOOP = ${LOOP};
const N = FROM.length, MAJORITY = ${MAJORITY}, EXPRIMES = ${EXPRIMES};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, SWEEP = ${SWEEP}, SWEEP_FROM = ${SWEEP_FROM};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const needle = svg.querySelector('[data-part="needle"]');
const lens = svg.querySelector('[data-part="lens"] .iso-solid');
const circles = [...svg.querySelectorAll(".bd-ball")];
const moving = SEAT.map((seat) => circles[seat]);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const launchAt = (i) => START + (LAUNCH * i) / N;

// u in [0, 1]: 0 on the rack, 1 in the tray. Horizontal travel is linear in time, height a gravity arc.
function placeOf(i, u) {
  const [x0, y0] = FROM[i], [x1, y1] = TO[i];
  const z0 = RACK_TOP + BALL, z1 = TRAY_TOP + BALL;
  const lift = 52 + 12 * Math.abs(x1 - x0) / 160;
  const z = z0 + (z1 - z0) * u + 4 * lift * u * (1 - u);
  return iso([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z], P);
}
// progress of ball i at clock t (the whole figure is a pure function of t)
function progressOf(i, t) {
  if (t <= DONE + HOLD) return clamp((t - launchAt(i)) / FLIGHT, 0, 1);
  return 1 - clamp((t - DONE - HOLD) / RETURN, 0, 1); // everyone back to the rack
}
let shown = [-1, -1, -1], lastLit = null, lastState = "";
function draw(t) {
  const counts = [0, 0, 0];
  let flying = 0;
  for (let i = 0; i < N; i++) {
    const u = progressOf(i, t);
    const [sx, sy] = placeOf(i, u);
    const el = moving[i];
    el.setAttribute("cx", sx.toFixed(1));
    el.setAttribute("cy", sy.toFixed(1));
    const air = u > 0 && u < 1;
    if (air) flying++;
    if (u >= 1) counts[TRAY[i]]++;
    const state = air ? "air" : u >= 1 ? "in" : "";
    if (el.dataset.state !== state) el.dataset.state = state;
  }
  const finished = counts[0] + counts[1] + counts[2] === N;
  const quiet = finished || t > DONE + HOLD ? "out" : "";
  for (const seat of STAY) if (circles[seat].dataset.state !== quiet) circles[seat].dataset.state = quiet;
  needle.setAttribute("d", needleAt(counts[0]));
  const majority = counts[0] >= MAJORITY;
  if (majority !== lastLit) { lastLit = majority; if (majority) lens.setAttribute("data-lit", ""); else lens.removeAttribute("data-lit"); }
  let text = "pour " + counts[0] + " · contre " + counts[1] + " · abst. " + counts[2];
  if (finished) text += " · adopté";
  else if (majority) text += " · majorité atteinte";
  if (readout.textContent !== text) readout.textContent = text;
  const phase = finished ? "fini" : flying || counts[0] + counts[1] + counts[2] ? "comptage" : "repos";
  if (phase !== lastState) {
    lastState = phase;
    stage.setAttribute("aria-valuetext", phase === "fini"
      ? "Dépouillement terminé : 276 pour, 86 contre, 2 abstentions, 213 sièges sans vote. Adopté."
      : phase === "comptage" ? "Dépouillement en cours" : "Avant le vote : 577 billes sur le râtelier");
  }
}

let t = still.matches ? DONE : 0, target = t, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { target = (target + dt) % LOOP; t = target; }
  else t = still.matches ? target : t + (target - t) * (1 - Math.exp(-dt / 0.22));
  if (!touring && Math.abs(target - t) < 0.002) t = target;
  draw(t);
  stage.setAttribute("aria-valuenow", String(Math.round((Math.min(t, DONE) / DONE) * 100)));
  const settled = !touring && t === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  if (touring) { t = Math.min(t, DONE + HOLD); target = t; }
  touring = false;
  target = clamp(next, 0, DONE);
  clearTimeout(idle);
  idle = setTimeout(() => { if (!still.matches) { touring = true; target = t; run(); } }, 3600);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1);
  steer(START + share * (DONE - START));
});
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 2 : 0.5;
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + step;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - step;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = DONE;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
draw(t);
`;

const CSS = `
.bd-s0{stop-color:var(--anatomy-lit-top)}.bd-s1{stop-color:var(--anatomy-shade-1)}.bd-s2{stop-color:var(--anatomy-mid)}
.iso[data-theme="dark"] .bd-s0{stop-color:var(--anatomy-hi)}.iso[data-theme="dark"] .bd-s1{stop-color:var(--anatomy-mid)}.iso[data-theme="dark"] .bd-s2{stop-color:var(--anatomy-lo)}
.bd-ball{stroke:var(--anatomy-hi);stroke-width:.5px;vector-effect:non-scaling-stroke}
.bd-ball[data-state="air"]{stroke:var(--anatomy-lit);stroke-width:1.1px}
.bd-ball[data-state="out"]{opacity:.38}
.bd-lens[data-lit]>.iso-top,.bd-lens[data-lit]>.iso-fill{fill:var(--anatomy-green)}
.bd-lens[data-lit]>.iso-shade{fill:color-mix(in srgb,var(--anatomy-green) 70%,var(--anatomy-paper))}
.bd-lens[data-lit]>.iso-edge{stroke:var(--anatomy-green)}
.iso-stage{touch-action:pan-y;outline:none}
@media (max-width:560px){.iso-plate{overflow:hidden}.iso-stage .iso-svg{width:124%;margin-left:-12%}}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Machine à scrutin",
  hint: "Survolez pour dépouiller",
  readout: "pour 0 · contre 0 · abst. 0",
  keys: [
    { mark: "lit", label: "Bille en vol : une voix en train d'être comptée" },
    { mark: "raised", label: "Plateaux pour, contre, abstention : une colonne = 10 voix" },
    { mark: "dim", label: `Billes restées sur le râtelier : ${SILENT} sièges sans vote exprimé` },
  ],
  caption: `Scrutin du ${VOTE.date}, ${VOTE.title}. Une bille par siège : ${SEATS}. ${CAST} députés ont voté, ${VOTE.pour} pour, ${VOTE.contre} contre et ${VOTE.abstention} abstentions ; ${SILENT} billes restent sur le râtelier (absents, non-votants ou sièges vacants). Les abstentions ne sont pas des suffrages exprimés : la majorité absolue des ${EXPRIMES} exprimés est ${MAJORITY}, et la lampe s'allume quand le cadran la franchit. Texte adopté. Le râtelier ne reproduit pas l'hémicycle : la place d'une bille n'indique pas qui a voté quoi.`,
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Machine à scrutin : flèches gauche et droite pour avancer ou reculer le dépouillement" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Avant le vote : 577 billes sur le râtelier">${svg}</div>`,
});

const html = k
  .pageHtml({ title: "Machine à scrutin", theme, body, script: kitScript() + live, width: 720 })
  .replace('<html lang="en">', '<html lang="fr">')
  .replace("</style>", `${CSS}</style>`);
const out = theme === "light" ? "ball-drop-light.html" : "ball-drop.html";
writeFileSync(join(HERE, out), `${html}\n`);
console.log("wrote", out, `(${Math.round(html.length / 1024)} KB)`);
