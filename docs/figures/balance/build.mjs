// La balance: how /verify judges a claim. The claim goes on one pan, the scrutins found for it on
// the other; below the similarity floor a pin locks the beam and no verdict is attempted.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, f1, labelPlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth (rag/chain/verify.py, ADR-022)
// MIN_TOP_SIMILARITY = 0.35: below it the LLM is skipped and the verdict is "inverifiable".
// Verdicts: vrai, faux, trompeur, inverifiable. Cited vote_ids are checked against the votes table.
const FLOOR = 0.35;
// Three example claims. The scrutins and their results are real; the similarity values are illustrative.
const CASES = [
  { claim: "« L'Assemblée a adopté l'aide à mourir. »", sim: 0.71, verdict: "vrai", tilt: 0, weights: 1, cite: "VTANR5L17V8280 · adopté 291–241" },
  { claim: "« Les députés ont rejeté le budget 2026 de la Sécu. »", sim: 0.66, verdict: "faux", tilt: 1, weights: 3, cite: "VTANR5L17V4758 · adopté 247–232" },
  { claim: "« Les députés ont voté la semaine de quatre jours. »", sim: 0.22, verdict: "inverifiable", tilt: 0, weights: 0, cite: "aucun scrutin assez proche" },
];
const MAX_TILT = 0.3; // radians, the "faux" end of the scale
const TICKS = [["VRAI", 0], ["", 0.5], ["FAUX", 1]]; // the middle tick is "trompeur"

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 420;
const PLATE = { x: -136, y: -70, w: 272, d: 140, r: 9 };
const PIVOT_Z = 84;
const ARM = 66;
const HANG = 40;
const PAN_R = 17;
const NEEDLE = 26;
const DIAL = [-94, 36];
const DIAL_R = 15;
const DIAL_TOP = 9;

const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, PIVOT_Z + NEEDLE + 8], [-ARM - PAN_R, 0, PIVOT_Z + 6], [ARM + PAN_R, 0, PIVOT_Z + 6]], WIDTH, HEIGHT, { pad: 24, azimuth: 66, elevation: 24 });
const { at, S, L, D, halo } = tools(P);

