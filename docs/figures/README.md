# Figures

Interactive isometric figures that explain how MonÉlu's subject works by drawing it as a
physical machine. They are built with the kit from the
[Anatomy](https://github.com/wheresryan22/anatomy) Claude Code skill (MIT). `_kit/iso-kit.mjs`
is vendored unchanged from upstream commit `dbf697a`, with its licence beside it.

Each figure is a Node build script that writes a self-contained HTML page (no dependencies, no
network). Rebuild after editing:

```sh
node docs/figures/ball-drop/build.mjs           # dark  -> ball-drop.html
node docs/figures/ball-drop/build.mjs --light   # light -> ball-drop-light.html
```

## `ball-drop/` - Machine à scrutin

One real scrutin counted as a ball-drop machine: a rack of 577 balls (one per seat) empties
into three counting trays (pour, contre, abstention; one column of 10 hollows = 10 voices),
a dial reads the pour count against the absolute majority of suffrages exprimés, and a lamp
lights once it is crossed. The balls that stay on the rack are the seats with no vote cast.

- **Data.** `VOTE` at the top of `build.mjs`: scrutin `VTANR5L17V8434` (21 July 2026), the totals
  recorded from the production API in
  `ios/Packages/MonEluFeatures/Tests/MonEluFeaturesTests/Fixtures/vote_detail.json`. Every count,
  the 182 majority and the readout derive from those four numbers.
- **Not the hemicycle.** The rack is a neutral grid and the balls leave in a seeded random order,
  because only totals are used: a seat's position says nothing about how anyone voted. Drawing
  the hemicycle would need the per-deputy positions from `GET /votes/{id}`.
- **Interaction.** Plays an idle loop; hover (or the arrow keys, Home, End) scrubs the count.
  Reduced motion shows the final state.

## The other figures

All share `_shared.mjs` (base plate, page writer, and one timeline loop: idle tour, hover scrub,
arrow keys). Each `build.mjs` names its data source at the top.

| Folder | Figure | Data |
|---|---|---|
| `navette/` | A loom weaving a bill's parcours; the shuttle crosses to the Sénat | `DLR5L17N54372`, the iOS `loi.json` fixture |
| `pointeuse/` | A time clock punching one deputy's card three ways (95 / 88 / 66 %) | the `DeputyScorecard` example in `api/schemas.py`, name removed |
| `table-lumineuse/` | The quiz as punched cards on a light box; click a row to flip an answer | the ten quiz questions (`api/quiz_data.py`); answers are examples |
| `usine/` | The daily 06:00 UTC run as a factory line through three dbt sieves | `ingest_prod.yml`, the transform layers |
| `bibliotheque/` | `/chat` as a pneumatic library: 5 closest cards out of 5,885 | chunk counts and `k = 5` from `rag/`; the question is an example |
| `balance/` | `/verify` as a balance, locked below the 0.35 similarity floor | `rag/chain/verify.py`; real scrutins, illustrative similarities |
| `dominos/` | Cache purge as rows of dominoes; the health tag topples the site | `cacheTags.ts`, `scripts/_cache_scope.py` |
