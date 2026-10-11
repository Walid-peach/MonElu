// La pointeuse: one deputy, three ways to count presence. A punch head punches the same
// deputy's card three times, once per measure, and the dial on the clock reads the rate.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, f1, labelPlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth
// The DeputyScorecard example in api/schemas.py (shown here without the name).
// presence_rate (ADR-019) counts every recorded position, nonVotant included, over the scrutins
// held in the mandate window; that denominator is not returned, so ~468 is 446 / 0.954.
const CARD = {
  total: 446, // recorded positions, nonVotant included
  cast: 407, // positions other than nonVotant
  presence: 0.954,
  solennels: [21, 24],
  days: [41, 62],
};
const WINDOW = Math.round(CARD.total / CARD.presence); // 468
const MODES = [
  { key: "SCR", name: "scrutins", cols: 26, rows: 18, cells: WINDOW, full: CARD.cast, half: CARD.total - CARD.cast, rate: CARD.presence, of: `${CARD.total} sur ~${WINDOW}` },
  { key: "SOL", name: "scrutins solennels", cols: 6, rows: 4, cells: CARD.solennels[1], full: CARD.solennels[0], half: 0, rate: CARD.solennels[0] / CARD.solennels[1], of: `${CARD.solennels[0]} sur ${CARD.solennels[1]}` },
  { key: "JRS", name: "jours de vote", cols: 16, rows: 4, cells: CARD.days[1], full: CARD.days[0], half: 0, rate: CARD.days[0] / CARD.days[1], of: `${CARD.days[0]} sur ${CARD.days[1]}` },
];

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 400;
const PLATE = { x: -158, y: -84, w: 316, d: 168, r: 9 };
const BED = { x: -16, y: -50, w: 160, d: 100, r: 3 };
const CARD_PLAN = k.insetPlan(BED, 4);
const CARD_Z = 5;
const CARD_TOP = CARD_Z + 0.8;
const INNER = k.insetPlan(CARD_PLAN, 6);
const CLOCK = { x: -146, y: -52, w: 82, d: 64, r: 4 };
const CLOCK_H = 50;
const DIAL = [CLOCK.x + CLOCK.w / 2, CLOCK.y + CLOCK.d / 2];
const DIAL_R = 24;
const DIAL_TOP = CLOCK_H + 8;
const SWEEP = (Math.PI * 5) / 3;
const SWEEP_FROM = -SWEEP / 2;
const KNOB = [-105, 46];
const KNOB_ANGLES = [-0.9, 0, 0.9]; // pointer angle per mode (0 = toward -y)
const RAIL_Y = [BED.y - 8, BED.y + BED.d + 2];
const RAIL_X = [BED.x - 6, BED.x + BED.w + 6];
const BRIDGE_Z = 22;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), [CLOCK.x, CLOCK.y, DIAL_TOP + 2], [RAIL_X[1], RAIL_Y[0], BRIDGE_Z + 6]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 52, elevation: 36 },
);
const { at, S, L, D, byDepth, halo } = tools(P);

const cellsOf = (m) => {
  const out = [];
  const gx = INNER.w / m.cols;
  const gy = INNER.d / m.rows;
  for (let row = 0; row < m.rows; row++)
    for (let col = 0; col < m.cols; col++) {
      if (out.length >= m.cells) break;
      out.push([INNER.x + gx * (col + 0.5), INNER.y + gy * (row + 0.5)]);
    }
  return { cells: out, r: Math.min(gx, gy) * 0.3 };
};

