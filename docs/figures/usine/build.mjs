// L'usine à données: the daily production run as a factory line. Crates of AN open data ride
// a conveyor through the ingestion arch, fall through three dbt sieves and reach the API spout.
//   node build.mjs [--light]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../_kit/iso-kit.mjs";
import { basePlate, f1, labelPlate, timelineLive, tools, writePage } from "../_shared.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- truth (CLAUDE.md, ingest_prod.yml)
const RUN = "06:00 UTC, du lundi au vendredi";
const STAGES = [
  ["AN open data", "archives ZIP du portail de l'Assemblée"],
  ["ingestion", "lecture, contrôle, upsert dans Postgres"],
  ["staging", "vues typées sur les tables brutes"],
  ["intermediate", "logique métier"],
  ["marts", "tables prêtes pour l'analyse"],
  ["API", "FastAPI sur Railway, puis le site et l'app iPhone"],
];

// ---------------------------------------------------------------- world
const WIDTH = 660;
const HEIGHT = 400;
const PLATE = { x: -176, y: -70, w: 352, d: 150, r: 9 };
const BELT = { x: -126, y: -12, w: 150, d: 24, r: 2 };
const BELT_Z = 34;
const ARCH_X = -60;
const TRAYS = [
  { x: 30, z: 26, mesh: 7 },
  { x: 74, z: 18, mesh: 5 },
  { x: 118, z: 10, mesh: 3.5 },
];
const TRAY_W = 40;
const TRAY_D = 30;
const CRATES = { x: -166, y: -14, w: 30, d: 28, r: 1.5 };
const SPOUT = [166, 0];
const OUTS = [
  { key: "web", x: 120, y: 50, w: 34, d: 6, h: 22 },
  { key: "ios", x: 162, y: 50, w: 9, d: 4, h: 18 },
];
const CLOCK = [-140, 48];

const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [ARCH_X, 0, BELT_Z + 30], [CRATES.x, CRATES.y, 52]], WIDTH, HEIGHT, { pad: 22, azimuth: 58, elevation: 34 });
const { at, S, L, D, byDepth, halo } = tools(P);

// ---------------------------------------------------------------- art
function crates() {
  const out = [halo(CRATES, 4)];
  [0, 1, 2].forEach((i) => {
    const c = { x: CRATES.x + (i % 2) * 2, y: CRATES.y + i, w: CRATES.w - 2, d: CRATES.d - 2, r: 1.2 };
    const z = i * 14;
    out.push(S(k.slabOf(c, z, 13, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(c, z + 6.5, P, 3), { tone: "faint" }) }));
    out.push(k.faceTextSvg(k.topMatrix([c.x + 4, c.y + c.d - 4], z + 13, P, "x"), i === 2 ? "AN · ZIP" : "", { size: 2.8, tone: "mid" }));
  });
  // a chute from the top crate onto the belt
  out.push(S(k.slabOf({ x: CRATES.x + CRATES.w - 2, y: -6, w: BELT.x - CRATES.x - CRATES.w + 6, d: 12, r: 1 }, BELT_Z + 6, 2, P, 2, 0.3), { tone: "lo" }));
  return out.join("");
}

function belt() {
  const out = [];
  for (const x of [BELT.x + 8, BELT.x + BELT.w - 8])
    for (const y of [BELT.y + 3, BELT.y + BELT.d - 7]) out.push(S(k.slabOf({ x: x - 2, y, w: 4, d: 4, r: 0.8 }, 0, BELT_Z - 4, P, 2, 0.3), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(BELT, BELT_Z - 4, 4, P, 4, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BELT, 2), BELT_Z, P, 3), { tone: "faint" }));
  const ticks = [];
  for (let x = BELT.x + 6; x < BELT.x + BELT.w - 4; x += 6) ticks.push(k.lineOnTop([x, BELT.y + 2], [x, BELT.y + BELT.d - 2], BELT_Z, P));
  out.push(L(ticks.join(""), { tone: "faint" }));
  return out.join("");
}

