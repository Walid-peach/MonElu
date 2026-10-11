// Shared helpers for the MonÉlu figures: drawing shorthands, the base plate, the page writer
// and one timeline loop (idle tour, hover scrub, keyboard) that every figure drives with draw(t).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./_kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const kitScript = () => readFileSync(join(HERE, "_kit/iso-kit.mjs"), "utf8").replace(/^export /gm, "");
export const theme = process.argv.includes("--light") ? "light" : "dark";
export const f1 = (n) => Math.round(n * 10) / 10;

export function tools(P) {
  const at = (point) => k.iso(point, P);
  return {
    at,
    S: (paths, style) => k.solidSvg(paths, style),
    L: (d, style) => k.lineSvg(d, style),
    D: (points, style) => k.dotsSvg(points, style),
    byDepth: (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P)),
    halo: (plan, blur = 4) => `<path class="iso-halo" d="${k.haloOf(Math.min(plan.w, plan.d) > 8 ? k.insetPlan(plan, 2) : plan, 0, 1, P)}" style="filter:blur(${blur}px)"/>`,
  };
}

export function basePlate(P, PLATE, { h = 12, foot = 5 } = {}) {
  const { S, L, D, at, byDepth } = tools(P);
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -h - foot, h, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, -h - foot, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -h - foot + 1.6, foot - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -h, h, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

// A small plate with three rule lines standing for printed text.
export function labelPlate(P, label, z = 0) {
  const { S, L, D, at } = tools(P);
  const t = z + 0.8;
  return [
    S(k.slabOf(label, z, 0.8, P, 4), { tone: "lo", crease: "none" }),
    L(k.planOutline(k.insetPlan(label, 1.6), t, P, 3), { tone: "faint" }),
    ...[[5, 0.6], [8, 0.82], [11, 0.4]].map(([dy, share]) =>
      L(k.lineOnTop([label.x + 5, label.y + dy], [label.x + 5 + (label.w - 10) * share, label.y + dy], t, P), { tone: "lo", free: true }),
    ),
    D([at([label.x + 2.6, label.y + label.d / 2, t]), at([label.x + label.w - 2.6, label.y + label.d / 2, t])], { size: 0.45 }),
  ].join("");
}

// One loop for every figure. The page defines draw(t) (a pure function of the clock) before this.
// Tour: t runs 0..LOOP and wraps. Hover maps the pointer across the figure onto [SCRUB_FROM, SCRUB_TO].
// Keys: arrows step by STEP (Shift x4), Home/End jump to the ends. Reduced motion rests on REST.
export function timelineLive({ loop, scrubFrom = 0, scrubTo, step = 0.5, rest = scrubTo, stops = null }) {
  return `
const LOOP = ${loop}, SCRUB_FROM = ${scrubFrom}, SCRUB_TO = ${scrubTo}, STEP = ${step}, REST = ${rest};
const STOPS = ${JSON.stringify(stops)};
const stage = document.querySelector(".iso-stage");
const figure = stage.querySelector("svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clampT = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let t = still.matches ? REST : 0, target = t, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { target = (target + dt) % LOOP; t = target; }
  else t = still.matches ? target : t + (target - t) * (1 - Math.exp(-dt / 0.22));
  if (!touring && Math.abs(target - t) < 0.002) t = target;
  draw(t);
  const settled = !touring && t === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  target = clampT(next, SCRUB_FROM, SCRUB_TO);
  clearTimeout(idle);
  idle = setTimeout(() => { if (!still.matches) { touring = true; target = t; run(); } }, 3600);
  run();
};
window.__steer = steer;
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const box = figure.getBoundingClientRect();
  const share = clampT(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1);
  steer(SCRUB_FROM + share * (SCRUB_TO - SCRUB_FROM));
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (STOPS) {
    const here = STOPS.reduce((best, s, i) => (Math.abs(s - target) < Math.abs(STOPS[best] - target) ? i : best), 0);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") to = STOPS[Math.min(STOPS.length - 1, here + 1)];
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = STOPS[Math.max(0, here - 1)];
  } else {
    const s = event.shiftKey ? STEP * 4 : STEP;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + s;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - s;
  }
  if (event.key === "Home") to = SCRUB_FROM;
  if (event.key === "End") to = SCRUB_TO;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
draw(t);
`;
}

export const BASE_CSS = `
.iso-stage{touch-action:pan-y;outline:none}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (max-width:560px){.iso-plate{overflow:hidden}.iso-stage .iso-svg{width:124%;margin-left:-12%}}
`;

export function writePage({ here, name, title, fig, hint, readout, keys, caption, svg, ariaLabel, ariaValue, live, css = "" }) {
  const body = k.plateHtml({
    fig,
    title,
    hint,
    readout,
    keys,
    caption,
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="${ariaLabel}" aria-valuetext="${ariaValue}">${svg}</div>`,
  });
  const html = k
    .pageHtml({ title, theme, body, script: kitScript() + live, width: 720 })
    .replace('<html lang="en">', '<html lang="fr">')
    .replace("</style>", `${BASE_CSS}${css}</style>`);
  const out = theme === "light" ? `${name}-light.html` : `${name}.html`;
  writeFileSync(join(here, out), `${html}\n`);
  console.log("wrote", out, `(${Math.round(html.length / 1024)} KB)`);
}