// ---------------------------------------------------------------- art
function clock() {
  const out = [halo(CLOCK, 5)];
  out.push(S(k.slabOf(CLOCK, 0, CLOCK_H, P, 6, 1), { tone: "mid", inner: L(k.sideSeam(CLOCK, 10, P, 6) + k.sideSeam(CLOCK, CLOCK_H - 8, P, 6), { tone: "faint" }) }));
  // the card slot on the front face (toward +x), a closed outline
  const sx = CLOCK.x + CLOCK.w;
  const slot = [[sx, CLOCK.y + 14, 30], [sx, CLOCK.y + CLOCK.d - 14, 30], [sx, CLOCK.y + CLOCK.d - 14, 32.4], [sx, CLOCK.y + 14, 32.4]];
  out.push(L(k.pathOf(k.pointsAt(slot, P), true), { tone: "hi" }));
  // vent slots on the same face
  for (const z of [16, 19, 22]) out.push(L(k.pathOf(k.pointsAt([[sx, CLOCK.y + 20, z], [sx, CLOCK.y + CLOCK.d - 20, z], [sx, CLOCK.y + CLOCK.d - 20, z + 1], [sx, CLOCK.y + 20, z + 1]], P), true), { tone: "lo" }));
  out.push(D(k.corners(CLOCK, 4).map(([x, y]) => at([x, y, CLOCK_H])), { size: 0.45 }));
  // the dial on top
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, DIAL_R + 2, CLOCK_H, 3, P, 56), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, DIAL_R, CLOCK_H + 3, DIAL_TOP - CLOCK_H - 3, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 80, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, DIAL_R - 2, 20, 2, DIAL_TOP, [1.3, 2.8], P, SWEEP_FROM, SWEEP);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 9], DIAL_TOP, P, "x"), "%", { size: 3, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: "mid" }));
  return out.join("");
}

function knob() {
  const out = [];
  const [x, y] = KNOB;
  const base = { x: x - 22, y: y - 14, w: 44, d: 28, r: 3 };
  out.push(S(k.slabOf(base, 0, 4, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 9, 4, 3, P, 36), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 7, 7, 5, P, 32), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, 7, 7, 12, 30, P), { tone: "lo" }));
  MODES.forEach((m, i) => {
    const a = KNOB_ANGLES[i];
    const p = (r) => [x + Math.sin(a) * r, y - Math.cos(a) * r];
    out.push(L(k.onTop([p(9), p(11.5)], 4, P), { tone: "mid" }));
    const [tx, ty] = p(15.5);
    out.push(k.faceTextSvg(k.topMatrix([tx, ty], 4, P, "x"), m.key, { size: 2.4, tone: "mid", anchor: "middle" }));
  });
  return out.join("");
}
const knobPointer = (a) => k.onTop([[KNOB[0], KNOB[1]], [KNOB[0] + Math.sin(a) * 6.4, KNOB[1] - Math.cos(a) * 6.4]], 12, P);

function bed() {
  const out = [halo(BED, 4)];
  out.push(S(k.slabOf(BED, 0, CARD_Z, P, 4, 0.6), { tone: "mid" }));
  for (const y of RAIL_Y) {
    const rail = { x: RAIL_X[0], y, w: RAIL_X[1] - RAIL_X[0], d: 6, r: 1 };
    out.push(S(k.slabOf(rail, 0, 8, P, 3, 0.4), { tone: "mid" }));
    const ticks = k.topTicks(BED.x + 4, BED.x + BED.w - 4, 4, 5, y + 0.4, 8, [1.4, 2.8], P);
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  }
  out.push(S(k.slabOf(CARD_PLAN, CARD_Z, 0.8, P, 3), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(CARD_PLAN, 2.4), CARD_TOP, P, 3), { tone: "faint" }));
  // the card's own header strip: three rule lines of printed text along its back edge
  for (const [dy, share] of [[2.6, 0.5], [4.4, 0.3]]) out.push(L(k.lineOnTop([CARD_PLAN.x + 6, CARD_PLAN.y + dy], [CARD_PLAN.x + 6 + (CARD_PLAN.w - 12) * share, CARD_PLAN.y + dy], CARD_TOP, P), { tone: "lo", free: true }));
  // three grids, one per measure; the live code shows one and punches it
  MODES.forEach((m, i) => {
    const { cells, r } = cellsOf(m);
    const items = cells.map(([x, y], n) => {
      const d = k.ring(x, y, r, CARD_TOP, P, r > 2 ? 24 : 12);
      const kind = n < m.full ? "full" : n < m.full + m.half ? "half" : "none";
      return `<path class="pt-cell" data-kind="${kind}" d="${d}"/>`;
    });
    out.push(`<g data-mode="${i}"${i ? ' data-hide=""' : ""}>${items.join("")}</g>`);
  });
  return out.join("");
}