function arch(front) {
  const out = [];
  const posts = front ? [BELT.y + BELT.d + 2] : [BELT.y - 8];
  for (const y of posts) out.push(S(k.slabOf({ x: ARCH_X - 4, y, w: 8, d: 6, r: 1 }, 0, BELT_Z + 22, P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: ARCH_X - 4, y, w: 8, d: 6, r: 1 }, 20, P, 3), { tone: "faint" }) }));
  if (front) {
    const beam = { x: ARCH_X - 6, y: BELT.y - 9, w: 12, d: BELT.d + 18, r: 1.5 };
    out.push(S(k.slabOf(beam, BELT_Z + 22, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(beam, 2), BELT_Z + 29, P, 3), { tone: "faint" }));
  }
  return out.join("");
}
const lampSvg = () => S(k.cylinder(ARCH_X, 0, 3.4, BELT_Z + 29, 3, P, 20, 0.4), { tone: "hi", crease: "lo", className: "us-lamp" });

function trays() {
  const out = [];
  TRAYS.forEach((t, i) => {
    const plan = { x: t.x, y: -TRAY_D / 2, w: TRAY_W, d: TRAY_D, r: 2 };
    for (const [x, y] of [[t.x + 4, -TRAY_D / 2 + 4], [t.x + TRAY_W - 4, -TRAY_D / 2 + 4], [t.x + 4, TRAY_D / 2 - 4], [t.x + TRAY_W - 4, TRAY_D / 2 - 4]])
      out.push(S(k.cylinder(x, y, 1.8, 0, t.z - 3, P, 14), { tone: "mid", crease: "none" }));
    out.push(halo(plan, 3));
    out.push(S(k.slabOf(plan, t.z - 3, 3, P, 3, 0.5), { tone: "mid" }));
    const mesh = k.insetPlan(plan, 3);
    out.push(S(k.slabOf(mesh, t.z, 0.3, P, 3), { tone: "hi", crease: "none", flat: true }));
    const cols = Math.floor(mesh.w / t.mesh), rows = Math.floor(mesh.d / t.mesh);
    out.push(D(k.dotGrid(mesh.x + (mesh.w - (cols - 1) * t.mesh) / 2, mesh.y + (mesh.d - (rows - 1) * t.mesh) / 2, cols, rows, t.mesh, t.z + 0.3, P), { size: 0.55, tone: "mid" }));
    out.push(k.faceTextSvg(k.topMatrix([plan.x + 1.4, plan.y + plan.d - 0.6], t.z, P, "x"), ["STAGING", "INTERMED.", "MARTS"][i], { size: 2.2, tone: "mid" }));
  });
  return out.join("");
}

function spout() {
  const out = [];
  const [x, y] = SPOUT;
  out.push(S(k.slabOf({ x: x - 6, y: y - 6, w: 12, d: 12, r: 2 }, 0, 6, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3.2, 6, 10, P, 18), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 7, 14, 3, P, 28), { tone: "hi", crease: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 3], 17, P, "x"), "API", { size: 3, tone: "mid", anchor: "middle" }));
  return out.join("");
}

function outputs() {
  const out = [];
  for (const o of OUTS) {
    const plan = { x: o.x - o.w / 2, y: o.y - o.d / 2, w: o.w, d: o.d, r: o.key === "ios" ? 1.6 : 1 };
    out.push(halo(plan, 3));
    if (o.key === "web") out.push(S(k.slabOf({ x: o.x - 4, y: o.y - 5, w: 8, d: 10, r: 1 }, 0, 3, P, 2), { tone: "mid" }));
    out.push(S(k.slabOf(plan, o.key === "web" ? 3 : 0, o.h, P, 3, 0.4), { tone: "mid", className: `us-out us-${o.key}` }));
    // the cable from the spout's base to the device, along the floor
    out.push(k.wireSvg(at([SPOUT[0] - 6, SPOUT[1] + 4, 0.2]), at([o.x, o.y - o.d / 2, 0.2]), { via: [at([SPOUT[0] - 6, o.y - 14, 0.2]), at([o.x, o.y - 14, 0.2])], tone: "lo" }));
  }
  return out.join("");
}

