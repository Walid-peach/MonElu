// Les dominos: how a nightly run purges the site's cache. Each row is one cache family; a run
// knocks down only the rows and the pages it changed - unless it touches the family that carries
// the root layout's health tag, which every page reads.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, labelPlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth
// SCOPE_FAMILY_TAGS (frontend/src/lib/cacheTags.ts): HEALTH_TAG rides in "votes" and nowhere else,
// and the root layout's /health fetch carries it, so purging "votes" invalidates every route.
// scripts/_cache_scope.py: over MAX_ENTITY_IDS = 50 named ids the run falls back to a full purge.
const FAMILIES = ["VOTES", "SUMMARIES", "DEPUTIES", "POSITIONS", "MARTS", "AGENDA"];
const PER_ROW = 8;
const CASES = [
  { text: 'rien de nouveau · aucune page purgée', rows: [], picks: [] },
  { text: "3 résumés · summaries + 3 pages de vote", rows: [1], picks: [2, 4, 6] },
  { text: "nouveaux scrutins · HEALTH_TAG · tout le site", rows: [0, 1, 2, 3, 4, 5], picks: [], health: true },
];

// ---------------------------------------------------------------- world
const WIDTH = 640;
const HEIGHT = 400;
const PLATE = { x: -122, y: -86, w: 214, d: 172, r: 9 };
const ROW_Y = FAMILIES.map((_, r) => -62 + r * 24);
const X0 = -62;
const STEP = 9;
const DOM = { w: 2.4, d: 9, h: 15 };
const TRACK = { x: X0 - 22, w: STEP * PER_ROW + 30 };

const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [X0, ROW_Y[0], 24]], WIDTH, HEIGHT, { pad: 24, azimuth: 52, elevation: 36 });
const { at, S, L, D, halo } = tools(P);

