// La navette: a bill's parcours woven on a loom. Each dated acte is one pick of weft; the
// shuttle parks in the box of the chamber that holds the text, and crosses when the text does.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, f1, labelPlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth
// GET /lois/DLR5L17N54372, recorded in ios/.../Fixtures/loi.json: the dated actes, in ordinal order.
const BILL = { title: "Projet de loi relatif à la protection des enfants", uid: "DLR5L17N54372" };
const ACTES = [
  ["2026-05-27", "AN", "dépôt du projet de loi"],
  ["2026-05-27", "AN", "procédure accélérée engagée"],
  ["2026-05-27", "AN", "renvoi en commission"],
  ["2026-06-23", "AN", "rapporteur nommé"],
  ["2026-07-07", "AN", "rapport déposé"],
  ["2026-07-15", "AN", "séance publique"],
  ["2026-07-15", "AN", "séance publique · 9 amendements"],
  ["2026-07-16", "AN", "séance publique"],
  ["2026-07-16", "AN", "séance publique"],
  ["2026-07-16", "AN", "séance publique · 66 amendements, 4 articles"],
  ["2026-07-21", "AN", "adopté 378 pour, 7 contre, 173 abst."],
  ["2026-07-22", "SN", "transmis au Sénat"],
  ["2026-07-22", "SN", "renvoi en commission"],
];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateFr = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 400;
const PLATE = { x: -160, y: -94, w: 320, d: 178, r: 9 };
const BEAM_Z = 46;
const BEAM_H = 8;
const TOP = BEAM_Z + BEAM_H; // warp runs over the beam tops
const BACK = { x: -112, y: -78, w: 224, d: 10, r: 1.5 };
const FRONT = { x: -112, y: 58, w: 224, d: 10, r: 1.5 };
const SIDES = [-118, 112]; // x of the side frames (6 wide)
const WARP_X = [];
for (let x = -84; x <= 84.01; x += 6) WARP_X.push(x);
const FELL = 14; // where the newest pick is beaten in
const PICK = 3.1;
const SHED_Y = 6; // the shuttle's track, just behind the fell
const BOX = { w: 26, d: 14 };
const BOXES = { AN: -144, SN: 118 }; // x of each box's near-left corner
const BOX_Z = TOP - 6;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), [-150, -80, TOP + 14], [150, 60, TOP + 6]],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: 64, elevation: 34 },
);
const { at, S, L, D, byDepth, halo } = tools(P);

// ---------------------------------------------------------------- art
function frame() {
  const out = [];
  for (const x of SIDES) {
    const rail = { x, y: -84, w: 6, d: 158, r: 1.2 };
    out.push(halo(rail, 3));
    out.push(S(k.slabOf(rail, 0, 6, P, 3, 0.4), { tone: "mid" }));
    out.push(D([at([x + 3, -78, 6]), at([x + 3, 68, 6])], { size: 0.45 }));
    for (const y of [-80, 60]) {
      const post = { x, y, w: 6, d: 6, r: 1 };
      out.push(S(k.slabOf(post, 6, BEAM_Z - 6, P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(post, 24, P, 3), { tone: "faint" }) }));
    }
  }
  // beams across the frame (square, like a table loom's)
  out.push(S(k.slabOf(BACK, BEAM_Z, BEAM_H, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(BACK, BEAM_Z + 4, P, 3), { tone: "faint" }) }));
  // warp: one thread per 6 units, from the back beam to the fell
  out.push(L(WARP_X.map((x) => k.lineOnTop([x, BACK.y + BACK.d], [x, FRONT.y], TOP, P)).join(""), { tone: "lo" }));
  // heddle bar over the warp, on two uprights standing on the side rails
  for (const x of SIDES) out.push(S(k.slabOf({ x: x + 1, y: -36, w: 4, d: 4, r: 0.8 }, 6, TOP + 10 - 6, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: SIDES[0], y: -37, w: SIDES[1] - SIDES[0] + 6, d: 6, r: 1 }, TOP + 10, 4, P, 3, 0.4), { tone: "mid" }));
  out.push(L(WARP_X.map((x) => k.segment([x, -34, TOP], [x, -34, TOP + 10], P)).join(""), { tone: "faint" }));
  return out.join("");
}

