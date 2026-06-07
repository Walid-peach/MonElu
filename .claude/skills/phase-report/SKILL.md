---
name: phase-report
description: Generates or updates a standalone HTML report for a phase or major update — infers content from PR notes, git log, and code, renders in the MonÉlu navy/red/white visual style, saves to notes/phases/, and opens in the browser. Use as /phase-report <N> or /phase-report <N> <topic>.
---

Generate a self-contained HTML report documenting what was built in a given phase or major update. Follow every instruction below exactly.

## Arguments

- `/phase-report 1` → generate/overwrite `notes/phases/phase1_report.html`
- `/phase-report 3` → generate/overwrite `notes/phases/phase3_report.html`
- `/phase-report 2 rag-upgrade` → save as `notes/phases/phase2_rag-upgrade_report.html`

If no argument is given, ask the user which phase or update to document.

---

## Step 1 — Gather context before writing anything

Run all of these reads before producing a single line of HTML. Do not skip any.

1. `git log --oneline -30` — identify commits relevant to this phase
2. Search `notes/prs/` for PR description files: `ls notes/prs/`. Read every file whose name or content references this phase number or topic. PR notes are the richest source of intent — they contain What / Why / Changes / Risks written at merge time. **Priority: PR notes > git log > code reading.**
3. If the phase involves Airflow DAGs: read all files in `ingestion/dags/`
4. If the phase involves the API: read `api/routers/` and `api/main.py`
5. If the phase involves RAG / semantic search: read `rag/pipeline/` and `rag/chain/`
6. If the phase involves schema changes: read `data/migrations/`
7. If the phase involves CI/CD or infra: read `.github/workflows/` and `docker-compose.yml`
8. If a report already exists for this phase (`notes/phases/phase<N>_report.html`): read it — preserve still-accurate sections and add a "What's new in this update" banner at the very top when overwriting

Only use facts found in these sources. Never invent stats, file names, or behaviour.

---

## Step 2 — Plan the sections

Choose sections from the list below based on what this phase actually built. Skip any section for which there is no real content. Do not add placeholder or future-looking sections.

**Available sections (use in this order):**

1. Header (always)
2. Tagline strip (always)
3. Phase banner (always)
4. "What was built" card grid
5. Architecture / data flow SVG diagram
6. DAG flow diagram (Airflow phases)
7. API endpoint list
8. Database schema cards
9. Chunk breakdown grid (RAG phases)
10. Infrastructure chips row
11. Key design decisions / quirks card grid
12. Footer (always)

---

## Step 3 — Write the HTML

### General rules

- Pure self-contained HTML — no external CSS, no JavaScript, no web fonts
- One file, no imports, everything inline in `<style>`
- `max-width: 1100px` centered main, `padding: 50px 30px 80px`
- No emoji in section `h2` headings — emoji only inside `.card .icon` divs
- Every stat, label, and value must come from Step 1 sources

---

### Color palette — never deviate

```css
:root {
  --navy:      #0d1f3c;   /* page background */
  --navy-mid:  #162c52;   /* section backgrounds, diagram boxes */
  --navy-card: #1e3a6e;   /* cards, schema headers */
  --navy-light:#2a4f8f;   /* blue card top borders */
  --red:       #c8102e;   /* primary accent */
  --red-light: #e63050;   /* hover accents, monospace highlights */
  --white:     #ffffff;
  --muted:     #a8b8d0;   /* secondary text, labels */
  --border:    rgba(255,255,255,0.08);
}
```

Allowed accent colors for specific semantic use only:
- `#7aadff` — GET method tags, info highlights
- `#6fcf6f` — POST / success / RLS enabled
- `#f5a623` — warnings, rate limits
- `#a855f7` — MLflow, evaluation, experimental
- `#4a90d9` — dot indicators (infra chips)

---

### Header

```html
<header>
  <!-- radial gradient ::before overlay (red glow, 12% opacity) -->
  <div class="badge-row">
    <span class="badge live">Phase N — Live</span>      <!-- red pill -->
    <span class="badge phase">Topic — Subtopic</span>   <!-- muted pill -->
  </div>
  <h1>Mon<span>Élu</span></h1>   <!-- span gets --red color -->
  <p class="subtitle">...</p>
  <div class="meta-row">
    <!-- 4–6 .meta-item blocks: .val (big number/word) + .lbl (uppercase label) -->
    <!-- separated by .divider-v (1px vertical line) -->
  </div>
</header>
```

Meta-row stats: pick the 4–6 most meaningful numbers for this phase (deputy count, chunk count, DAG count, test count, endpoint count, embed cost, score, etc.).

---

### Tagline strip

```html
<div class="tagline">
  "Quoted line with a <span>highlighted key phrase</span> in white bold."
</div>
```

Full-width, italic, `--muted` color, white bold `<span>`, `border-top` and `border-bottom` in `--border`.

---

### Phase banner

```html
<div class="phase-banner">
  <!-- border-left: 4px solid var(--red) -->
  <div class="phase-num">N</div>   <!-- large red number -->
  <div class="phase-body">
    <h3>One-line scope summary</h3>
    <p>Key technologies and outcomes, comma-separated.</p>
  </div>
</div>
```