function tracks() {
  const out = [];
  FAMILIES.forEach((name, r) => {
    const y = ROW_Y[r];
    const plan = { x: TRACK.x, y: y - 7, w: TRACK.w, d: 14, r: 2 };
    out.push(S(k.slabOf(plan, 0, 2, P, 3, 0.4), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(plan, 1.6), 2, P, 3), { tone: "faint" }));
    // striker housing at the row's head
    out.push(S(k.slabOf({ x: TRACK.x + 2, y: y - 5, w: 10, d: 10, r: 1.5 }, 2, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(k.faceTextSvg(k.topMatrix([TRACK.x + TRACK.w + 3, y + 1.2], 0, P, "x"), name, { size: 2.8, tone: "mid" }));
  });
  return out.join("");
}
const strikerSvg = () => S(k.slabOf({ x: 0, y: -1.6, w: 8, d: 3.2, r: 0.8 }, 4.4, 2.6, P, 2, 0.3), { tone: "hi", lit: true });

// ---------------------------------------------------------------- live
const SEG = 6.2;
const LOOP = SEG * CASES.length;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "Six rangées de dominos, une par famille de cache du site. Une mise à jour ne fait tomber que les rangées et les pages qu'elle a modifiées ; si elle touche la famille des votes, qui porte l'étiquette lue par toutes les pages, tout tombe.",
  body: [
    basePlate(P, PLATE),
    labelPlate(P, { x: 30, y: 66, w: 46, d: 14, r: 1.5 }),
    tracks(),
    ...FAMILIES.map((_, r) => `<g data-striker="${r}">${strikerSvg()}</g>`),
    `<g data-part="dominos"></g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const CASES = ${JSON.stringify(CASES)};
const ROW_Y = ${JSON.stringify(ROW_Y)}, X0 = ${X0}, GAP_X = ${STEP}, PER_ROW = ${PER_ROW}, DOM = ${JSON.stringify(DOM)}, SEG = ${SEG};
const TRACK_X = ${TRACK.x};
const holder = document.querySelector('[data-part="dominos"]');
const strikers = [...document.querySelectorAll("[data-striker]")];
const readout = document.querySelector("[data-readout]");
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u);
const az = (P.azimuth ?? 45) * Math.PI / 180, el = (P.elevation ?? 30) * Math.PI / 180;
const VIEW = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
// a domino standing at (x, y), tipped by angle a about its bottom edge, toward +x or toward +y
function domino(x, y, a, axis, tall, lit) {
  const hx = DOM.w, hy = DOM.d, h = tall ? DOM.h + 4 : DOM.h;
  const pivot = axis === "x" ? [x + hx / 2, y, 0] : [x, y + hy / 2, 0];
  const P3 = ([px, py, pz]) => {
    const dx = px - pivot[0], dy = py - pivot[1];
    if (axis === "x") return [pivot[0] + dx * Math.cos(a) + pz * Math.sin(a), py, -dx * Math.sin(a) + pz * Math.cos(a)];
    return [px, pivot[1] + dy * Math.cos(a) + pz * Math.sin(a), -dy * Math.sin(a) + pz * Math.cos(a)];
  };
  const R = (n) => P3([pivot[0] + n[0], pivot[1] + n[1], n[2]]).map((v, i) => v - [pivot[0], pivot[1], 0][i]);
  const c = (sx, sy, sz) => P3([x + sx * hx / 2, y + sy * hy / 2, sz ? h + 2 : 2]);
  const faces = [
    [[1, 0, 0], [c(1, -1, 0), c(1, 1, 0), c(1, 1, 1), c(1, -1, 1)], 2],
    [[-1, 0, 0], [c(-1, -1, 0), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, 0)], 0],
    [[0, 1, 0], [c(-1, 1, 0), c(-1, 1, 1), c(1, 1, 1), c(1, 1, 0)], 1],
    [[0, -1, 0], [c(-1, -1, 0), c(1, -1, 0), c(1, -1, 1), c(-1, -1, 1)], 0],
    [[0, 0, 1], [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)], "top"],
  ];
  return '<g class="iso-solid"' + (lit ? " data-lit" : "") + ">" + faces.map(([n, pts, tone]) => {
    const w = R(n);
    if (w[0] * VIEW[0] + w[1] * VIEW[1] + w[2] * VIEW[2] <= 0) return "";
    const d = pathOf(pts.map((p) => iso(p, P)), true);
    return '<path class="' + (tone === "top" ? "iso-top" : "iso-shade") + '"' + (tone === "top" ? "" : ' data-shade="' + tone + '"') + ' d="' + d + '"/><path class="iso-line" data-tone="' + (lit ? "lit" : "mid") + '" d="' + d + '"/>';
  }).join("") + "</g>";
}
let lastKey = "";
function draw(t) {
  const n = Math.min(CASES.length - 1, Math.floor(t / SEG));
  const C = CASES[n];
  const u = t - n * SEG;
  const angles = [];
  ROW_Y.forEach((y, r) => {
    const row = [];
    const chain = C.rows.includes(r);
    for (let i = 0; i < PER_ROW; i++) {
      let a = 0, axis = "x";
      if (chain) {
        const start = 0.9 + (C.health && r ? 0.5 : 0) + i * 0.16;
        const lean = i === PER_ROW - 1 ? 1.5 : 0.98; // each rests on the next, the last lies flat
        a = lean * ease((u - start) / 0.32);
      } else if (r === 0 && C.picks.includes(i)) {
        axis = "y";
        a = 0.95 * ease((u - 0.9 - C.picks.indexOf(i) * 0.25) / 0.4);
      }
      row.push([a, axis]);
    }
    angles.push(row);
    const fire = chain && u > (C.health && r ? 1.2 : 0.6) ? 4 : 0;
    strikers[r].setAttribute("transform", translateAlong(P, [TRACK_X + 4 + fire, y, 0]));
  });
  const key = n + ":" + angles.map((row) => row.map(([a]) => a.toFixed(3)).join(",")).join("|");
  if (key !== lastKey) {
    lastKey = key;
    const parts = [];
    // paint back rows first, and within a row from the head outward
    ROW_Y.forEach((y, r) => angles[r].forEach(([a, axis], i) => parts.push(domino(X0 + i * GAP_X, y, a, axis, r === 0 && i === 0, r === 0 && i === 0))));
    holder.innerHTML = parts.join("");
  }
  const text = u < 0.6 ? "fin de la mise à jour · purge" : C.text;
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: LOOP - 0.01, step: 0.5, rest: SEG * 2 + SEG - 0.5, stops: CASES.map((_, i) => i * SEG + SEG - 0.5) })}
`;

writePage({
  here: HERE,
  name: "dominos",
  title: "Les dominos",
  fig: "Fig 8",
  hint: "Survolez pour changer de mise à jour",
  readout: "fin de la mise à jour · purge",
  keys: [
    { mark: "lit", label: "HEALTH_TAG : lu par la mise en page racine, donc par toutes les pages" },
    { mark: "raised", label: "Une rangée par famille de cache, un domino par page" },
  ],
  caption: "Après chaque mise à jour, MonÉlu ne purge le cache du site que pour ce qui a changé. Une passe sans nouveauté envoie une liste vide et rien ne tombe. Trois résumés réécrits font tomber leur famille et leurs trois pages de vote. Mais la famille des votes porte l'étiquette de santé lue par la mise en page racine, qui invalide tout le site. Au-delà de 50 pages nommées, ou si la passe plante, c'est aussi la purge complète : mieux vaut une journée coûteuse qu'une journée périmée.",
  svg,
  ariaLabel: "Les dominos : flèches gauche et droite pour passer d'une mise à jour à l'autre",
  ariaValue: "Trois mises à jour et ce que chacune purge",
  live,
});