function boxes() {
  const out = [];
  for (const [key, x] of Object.entries(BOXES)) {
    const plan = { x, y: SHED_Y - BOX.d / 2, w: BOX.w, d: BOX.d, r: 1.5 };
    const stand = { x: x + BOX.w / 2 - 3, y: SHED_Y - 3, w: 6, d: 6, r: 1 };
    out.push(halo(plan, 3));
    out.push(S(k.slabOf(stand, 0, BOX_Z, P, 3, 0.4), { tone: "mid" }));
    out.push(S(k.slabOf(plan, BOX_Z, 6, P, 3, 0.6), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(plan, 2.2), BOX_Z + 6, P, 3), { tone: "faint" }));
    out.push(k.faceTextSvg(k.topMatrix([x + 3, plan.y + plan.d - 1.6], BOX_Z + 6, P, "x"), key === "AN" ? "AN" : "SÉNAT", { size: 3, tone: "mid" }));
  }
  return out.join("");
}

function breast() {
  const out = [];
  out.push(S(k.slabOf(FRONT, BEAM_Z, BEAM_H, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(FRONT, BEAM_Z + 4, P, 3), { tone: "faint" }) }));
  // cloth already wound on the breast beam: three wraps on its front face
  for (const dz of [1.6, 3.2, 4.8]) out.push(L(k.segment([-88, FRONT.y + FRONT.d, BEAM_Z + dz], [88, FRONT.y + FRONT.d, BEAM_Z + dz], P), { tone: "faint" }));
  // the blade that cuts the finished cloth off (promulgation): idle, folded against the beam end
  const blade = { x: FRONT.x + FRONT.w + 2, y: FRONT.y + 1, w: 3, d: 8, r: 0.6 };
  out.push(S(k.slabOf(blade, BEAM_Z - 6, 18, P, 2, 0.3), { tone: "lo" }));
  out.push(D([at([blade.x + 1.5, blade.y + 4, BEAM_Z + 12])], { size: 0.5, tone: "mid" }));
  // knurled winding knob on the left side
  const knob = [FRONT.x - 4, FRONT.y + FRONT.d / 2];
  out.push(S(k.cylinder(knob[0], knob[1], 4, BEAM_Z, BEAM_H, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 4, BEAM_Z, BEAM_Z + BEAM_H, 22, P), { tone: "lo" }));
  return out.join("");
}

const reedSvg = () => {
  const reed = { x: -96, y: 0, w: 192, d: 3, r: 0.8 };
  return [
    S(k.slabOf(reed, TOP - 1, 12, P, 2, 0.3), { tone: "mid" }),
    L(WARP_X.map((x) => k.segment([x - 3, reed.y + reed.d, TOP - 1], [x - 3, reed.y + reed.d, TOP + 11], P)).join(""), { tone: "faint" }),
    S(k.slabOf({ x: -100, y: -1, w: 200, d: 5, r: 1 }, TOP + 11, 3, P, 3, 0.4), { tone: "mid" }),
  ].join("");
};
const shuttleSvg = () => {
  const ring = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push([Math.cos(a) * 13 * Math.min(1, 1.6 * Math.abs(Math.cos(a)) ** 0.5), Math.sin(a) * 2.6]);
  }
  return [
    S(k.extrude(ring, TOP + 0.6, 3.4, P), { tone: "hi", lit: true }),
    L(k.lineOnTop([-6, 0], [6, 0], TOP + 4, P), { tone: "lo" }),
  ].join("");
};