function clock() {
  const [x, y] = CLOCK;
  return [
    S(k.cylinder(x, y, 14, 0, 4, P, 48, 0.6), { tone: "mid" }),
    S(k.cylinder(x, y, 12, 4, 2, P, 48, 0.5), { tone: "hi", crease: "lo" }),
    L(k.radialTicks(x, y, 12, 12, 3, 6, [1.2, 2.4], P).minor, { tone: "lo" }),
    L(k.radialTicks(x, y, 12, 12, 3, 6, [1.2, 2.4], P).major, { tone: "mid" }),
    // 06:00: hour hand on the six, minute hand on the twelve
    `<path class="iso-line" data-tone="hi" style="stroke-width:1.1" data-free="end" d="${k.lineOnTop([x, y], [x, y + 6], 6, P)}"/>`,
    `<path class="iso-line" data-tone="hi" data-free="end" d="${k.lineOnTop([x, y], [x, y - 9], 6, P)}"/>`,
    L(k.ring(x, y, 1.2, 6, P, 12), { tone: "mid" }),
  ].join("");
}

// ---------------------------------------------------------------- motion model
// One parcel's path: belt, ingestion arch, drop onto each sieve, slide across, spout.
const PATH = [
  [BELT.x + 4, 0, BELT_Z + 2],
  [BELT.x + BELT.w - 2, 0, BELT_Z + 2],
  [TRAYS[0].x + 6, 0, TRAYS[0].z + 2],
  [TRAYS[0].x + TRAY_W - 2, 0, TRAYS[0].z + 2],
  [TRAYS[1].x + 6, 0, TRAYS[1].z + 2],
  [TRAYS[1].x + TRAY_W - 2, 0, TRAYS[1].z + 2],
  [TRAYS[2].x + 6, 0, TRAYS[2].z + 2],
  [TRAYS[2].x + TRAY_W - 2, 0, TRAYS[2].z + 2],
  [SPOUT[0], SPOUT[1], 19],
];
const PARCELS = 6;
const GAP = 1.1; // seconds between parcels
const TRIP = 7.0; // seconds for one parcel's whole path
const LOOP = GAP * (PARCELS - 1) + TRIP + 2.5;
const parcelSvg = (i) => `<g data-parcel="${i}">${S(k.slabOf({ x: -3, y: -3, w: 6, d: 6, r: 0.8 }, 0, 5, P, 2, 0.3), { tone: "hi", crease: "lo", lit: i === 0 })}</g>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `Une usine à données. Chaque jour de semaine à 6 h UTC, des caisses d'archives de l'Assemblée passent par l'arche d'ingestion, traversent trois tamis dbt, staging, intermediate et marts, puis sortent par le robinet de l'API vers le site et l'application iPhone.`,
  body: [
    basePlate(P, PLATE),
    labelPlate(P, { x: -100, y: 52, w: 48, d: 14, r: 1.5 }),
    clock(),
    crates(),
    arch(false),
    belt(),
    trays(),
    `<g data-part="parcels">${Array.from({ length: PARCELS }, (_, i) => parcelSvg(i)).join("")}</g>`,
    arch(true),
    `<g data-part="lamp">${lampSvg()}</g>`,
    spout(),
    outputs(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const PATH = ${JSON.stringify(PATH.map((p) => p.map(f1)))};
const STAGES = ${JSON.stringify(STAGES)};
const PARCELS = ${PARCELS}, GAP = ${GAP}, TRIP = ${TRIP}, ARCH_X = ${ARCH_X};
const parcels = [...document.querySelectorAll("[data-parcel]")];
const lamp = document.querySelector(".us-lamp");
const outs = [...document.querySelectorAll(".us-out")];
const readout = document.querySelector("[data-readout]");
// cumulative lengths so parcels move at one speed along the belt and the trays, faster when falling
const seg = PATH.slice(1).map((p, i) => { const q = PATH[i]; const fall = q[2] - p[2] > 4; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * (fall ? 0.5 : 1); });
const total = seg.reduce((a, b) => a + b, 0);
function pointAt(u) {
  let d = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = Math.min(1, d / seg[i]); const a = PATH[i], b = PATH[i + 1];
      const drop = a[2] - b[2] > 4;
      const g = drop ? f * f : f; // a fall accelerates
      return [[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * g], i];
    }
    d -= seg[i];
  }
}
const STAGE_OF = [1, 1, 2, 2, 3, 3, 4, 4, 5];
function draw(t) {
  let lead = -1, lit = false, delivered = 0;
  parcels.forEach((el, i) => {
    const u = (t - i * GAP) / TRIP;
    if (u <= 0 || u >= 1) { el.setAttribute("opacity", "0"); if (u >= 1) delivered++; return; }
    const [p, s] = pointAt(u);
    el.setAttribute("opacity", "1");
    el.setAttribute("transform", translateAlong(P, p));
    if (Math.abs(p[0] - ARCH_X) < 8 && s <= 1) lit = true;
    lead = Math.max(lead, STAGE_OF[s] - (p[0] < ARCH_X ? 1 : 0));
  });
  if (lamp) lit ? lamp.setAttribute("data-on", "") : lamp.removeAttribute("data-on");
  outs.forEach((o) => (delivered ? o.setAttribute("data-on", "") : o.removeAttribute("data-on")));
  const stage = delivered === PARCELS ? 5 : Math.max(0, lead);
  const text = t < 0.3 ? "6 h 00 UTC · le cron démarre" : delivered === PARCELS ? "publié · site et app à jour" : STAGES[stage][0] + " · " + STAGES[stage][1];
  if (readout.textContent !== text) readout.textContent = text;
}
${timelineLive({ loop: LOOP, scrubFrom: 0, scrubTo: GAP * (PARCELS - 1) + TRIP + 0.2, step: 0.6 })}
`;

