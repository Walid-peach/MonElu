// La table lumineuse: the quiz as two punched cards on a light box. The Assemblée's card is
// punched where it voted; yours slides over it, and light comes through only where you agree.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth
// The ten curated quiz questions (api/quiz_data.py) with their tallies, as GET /quiz/questions
// serves them (ios/.../Fixtures/quiz_questions.json). All ten texts were adopted.
const QUESTIONS = [
  ["Fin de vie", "adopté", 291, 241],
  ["Sécu 2026", "adopté", 247, 232],
  ["Agriculture", "adopté", 316, 223],
  ["Corse", "adopté", 271, 202],
  ["Simplification", "adopté", 275, 225],
  ["Fraudes", "adopté", 335, 182],
  ["Légitime défense", "adopté", 313, 199],
  ["Nouvelle-Calédonie", "adopté", 279, 247],
  ["Rétention", "adopté", 303, 168],
  ["Logement", "adopté", 292, 160],
];
// Example answers (0 = pour, 1 = contre); the reader can flip each row.
const EXAMPLE = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0];

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 420;
const PLATE = { x: -112, y: -112, w: 250, d: 224, r: 9 };
const BOX = { x: -96, y: -98, w: 220, d: 196, r: 5 };
const BOX_H = 16;
const GLASS = { x: -40, y: -88, w: 80, d: 176, r: 2 };
const CARD = { x: -28, y: -84, w: 56, d: 168, r: 2 };
const ROW_Y = QUESTIONS.map((_, i) => CARD.y + 12 + i * 16);
const COL_X = [-10, 10]; // pour, contre (in the card's own x)
const HOLE_R = 3;
const A_Z = BOX_H;
const B_Z = BOX_H + 1.6;
const PARK = 104; // card B's offset when parked on the shelf
const RAIL_Y = [CARD.y - 6, CARD.y + CARD.d + 1];

const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [BOX.x, BOX.y, BOX_H + 8]], WIDTH, HEIGHT, { pad: 22, azimuth: 40, elevation: 42 });
const { at, S, L, D, halo } = tools(P);

// ---------------------------------------------------------------- art
function box() {
  const out = [halo(BOX, 6)];
  out.push(S(k.slabOf(BOX, 0, BOX_H, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(BOX, 5, P, 6), { tone: "faint" }) }));
  out.push(S(k.slabOf(GLASS, BOX_H - 0.2, 0.2, P, 3), { flat: true, className: "lt-glass", crease: "none" }));
  out.push(L(k.planOutline(GLASS, BOX_H, P, 3), { tone: "lo" }));
  // engraved headers and row names on the frame, left of the glass
  out.push(k.faceTextSvg(k.topMatrix([CARD.x + 2, CARD.y - 9], BOX_H, P, "x"), "POUR  CONTRE", { size: 2.8, tone: "mid" }));
  QUESTIONS.forEach(([name], i) => {
    out.push(k.faceTextSvg(k.topMatrix([GLASS.x - 3, ROW_Y[i] + 1], BOX_H, P, "x"), name.toUpperCase(), { size: 3, tone: "mid", anchor: "end" }));
  });
  // rails the sliding card runs in, from the glass to the shelf
  for (const y of RAIL_Y) {
    const rail = { x: CARD.x - 4, y, w: PARK + CARD.w + 8, d: 5, r: 1 };
    out.push(S(k.slabOf(rail, BOX_H, 3, P, 3, 0.3), { tone: "mid" }));
    out.push(D([at([rail.x + 3, y + 2.5, BOX_H + 3]), at([rail.x + rail.w - 3, y + 2.5, BOX_H + 3])], { size: 0.45 }));
  }
  // the switch on the box's front face
  const sw = [BOX.x + BOX.w - 18, BOX.y + BOX.d + 2];
  out.push(S(k.slabOf({ x: sw[0] - 5, y: BOX.y + BOX.d - 1, w: 10, d: 3, r: 1 }, 5, 6, P, 2), { tone: "mid" }));
  out.push(S(k.cylinder(sw[0], sw[1] + 1, 1.6, 6, 4, P, 16), { tone: "hi" }));
  out.push(D(k.corners(BOX, 4).map(([x, y]) => at([x, y, BOX_H])), { size: 0.45 }));
  return out.join("");
}