// ---------------------------------------------------------------- live
const START = 0.8;
const PER = 1.35; // one acte: out and back (or across), then the beat
const END = START + PER * ACTES.length;
const LOOP = END + 3.4;
const BOX_CENTRE = { AN: BOXES.AN + BOX.w / 2, SN: BOXES.SN + BOX.w / 2 };

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `Un métier à tisser. Chaque étape datée du ${BILL.title} ajoute une trame au tissu. La navette repose dans la boîte de l'Assemblée pendant la première lecture, puis passe dans la boîte du Sénat quand le texte y est transmis, le 22 juillet 2026.`,
  body: [
    basePlate(P, PLATE),
    labelPlate(P, { x: 96, y: 62, w: 44, d: 14, r: 1.5 }),
    frame(),
    `<g data-part="cloth"></g>`,
    boxes(),
    `<g data-part="reed">${reedSvg()}</g>`,
    `<g data-part="shuttle">${shuttleSvg()}</g>`,
    breast(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const ACTES = ${JSON.stringify(ACTES.map(([d, c, l]) => [dateFr(d), c, l]))};
const START = ${START}, PER = ${PER}, END = ${END}, TOP = ${TOP}, FELL = ${FELL}, PICK = ${PICK}, SHED_Y = ${SHED_Y};
const BOX_CENTRE = ${JSON.stringify(BOX_CENTRE)};
const WARP = [${WARP_X[0]}, ${WARP_X[WARP_X.length - 1]}];
const cloth = document.querySelector('[data-part="cloth"]');
const reed = document.querySelector('[data-part="reed"]');
const shuttle = document.querySelector('[data-part="shuttle"]');
const readout = document.querySelector("[data-readout]");
const ease = (u) => u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
let woven = -1;
function weave(n) {
  if (n === woven) return;
  woven = n;
  const parts = [];
  const span = n * PICK;
  if (n > 0) parts.push(solidSvg(slabOf({ x: WARP[0] - 3, y: FELL, w: WARP[1] - WARP[0] + 6, d: span, r: 0.4 }, TOP, 0.5, P, 2), { tone: "hi", crease: "none" }));
  for (let i = 0; i < n; i++) {
    const y = FELL + span - (i + 0.5) * PICK; // the oldest pick has travelled furthest toward the front
    const d = onTop([[WARP[0] - 3, y], [WARP[1] + 3, y]], TOP + 0.5, P);
    parts.push(lineSvg(d, ACTES[i][1] === "AN" ? { tone: "hi" } : { tone: "hi", dashed: true }));
  }
  cloth.innerHTML = parts.join("");
}
function draw(t) {
  const i = Math.floor((t - START) / PER);
  const u = (t - START) / PER - i;
  let n = Math.max(0, Math.min(ACTES.length, i));
  let x, beat = 0, chamber = "AN";
  if (t < START || i >= ACTES.length) {
    chamber = i >= ACTES.length ? ACTES[ACTES.length - 1][1] : "AN";
    x = BOX_CENTRE[chamber];
    if (i >= ACTES.length) n = ACTES.length;
  } else {
    const [, here] = ACTES[i];
    const from = i ? ACTES[i - 1][1] : "AN";
    chamber = here;
    if (from !== here) {
      // the navette: one pass across, and the shuttle stays in the other chamber's box
      x = BOX_CENTRE[from] + (BOX_CENTRE[here] - BOX_CENTRE[from]) * ease(Math.min(1, u / 0.72));
    } else {
      // out across the warp and back to the same box
      const far = here === "AN" ? BOX_CENTRE.SN : BOX_CENTRE.AN;
      const v = Math.min(1, u / 0.72);
      x = BOX_CENTRE[here] + (far - BOX_CENTRE[here]) * Math.sin(Math.PI * ease(v));
    }
    if (u > 0.72) { beat = Math.sin(((u - 0.72) / 0.28) * Math.PI); if (u > 0.86) n = i + 1; }
  }
  weave(n);
  shuttle.setAttribute("transform", translateAlong(P, [x, SHED_Y, 0]));
  reed.setAttribute("transform", translateAlong(P, [0, 2 + beat * (FELL - 5), 0]));
  const shown = Math.max(1, n);
  const [date, ch, label] = ACTES[shown - 1];
  const text = n === 0 ? "avant le dépôt" : date + " · " + (ch === "AN" ? "AN" : "Sénat") + " · " + label;
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: END, step: PER, rest: END })}
`;

writePage({
  here: HERE,
  name: "navette",
  title: "La navette",
  fig: "Fig 2",
  hint: "Survolez pour remonter le parcours",
  readout: "avant le dépôt",
  keys: [
    { mark: "lit", label: "La navette : elle repose du côté de la chambre qui tient le texte" },
    { mark: "raised", label: "Trames pleines : étapes à l'Assemblée" },
    { mark: "dashed", label: "Trames en tirets : étapes au Sénat" },
  ],
  caption: `${BILL.title}. Chaque trame est une étape datée du parcours officiel : ${ACTES.filter((a) => a[1] === "AN").length} à l'Assemblée, du dépôt le 27 mai 2026 au vote du 21 juillet (378 pour, 7 contre, 173 abstentions), puis ${ACTES.filter((a) => a[1] === "SN").length} au Sénat depuis sa transmission le 22 juillet. Le texte y est toujours en première lecture : la lame qui coupe le tissu, la promulgation, n'a pas encore servi.`,
  svg,
  ariaLabel: "La navette : flèches gauche et droite pour passer d'une étape du parcours à l'autre",
  ariaValue: "Parcours du projet de loi relatif à la protection des enfants",
  live,
});