const CSS = `
.us-lamp[data-on]>.iso-top,.us-lamp[data-on]>.iso-fill{fill:var(--anatomy-green)}
.us-out[data-on]>.iso-shade[data-shade="2"],.us-out[data-on]>.iso-shade[data-shade="3"]{fill:color-mix(in srgb,var(--anatomy-green) 45%,var(--anatomy-paper))}
`;

writePage({
  here: HERE,
  name: "usine",
  title: "L'usine à données",
  fig: "Fig 5",
  hint: "Survolez pour suivre une caisse",
  readout: "6 h 00 UTC · le cron démarre",
  keys: [
    { mark: "lit", label: "La première caisse de la journée" },
    { mark: "raised", label: "Trois tamis dbt, du plus gros au plus fin" },
    { mark: "green", label: "La lampe d'ingestion, puis les écrans servis" },
  ],
  caption: `La mise à jour quotidienne de MonÉlu, ${RUN}. Les scripts d'ingestion lisent les archives ZIP de l'Assemblée, rejettent un lot si plus de 5 % des fiches ne se lisent pas, puis écrivent dans Postgres sans rien supprimer. dbt raffine ensuite ces tables en trois couches, contrôlées par des tests à chaque passage. L'API sert les marts au site et à l'app iPhone ; le cache du site est purgé seulement pour ce qui a changé.`,
  svg,
  ariaLabel: "L'usine à données : flèches gauche et droite pour faire avancer les caisses",
  ariaValue: "La mise à jour quotidienne, de l'Assemblée à l'écran",
  live,
  css: CSS,
});