function cardA() {
  const out = [S(k.slabOf(CARD, A_Z, 0.8, P, 3), { tone: "hi", crease: "lo" })];
  out.push(L(ROW_Y.map((y) => k.ring(COL_X[0], y, HOLE_R, A_Z + 0.8, P, 24) + k.ring(COL_X[1], y, HOLE_R, A_Z + 0.8, P, 24)).join(""), { tone: "faint" }));
  // the Assemblée's punches: the side that won each vote
  out.push(QUESTIONS.map(([, result], i) => `<path class="lt-void" d="${k.ring(COL_X[result === "adopté" ? 0 : 1], ROW_Y[i], HOLE_R, A_Z + 0.8, P, 24)}"/>`).join(""));
  out.push(k.faceTextSvg(k.topMatrix([CARD.x + 3, CARD.y + CARD.d - 3], A_Z + 0.8, P, "x"), "AN", { size: 2.6, tone: "lo" }));
  return out.join("");
}

const cardBSvg = () => [
  S(k.slabOf(CARD, B_Z, 0.8, P, 3), { tone: "hi", crease: "lo", lit: true }),
  ...ROW_Y.map((y, i) => `<path class="lt-hole" data-row="${i}" d="${k.ring(COL_X[EXAMPLE[i]], y, HOLE_R, B_Z + 0.8, P, 24)}"/>`),
  k.faceTextSvg(k.topMatrix([CARD.x + 3, CARD.y + CARD.d - 3], B_Z + 0.8, P, "x"), "VOUS", { size: 2.6, tone: "mid" }),
].join("");