// ---------------------------------------------------------------- art
function stand() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -18, y: -18, w: 36, d: 36, r: 18 }, 0, 1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.cylinder(0, 0, 18, 0, 5, P, 56, 0.8), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 9, 5, 4, P, 40, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 3.6, 9, PIVOT_Z - 9 - 4, P, 24), { tone: "mid", crease: "none", inner: L(k.sideArc(0, 0, 3.6, 30, P, 16) + k.sideArc(0, 0, 3.6, 60, P, 16), { tone: "faint" }) }));
  out.push(S(k.slabOf({ x: -5, y: -5, w: 10, d: 10, r: 1.5 }, PIVOT_Z - 4, 4, P, 3, 0.5), { tone: "mid" }));
  // the scale plate behind the needle, standing on a bracket on the column
  out.push(S(k.slabOf({ x: -2, y: -9, w: 4, d: 4, r: 0.6 }, PIVOT_Z, 12, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: -26, y: -11, w: 52, d: 2, r: 0.6 }, PIVOT_Z + 12, 16, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  const face = -9; // the plate's front face
  for (const [name, f] of TICKS) {
    const a = f * MAX_TILT;
    const r0 = NEEDLE - 4, r1 = NEEDLE - 0.6;
    const p = (r) => [Math.sin(a) * r, face, PIVOT_Z + Math.cos(a) * r];
    out.push(L(k.segment(p(r0), p(r1), P), { tone: "mid" }));
    const m = k.sideMatrix([Math.sin(a) * (NEEDLE - 7) - name.length * 0.8, face], PIVOT_Z + Math.cos(a) * (NEEDLE - 7), P, "left");
    if (name) out.push(k.faceTextSvg(m, name, { size: 2.4, tone: "mid" }));
  }
  return out.join("");
}

function dial() {
  const [x, y] = DIAL;
  const out = [S(k.slabOf({ x: x - 18, y: y - 18, w: 36, d: 36, r: 3 }, 0, 4, P, 4, 0.6), { tone: "mid" })];
  out.push(S(k.cylinder(x, y, DIAL_R, 4, DIAL_TOP - 4, P, 48, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 1.6, DIAL_TOP, P, 48), { tone: "lo" }));
  const sweep = (Math.PI * 3) / 2, from = -sweep / 2;
  const t = k.radialTicks(x, y, DIAL_R - 1.6, 10, 5, DIAL_TOP, [1, 2.2], P, from, sweep);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  const a = from + sweep * FLOOR;
  out.push(`<path class="iso-line" data-tone="hi" style="stroke-width:1.3" d="${k.onTop([[x + Math.sin(a) * (DIAL_R - 1.6), y - Math.cos(a) * (DIAL_R - 1.6)], [x + Math.sin(a) * (DIAL_R - 6), y - Math.cos(a) * (DIAL_R - 6)]], DIAL_TOP, P)}"/>`);
  out.push(k.faceTextSvg(k.topMatrix([x, y + 7], DIAL_TOP, P, "x"), "SIM 0,35", { size: 2.2, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(x, y, 1.2, DIAL_TOP, P, 12), { tone: "mid" }));
  return out.join("");
}

const lockSvg = () => [
  S(k.slabOf({ x: -2, y: 3.6, w: 4, d: 4, r: 0.6 }, PIVOT_Z - 22, 14, P, 2, 0.3), { tone: "mid", className: "bl-lock" }),
].join("");
const panSvg = () => [S(k.cylinder(0, 0, PAN_R, 0, 3, P, 56, 0.6), { tone: "hi", crease: "lo" }), L(k.ring(0, 0, PAN_R - 2, 3, P, 48), { tone: "faint" })].join("");
const claimSvg = () => S(k.slabOf({ x: -7, y: -5, w: 14, d: 10, r: 1 }, 3, 6, P, 2, 0.4), { tone: "hi", lit: true });
const weightSvg = (i) => `<g data-weight="${i}" opacity="0">${S(k.cylinder(0, 0, 5, 3 + i * 5, 5, P, 24, 0.4), { tone: "mid" })}</g>`;

// ---------------------------------------------------------------- live
const SEG = 6.4;
const LOOP = SEG * CASES.length;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `Une balance. L'affirmation à vérifier va sur le plateau de gauche, les scrutins trouvés pour elle sur celui de droite ; l'aiguille indique vrai, trompeur ou faux. Si aucun scrutin n'atteint une similarité de ${FLOOR}, une goupille bloque le fléau et le verdict est « invérifiable ».`,
  body: [
    basePlate(P, PLATE),
    labelPlate(P, { x: 70, y: 46, w: 46, d: 14, r: 1.5 }),
    dial(),
    `<path data-part="sim" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d=""/>`,
    stand(),
    `<g data-part="lock">${lockSvg()}</g>`,
    `<g data-part="hangers"></g>`,
    `<g data-part="pan-l">${panSvg()}<g data-part="claim" opacity="0">${claimSvg()}</g></g>`,
    `<g data-part="pan-r">${panSvg()}${[0, 1, 2].map(weightSvg).join("")}</g>`,
    `<g data-part="beam"></g>`,
    `<path data-part="needle" class="iso-line" data-tone="lit" style="stroke-width:1.2" d=""/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const CASES = ${JSON.stringify(CASES)};
const SEG = ${SEG}, FLOOR = ${FLOOR}, MAX_TILT = ${MAX_TILT};
const PIVOT_Z = ${PIVOT_Z}, ARM = ${ARM}, HANG = ${HANG}, PAN_R = ${PAN_R}, NEEDLE = ${NEEDLE};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP};
const beam = document.querySelector('[data-part="beam"]');
const needle = document.querySelector('[data-part="needle"]');
const hangers = document.querySelector('[data-part="hangers"]');
const panL = document.querySelector('[data-part="pan-l"]');
const panR = document.querySelector('[data-part="pan-r"]');
const claim = document.querySelector('[data-part="claim"]');
const weights = [...document.querySelectorAll("[data-weight]")];
const lock = document.querySelector('[data-part="lock"]');
const sim = document.querySelector('[data-part="sim"]');
const readout = document.querySelector("[data-readout]");
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
// the camera's view direction, for back-face culling of the tilted beam
const az = (P.azimuth ?? 45) * Math.PI / 180, el = (P.elevation ?? 30) * Math.PI / 180;
const VIEW = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
const rot = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
function beamSvg(a) {
  const hx = ARM + 3, hy = 2.6, hz = 2.2;
  const c = (sx, sy, sz) => { const p = rot([sx * hx, sy * hy, sz * hz], a); return [p[0], p[1], p[2] + PIVOT_Z]; };
  const faces = [
    [[1, 0, 0], [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)], 1],
    [[-1, 0, 0], [c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1)], 0],
    [[0, 1, 0], [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)], 2],
    [[0, -1, 0], [c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)], 0],
    [[0, 0, 1], [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)], "top"],
    [[0, 0, -1], [c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1)], 0],
  ];
  return faces.map(([n, pts, tone]) => {
    const w = rot(n, a);
    if (w[0] * VIEW[0] + w[1] * VIEW[1] + w[2] * VIEW[2] <= 0) return "";
    const d = pathOf(pts.map((p) => iso(p, P)), true);
    const fill = tone === "top" ? 'class="iso-top"' : 'class="iso-shade" data-shade="' + tone + '"';
    return '<path ' + fill + ' d="' + d + '"/><path class="iso-line" data-tone="mid" d="' + d + '"/>';
  }).join("") + '<path class="iso-line" data-tone="hi" d="' + pathOf([c(0, 1.01, -1), c(0, 1.01, 1)].map((p) => iso(p, P))) + '"/>';
}
const endOf = (side, a) => { const p = rot([side * ARM, 0, 0], a); return [p[0], 0, p[2] + PIVOT_Z]; };
let lastBeam = null;
function draw(t) {
  const n = Math.min(CASES.length - 1, Math.floor(t / SEG));
  const C = CASES[n];
  const u = t - n * SEG;
  // claim lands, then the similarity is read, then evidence is weighed
  const s = C.sim * ease((u - 0.9) / 1.4);
  const locked = C.sim < FLOOR && u > 2.3;
  const target = locked ? 0 : C.tilt * MAX_TILT;
  const tau = Math.max(0, u - 2.6);
  const a = target * (1 - Math.exp(-2.2 * tau) * Math.cos(5.5 * tau));
  const key = a.toFixed(4);
  if (key !== lastBeam) { lastBeam = key; beam.innerHTML = beamSvg(a); }
  const L0 = endOf(-1, a), R0 = endOf(1, a);
  panL.setAttribute("transform", translateAlong(P, [L0[0], 0, L0[2] - HANG]));
  panR.setAttribute("transform", translateAlong(P, [R0[0], 0, R0[2] - HANG]));
  const h = [];
  for (const E of [L0, R0]) for (const dy of [-PAN_R * 0.7, PAN_R * 0.7]) h.push(segment(E, [E[0], dy, E[2] - HANG + 3], P));
  hangers.innerHTML = lineSvg(h.join(""), { tone: "lo" });
  const top = rot([0, 0, NEEDLE], a);
  needle.setAttribute("d", pathOf([iso([0, -7.4, PIVOT_Z], P), iso([top[0], -7.4, top[2] + PIVOT_Z], P)]));
  claim.setAttribute("opacity", u > 0.3 ? "1" : "0");
  weights.forEach((w, i) => w.setAttribute("opacity", !locked && i < C.weights && u > 2.4 + i * 0.15 ? "1" : "0"));
  lock.setAttribute("transform", translateAlong(P, [0, 0, locked ? 8 * ease((u - 2.3) / 0.4) : 0]));
  lock.firstElementChild.toggleAttribute("data-lit", locked);
  const sweep = Math.PI * 1.5, sa = -sweep / 2 + sweep * s;
  sim.setAttribute("d", onTop([[DIAL[0] - Math.sin(sa) * 3, DIAL[1] + Math.cos(sa) * 3], [DIAL[0] + Math.sin(sa) * (DIAL_R - 3), DIAL[1] - Math.cos(sa) * (DIAL_R - 3)]], DIAL_TOP + 0.2, P));
  let text = C.claim;
  if (u > 2.3) text = (C.verdict === "inverifiable" ? "invérifiable · similarité " + C.sim.toFixed(2).replace(".", ",") + " < 0,35, aucun appel au modèle" : C.verdict + " · " + C.cite);
  else if (u > 0.9) text = "recherche · similarité " + s.toFixed(2).replace(".", ",");
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: LOOP - 0.01, step: 0.5, rest: SEG - 0.5, stops: CASES.map((_, i) => i * SEG + SEG - 0.6) })}
`;

const CSS = `
.bl-lock[data-lit]>.iso-top,.bl-lock[data-lit]>.iso-fill,.bl-lock[data-lit]>.iso-shade{fill:var(--anatomy-red)}
`;

writePage({
  here: HERE,
  name: "balance",
  title: "La balance",
  fig: "Fig 7",
  hint: "Survolez pour changer d'affirmation",
  readout: CASES[0].claim,
  keys: [
    { mark: "lit", label: "L'affirmation à vérifier, et l'aiguille du verdict" },
    { mark: "raised", label: "Les scrutins retrouvés, comme poids" },
    { mark: "red", label: "La goupille : similarité sous 0,35, pas de verdict" },
  ],
  caption: `Comment le vérificateur de MonÉlu tranche. Il cherche jusqu'à 8 scrutins proches de l'affirmation ; si le plus proche reste sous une similarité de 0,35, il s'arrête et répond « invérifiable » sans interroger le modèle. Sinon le modèle rend vrai, faux ou trompeur, et chaque scrutin cité est vérifié dans la base : un verdict sans citation valable redevient « invérifiable ». Les trois affirmations sont des exemples ; les scrutins et leurs résultats sont réels, les similarités illustratives.`,
  svg,
  ariaLabel: "La balance : flèches gauche et droite pour passer d'une affirmation à l'autre",
  ariaValue: "Trois affirmations : vrai, faux, invérifiable",
  live,
  css: CSS,
});