const bridgeSvg = () => {
  const span = { x: -4, y: RAIL_Y[0] - 1, w: 8, d: RAIL_Y[1] - RAIL_Y[0] + 8, r: 1.4 };
  return [
    S(k.slabOf({ x: -5, y: RAIL_Y[0] - 1, w: 10, d: 8, r: 1.2 }, 8, BRIDGE_Z - 8, P, 3, 0.4), { tone: "mid" }),
    S(k.slabOf({ x: -5, y: RAIL_Y[1] - 1, w: 10, d: 8, r: 1.2 }, 8, BRIDGE_Z - 8, P, 3, 0.4), { tone: "mid" }),
    S(k.slabOf(span, BRIDGE_Z, 4, P, 3, 0.5), { tone: "mid" }),
  ].join("");
};
const headSvg = () => [
  S(k.slabOf({ x: -5, y: -5, w: 10, d: 10, r: 1.5 }, BRIDGE_Z - 9, 9, P, 3, 0.5), { tone: "mid" }),
  S(k.cylinder(0, 0, 1.6, CARD_TOP + 1, BRIDGE_Z - 9 - CARD_TOP - 1, P, 16), { tone: "hi", lit: true, crease: "none" }),
].join("");

// ---------------------------------------------------------------- live
const PUNCH = 3.4;
const HOLD = 1.8;
const SEG = PUNCH + HOLD;
const LOOP = SEG * MODES.length;
const cellData = MODES.map((m) => cellsOf(m).cells.map((c) => c.map(f1)));

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `Une pointeuse. La même fiche de député est poinçonnée trois fois, une par mesure de présence : ${MODES.map((m) => `${m.name}, ${m.of}, ${Math.round(m.rate * 100)} %`).join(" ; ")}. Le cadran sur l'horloge lit le taux.`,
  body: [
    basePlate(P, PLATE),
    labelPlate(P, { x: 98, y: 64, w: 48, d: 14, r: 1.5 }),
    clock(),
    `<path data-part="dial-needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d=""/>`,
    knob(),
    `<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1.1" d=""/>`,
    bed(),
    `<g data-part="bridge">${bridgeSvg()}<g data-part="head">${headSvg()}</g></g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const MODES = ${JSON.stringify(MODES.map(({ name, full, half, cells, rate, of }) => ({ name, full, half, cells, rate, of })))};
const CELLS = ${JSON.stringify(cellData)};
const PUNCH = ${PUNCH}, SEG = ${SEG};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, SWEEP = ${SWEEP}, SWEEP_FROM = ${SWEEP_FROM};
const KNOB = ${JSON.stringify(KNOB)}, KNOB_ANGLES = ${JSON.stringify(KNOB_ANGLES)};
const grids = [...document.querySelectorAll("[data-mode]")].map((g) => [...g.children]);
const groups = [...document.querySelectorAll("[data-mode]")];
const needle = document.querySelector('[data-part="dial-needle"]');
const knobLine = document.querySelector('[data-part="knob"]');
const bridge = document.querySelector('[data-part="bridge"]');
const head = document.querySelector('[data-part="head"]');
const readout = document.querySelector("[data-readout]");
const needleAt = (rate) => {
  const a = SWEEP_FROM + SWEEP * rate;
  return onTop([[DIAL[0] - Math.sin(a) * 3.5, DIAL[1] + Math.cos(a) * 3.5], [DIAL[0] + Math.sin(a) * (DIAL_R - 4), DIAL[1] - Math.cos(a) * (DIAL_R - 4)]], DIAL_TOP + 0.2, P);
};
const knobPointer = ${knobPointer.toString().replace(/k\.onTop/g, "onTop")};
let mode = -1, shown = -1, gauge = 0, turn = KNOB_ANGLES[0];
function draw(t) {
  const m = Math.min(MODES.length - 1, Math.floor(t / SEG));
  const u = Math.min(1, (t - m * SEG) / PUNCH);
  const M = MODES[m];
  if (m !== mode) { mode = m; shown = -1; groups.forEach((g, i) => (i === m ? g.removeAttribute("data-hide") : g.setAttribute("data-hide", ""))); }
  const marked = M.full + M.half;
  const n = Math.round(marked * u);
  if (n !== shown) {
    grids[m].forEach((el, i) => { const on = i < n ? "" : "off"; if ((el.dataset.on || "") !== on) el.dataset.on = on; });
    shown = n;
  }
  // the head sits over the last punched cell (or rests past the card when done)
  const cell = CELLS[m][Math.max(0, Math.min(n, marked) - 1)];
  const [hx, hy] = u >= 1 ? [CELLS[m][CELLS[m].length - 1][0] + 8, cell[1]] : cell;
  bridge.setAttribute("transform", translateAlong(P, [hx, 0, 0]));
  head.setAttribute("transform", translateAlong(P, [0, hy, 0]));
  const rate = (M.rate * Math.min(n, marked)) / Math.max(1, marked);
  gauge += (rate - gauge) * 0.25;
  if (Math.abs(rate - gauge) < 1e-4) gauge = rate;
  needle.setAttribute("d", needleAt(gauge));
  turn += (KNOB_ANGLES[m] - turn) * 0.2;
  knobLine.setAttribute("d", knobPointer(turn));
  const counted = Math.min(n, M.full + M.half);
  const text = M.name + " · " + (u >= 1 ? M.of : counted + " poinçons") + " · " + Math.round(rate * 100) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: LOOP - 0.01, step: 0.5, rest: PUNCH + 0.2, stops: MODES.map((_, i) => i * SEG + PUNCH + 0.2) })}
`;

const CSS = `
[data-hide]{display:none}
.pt-cell{fill:none;stroke:var(--anatomy-lo);stroke-width:.6px;vector-effect:non-scaling-stroke}
.pt-cell[data-kind="full"]:not([data-on="off"]){fill:var(--anatomy-hi);stroke:var(--anatomy-hi)}
.pt-cell[data-kind="half"]:not([data-on="off"]){stroke:var(--anatomy-hi);stroke-width:1px}
`;

writePage({
  here: HERE,
  name: "pointeuse",
  title: "La pointeuse",
  fig: "Fig 3",
  hint: "Survolez pour changer de mesure",
  readout: "scrutins · 0 poinçons · 0 %",
  keys: [
    { mark: "lit", label: "La tête de poinçonnage : une présence comptée" },
    { mark: "raised", label: "Trou plein : a voté (pour, contre ou abstention)" },
    { mark: "edge", label: `Trou cerclé : « non-votant », présent sans voter (${CARD.total - CARD.cast} fois)` },
  ],
  caption: `Un même député, trois taux. Sur les ~${WINDOW} scrutins de son mandat, il a une position enregistrée sur ${CARD.total} : 95 %, car la présence canonique compte aussi les « non-votants ». Sur les scrutins solennels, il en a voté ${CARD.solennels[0]} sur ${CARD.solennels[1]} (88 %) ; sur les jours de vote, ${CARD.days[0]} sur ${CARD.days[1]} (66 %). Valeurs de l'exemple de fiche publié dans la documentation de l'API, nom retiré ; les trous comptent, ils ne datent pas.`,
  svg,
  ariaLabel: "La pointeuse : flèches gauche et droite pour passer d'une mesure de présence à l'autre",
  ariaValue: "Trois mesures de présence pour un même député : 95, 88 et 66 %",
  live,
  css: CSS,
});