// ---------------------------------------------------------------- live
const SLIDE = 2.6;
const LOOP = SLIDE + 3.6 + 1.8 + 1.2;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Une table lumineuse. La fiche de l'Assemblée est percée du côté qui a gagné chacun des dix votes du quiz ; votre fiche glisse par-dessus, et la lumière ne passe que là où vos deux trous coïncident.",
  body: [
    basePlate(P, PLATE),
    box(),
    cardA(),
    `<g data-part="b">${cardBSvg()}</g>`,
    `<g data-part="light">${ROW_Y.map((y, i) => `<path class="lt-light" data-row="${i}" d="${k.ring(COL_X[0], y, HOLE_R - 0.4, B_Z + 0.9, P, 24)}"/>`).join("")}</g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const ROW_Y = ${JSON.stringify(ROW_Y)}, COL_X = ${JSON.stringify(COL_X)}, HOLE_R = ${HOLE_R}, B_Z = ${B_Z};
const AN = ${JSON.stringify(QUESTIONS.map(([, r]) => (r === "adopté" ? 0 : 1)))};
const CARD = ${JSON.stringify(CARD)};
const PARK = ${PARK}, SLIDE = ${SLIDE};
const answers = ${JSON.stringify(EXAMPLE)};
const b = document.querySelector('[data-part="b"]');
const holes = [...b.querySelectorAll(".lt-hole")];
const lights = [...document.querySelectorAll(".lt-light")];
const readout = document.querySelector("[data-readout]");
const ease = (u) => u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
let dxNow = PARK, lastT = 0;
function offsetAt(t) {
  if (t < SLIDE) return PARK * (1 - ease(t / SLIDE));
  if (t < SLIDE + 3.6) return 0;
  if (t < SLIDE + 5.4) return PARK * ease((t - SLIDE - 3.6) / 1.8);
  return PARK;
}
function draw(t) {
  lastT = t;
  const dx = offsetAt(t);
  dxNow = dx;
  b.setAttribute("transform", translateAlong(P, [dx, 0, 0]));
  let agree = 0;
  ROW_Y.forEach((y, i) => {
    const ax = COL_X[AN[i]];
    const covered = ax > CARD.x + dx - HOLE_R && ax < CARD.x + CARD.w + dx + HOLE_R;
    const through = Math.abs(COL_X[answers[i]] + dx - ax) < HOLE_R * 0.9;
    const lit = !covered || through;
    lights[i].dataset.on = lit ? "" : "off";
    if (answers[i] === AN[i]) agree++;
  });
  const text = dx < 0.5 ? "accord avec l'Assemblée : " + agree + " sur 10" : dx > PARK - 0.5 ? "votre fiche est rangée" : "la fiche glisse…";
  if (readout.textContent !== text) readout.textContent = text;
}
function flip(i) {
  answers[i] = 1 - answers[i];
  holes[i].setAttribute("d", ring(COL_X[answers[i]], ROW_Y[i], HOLE_R, B_Z + 0.8, P, 24));
  draw(lastT);
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: SLIDE, step: 0.4, rest: SLIDE })}
figure.addEventListener("click", (event) => {
  const box = figure.getBoundingClientRect();
  const vb = figure.viewBox.baseVal;
  const sx = ((event.clientX - box.left) / box.width) * vb.width, sy = ((event.clientY - box.top) / box.height) * vb.height;
  let best = -1, bestD = 1e9;
  ROW_Y.forEach((y, i) => { const [px, py] = iso([CARD.x + CARD.w / 2 + dxNow, y, B_Z], P); const d = Math.hypot(px - sx, py - sy); if (d < bestD) { bestD = d; best = i; } });
  if (best >= 0 && bestD < 40) { flip(best); steer(SLIDE); }
});
stage.addEventListener("keydown", (event) => {
  const n = "1234567890".indexOf(event.key);
  if (n >= 0) { flip(n); steer(SLIDE); }
});
`;

const CSS = `
.lt-glass .iso-top,.lt-glass .iso-fill{fill:color-mix(in srgb,var(--anatomy-green) 22%,var(--anatomy-paper))}
.lt-void{fill:var(--anatomy-shade-0);stroke:var(--anatomy-lo);stroke-width:.6px;vector-effect:non-scaling-stroke}
.lt-hole{fill:var(--anatomy-shade-0);stroke:var(--anatomy-hi);stroke-width:.6px;vector-effect:non-scaling-stroke}
.lt-light{fill:var(--anatomy-green);stroke:none;filter:drop-shadow(0 0 3px var(--anatomy-green));transition:opacity .25s}
.lt-light[data-on="off"]{opacity:0}
.iso-stage svg{cursor:pointer}
`;

writePage({
  here: HERE,
  name: "table-lumineuse",
  title: "La table lumineuse",
  fig: "Fig 4",
  hint: "Cliquez une ligne pour changer de réponse",
  readout: "votre fiche est rangée",
  keys: [
    { mark: "lit", label: "Votre fiche : réponses d'exemple, à changer en cliquant" },
    { mark: "green", label: "Lumière : vous avez répondu comme l'Assemblée a voté" },
    { mark: "raised", label: "Fiche de l'Assemblée : percée du côté gagnant" },
  ],
  caption: "Les dix questions du quiz MonÉlu, chacune liée à un scrutin réel. Les dix textes ont été adoptés (de 247 contre 232 pour la Sécurité sociale 2026 à 335 contre 182 pour la lutte contre les fraudes), donc la fiche de l'Assemblée est percée dans la colonne « pour » à chaque ligne. Le vrai quiz compare aussi vos réponses à celles de chaque député ; ici, la comparaison porte sur le résultat du vote. Touches 1 à 0 : retourner une réponse.",
  svg,
  ariaLabel: "Table lumineuse : touches 1 à 0 pour changer une réponse, flèches pour faire glisser la fiche",
  ariaValue: "Accord avec l'Assemblée sur les dix questions du quiz",
  live,
  css: CSS,
});