---

### Section headings

```css
section h2 {
  border-left: 4px solid var(--red);
  padding-left: 14px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-size: 1rem;
  font-weight: 700;
}
```

---

### Cards

```html
<div class="card-grid">  <!-- repeat(auto-fit, minmax(210px, 1fr)), gap 16px -->
  <div class="card red"> <!-- border-top: 3px solid var(--red) — use for the primary item -->
    <div class="icon">🔄</div>
    <div class="card-title">LABEL</div>
    <div class="card-val">Value</div>
    <div class="card-desc">Supporting detail in muted text.</div>
  </div>
  <div class="card blue"> <!-- border-top: 3px solid var(--navy-light) — use for supporting items -->
    ...
  </div>
</div>
```

---

### Architecture / data flow SVG diagram

Always place inside a `.diagram-box` (navy-mid background, border, border-radius 16px, overflow-x auto).

```html
<div class="diagram-box">
  <svg viewBox="0 0 960 240" xmlns="http://www.w3.org/2000/svg"
       style="width:100%;max-width:960px;display:block;margin:auto;">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#a8b8d0"/>
      </marker>
    </defs>
    <!-- Boxes: fill="#1e3a6e" stroke="#2a4f8f" for neutral, stroke="#c8102e" for key components -->
    <!-- Labels: fill="#a8b8d0" font-size="10" font-family="monospace" for category labels -->
    <!-- Values: fill="white" font-weight="bold" for primary text -->
    <!-- Arrows: stroke="#a8b8d0" stroke-width="1.5" marker-end="url(#arr)" -->
    <!-- Arrow labels: fill="#a8b8d0" font-size="9" -->
  </svg>
</div>
```

Rules for SVG:
- Use `viewBox="0 0 960 H"` where H is 200–300 depending on complexity
- All boxes: `rx="10"` for main boxes, `rx="8"` for sub-boxes
- Category label above each box in `font-family="monospace"` uppercase, `font-size="9"` or `"10"`, `fill="#a8b8d0"`
- Primary text inside boxes: `fill="white"` `font-weight="bold"` or `"600"`
- Use dashed horizontal lines (`stroke-dasharray="5,4"`) to separate logical sections (e.g. index build vs. query path)

---

### DAG step flow (Airflow phases)

Use a `.rag-steps` grid (same pattern as RAG pipeline steps):

```html
<div class="rag-steps">  <!-- grid, auto-fit minmax(160px,1fr), gap 2px -->
  <div class="rag-step"> <!-- navy-card bg, relative positioned -->
    <!-- ::after pseudo adds "→" between steps, hidden on mobile -->
    <div class="s-icon">⚙️</div>
    <div class="s-label">STEP LABEL</div>
    <div class="s-name">Task name</div>
    <div class="s-detail">Operator · key config detail</div>
  </div>
</div>
```

---

### API endpoint list

```html
<div class="endpoint-list">
  <div class="endpoint">
    <!-- grid: auto auto 1fr auto — method | path | desc | tag -->
    <span class="method get">GET</span>   <!-- or .post -->
    <span class="path">/route</span>
    <span class="ep-desc">Description with inline <code>params</code>.</span>
    <span class="ep-tag">tag</span>       <!-- .ep-tag.rate for rate-limited -->
  </div>
</div>
```

---

### Database schema cards

```html
<div class="schema-grid">  <!-- auto-fit minmax(240px,1fr) -->
  <div class="schema-card">
    <div class="schema-header">
      <span class="table-name">table_name</span>
      <span class="row-count">N rows</span>   <!-- red-light color -->
    </div>
    <div class="schema-fields">
      <div class="field-row">
        <span class="field-name">column</span>
        <span class="field-type">TYPE</span>        <!-- muted -->
        <!-- or field-note for PK/FK/special — #7aadff -->
      </div>
    </div>
  </div>
</div>
```

---

### Chunk breakdown grid (RAG)

```html
<div class="chunk-grid">  <!-- auto-fit minmax(175px,1fr) -->
  <div class="chunk-card">
    <div class="c-type">chunk_type</div>    <!-- monospace, red-light -->
    <div class="c-count">N</div>            <!-- large bold number -->
    <div class="c-desc">One-line description.</div>
  </div>
</div>
```

---

### Infrastructure chips

```html
<div class="infra-row">
  <div class="infra-chip">
    <div class="dot dot-red"></div>      <!-- dot colors: red/blue/green/orange/purple -->
    <strong>Service name</strong> — role description
  </div>
</div>
```

---

### Footer

```html
<footer>
  MonÉlu · Phase N — Topic · <span>monelu-production.up.railway.app</span><br/>
  Every vote. Every deputy. In plain French.
</footer>
```

`footer span` gets `color: var(--red)`.

---

## Step 4 — Save and open

- Write to `notes/phases/phase<N>_report.html` (or `notes/phases/phase<N>_<topic>_report.html` if a topic was given)
- Run `open <filepath>` to open in the browser immediately after writing
- Confirm the file path to the user in one line
