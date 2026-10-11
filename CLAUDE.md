# CLAUDE.md

Working brief for Claude Code sessions in this repo. Read it fully before changing anything. The full documentation is indexed in `docs/README.md`; this file keeps the rules and points there for detail.

## What this project is

An FFXIV item level sync calculator and gear optimizer, shipped as **one self-contained HTML page** (no server). Source is ES modules; esbuild bundles them, with Alpine.js (the only runtime dependency) and the data, into a single `dist/index.html` that opens from `file://`. It answers: given a sync cap (item level) and a job, what do the stats on a piece become, and which real gear combination maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, ...)?

The owner plays Sage and raids with Minimum Item Level and no Echo, so the sync cap they care about is **item level 123**. The tool is deliberately **job-agnostic**: all 22 combat jobs, cap and synced level are user settings. Do not reintroduce Sage-only or Spell-Speed-only wording, presets, or logic.

Current state: feature-complete first version. The next stage is feature expansion; see `docs/roadmap.md`.

## Layout

```
src/
  index.html          page markup with Alpine directives; build markers <!-- STYLES --> and <!-- SCRIPT -->
  styles.css          all CSS (tokenized light/dark themes)
  main.js             entry: restore saved state, register store + components, save effect, Alpine.start()
  core/               pure logic, no DOM, importable from Node
    constants.js      slots, stat keys, profiles, JOBS, slot percents, substat shares
    item-format.json  shared data format (job bit order, raw stat order, slot codes), read by JS and the Python generators
    tables.js         IL / PG / ITEMS / DATA_SOURCE re-exports, MAX_ILVL, MAX_REAL, footer label
    job-context.js    makeJobContext(jobId): frozen per-job description; slotActive, ilWeight, statColumn
    formulas.js       rounding, slot budgets, buildPiece, capsFor, syncStats, statDerivation, predictRaw
    speed.js          speedParams, gcdFor, dotMult, gcdTiers
    items.js          pool items (mkItem, ids), genericItems, database rows (parseRow, dbStats, browseItems)
    optimizer/        candidates.js (vectors, scores, dominance) / search.js (branch-and-bound) / index.js (optimize)
    validation.js     accuracy against every real item + Wiki 475 caps (shared by page and tests)
  ui/
    state.js          saved-state shape, defaults, per-job reset, restoreState (repairs saved data), localStorage
    store.js          Alpine.store('app'): state + actions (setJob, tabs, pool edits)
    helpers.js        formatting, stat cells, number-field binding, debounced effects
    chart.js          budget chart SVG
    components/       one Alpine.data() per page area (page/settings, piece-lab, sync-caps, validation-panel,
                      browser, pool, advanced, optimizer)
  data/
    item-level.js     GENERATED: ItemLevel budget table (IL), ParamGrow level data (PG), DATA_SOURCE
    items.js          GENERATED: real gear database (ITEMS, 17,579 rows, ~1.4 MB)
scripts/
  build/build.mjs     esbuild bundle + inline into dist/index.html
  build/dev.mjs       watch + local server
  data/fetch.py       sparse-clone the 6 needed CSVs from xivapi/ffxiv-datamining into data/
  data/item_format.py loads item-format.json, reads CSVs
  data/gen_item_level.py  ItemLevel.csv + ParamGrow.csv -> src/data/item-level.js
  data/gen_items.py   Item.csv + EquipSlotCategory.csv + ClassJobCategory.csv -> src/data/items.js
  data/provenance.py  source commit + file headers
  data/regen.py       both generators, then the build
tests/
  unit/*.test.js      node:test, one file per core module, plus state.test.js (npm test)
  data/               Python generator tests on fixture CSVs (npm run test:py)
  e2e/smoke.py        Playwright browser smoke test (npm run smoke)
docs/                 see docs/README.md; style guide in docs/diagrams/STYLE.md
```

`dist/`, `data/` and `tests/e2e/out/` are gitignored. **Never hand-edit `src/data/*.js`**; change the generators and re-run `npm run regen`.

## Commands (run from the repo root)

Requires Node 22+ (`npm install` once) and Python 3.9+ (data pipeline, generator tests and smoke test; `python -m pip install -r requirements-dev.txt`, then `python -m playwright install chromium`).

- `npm run build` : assemble `dist/index.html`
- `npm run dev` : rebuild on change and serve `dist/` locally
- `npm test` : unit tests; every test must pass
- `npm run test:py` : generator tests
- `npm run smoke` : browser test; must print `no errors`
- `npm run lint` / `npm run format` / `npm run format:check` : Biome (JS/JSON/CSS) and Ruff (Python)
- `npm run check` : lint, format check, build, test, test:py, smoke
- `npm run fetch` / `npm run regen` : refresh game data after a patch (`docs/data-pipeline.md` section 9)

Always run `npm run check` before telling the owner something works. For UI changes also open `dist/index.html` and look at it at desktop width and ~400 px phone width.

## Architecture

Details and diagrams: `docs/architecture.md`.

Core functions never read global job state. Everything job-dependent comes from a **JobContext** passed as the first argument (`makeJobContext('SGE')`, cached and frozen). It holds role-neutral stat keys and how they map for the job: `main` (Str/Dex/Int/Mind), `vit`, `crit`, `det`, `dh`, `spd` (Skill/Spell Speed), `spec` (Piety/Tenacity/none), plus `stats`, `substats`, `label`, `short`, `weaponMode`, `slotPct`, `activeSlotTypes`, `vitFactor`. Raw database rows use the 12-stat order `str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps` and are converted with `dbStats(job, st)`. Do not use job-specific keys (`sps`, `piety`, `mind`) in shared logic or UI; map through the context.

UI: `Alpine.store('app')` holds the saved state plus `jobCtx` (the current context) and `poolVersion` (bumped on every pool change). Each component recomputes a `view` object in an effect from the store; templates only display it. Keep large data (the item database, browse results) out of reactive state (plain or frozen objects). The optimizer and ceiling run debounced (120 ms) and only while the Optimizer tab is open; the gear browser only while the Item pool tab is open. Persisting to localStorage is one debounced effect in `main.js`. Dynamic `<select>`s render options with `x-for` and mark the current one with `:selected`.

## The model

Full derivation, worked example and verified/assumed table: `docs/math.md`. Evidence: `docs/validation.md`. Key rules:

- Item level is a row of the `ItemLevel` budget table. A stat on a piece = `round( round(budget x slotPercent/1000) x share )`, rounded **twice**. Slot percents: 2H weapon 140, 1H 100, off-hand 40, head/hands/feet 85, body/legs 135, accessories 67. No belt slot. Vitality for Int/Mind jobs x 0.9.
- Sync caps each stat on a piece above the cap at the full-share value of a same-slot piece at the cap; pieces at or below are untouched. At 123: head/hands/feet 29 (main 30), body/legs 47 (48), accessories 23 (24), 2H weapon 48 (50). Reproduces the Wiki's item level 475 caps exactly.
- GCD and DoT/HoT tick scaling follow AkhMorning's formulas with `ParamGrow` constants.

Empirical or assumed (say so in the UI and in answers; never present as fact):
- The 100% / 70% / 20% substat shares are a **measured pattern, not in the game files**: 97.1 to 99.6% exact per item level band, 98.7% overall. The Item pool and Optimizer use real item stats and do not depend on them; only Piece lab, the generator and hand-fill do.
- The main stat / Vitality clamp under sync, and lower-ranked substats clamping to the full-share cap, are inferred, not confirmed in game.
- Melds are ignored on synced-down gear; substats are never scaled up.

## Data

Full rules, counts and provenance: `docs/data-pipeline.md`. Key facts:

- Source: xivapi/ffxiv-datamining CSVs (straight client exports; nothing derived by the miners). The commit is recorded in both generated files and shown in the page footer.
- `gen_items.py` keeps gear with a slot (no belt, no soul crystal), a combat-job `ClassJobCategory`, item level >= 100 and at least one stat. **HQ bonus only when `CanBeHq`**. `IsUnique` is carried so the optimizer allows only one copy of a Unique ring.
- Job bit order, raw stat order and slot codes live in `src/core/item-format.json` only; a test checks the page against it. Changing it means regenerating the data.
- The highest real item level is **795** (`MAX_REAL`, computed from the database). The `ItemLevel` sheet runs to 920 but rows 796 to 920 carry no gear, so item level inputs cap at `MAX_REAL`. Do not claim those rows are "placeholders" or "intentional"; the data only shows they are unused.
- After a patch: `npm run fetch`, `npm run regen`, `npm run check`. Which test numbers may move and which must not is in `docs/data-pipeline.md` section 9 and `docs/testing.md` section 6.

## Job mapping

tank (Str, Skill Speed, Tenacity): PLD WAR DRK GNB. healer (Mind, Spell Speed, Piety): WHM SCH AST SGE. melee (Str, Skill Speed): MNK DRG SAM RPR. dex (Dex, Skill Speed): NIN VPR BRD MCH DNC. caster (Int, Spell Speed): BLM SMN RDM PCT BLU. PLD uses a 1H weapon (100%) plus a shield (off-hand 40%); every other job uses a 2H weapon (140%), which counts twice toward average item level.

## Optimizer

Full description, proofs and measurements: `docs/optimizer.md`.

Depth-first branch and bound over slots, after dominance pruning, with one integer score per item that encodes the lexicographic order (target, tiebreak 1, tiebreak 2). The weights are derived from the pool so a lower key can never outweigh a higher one; `optimize()` throws if a score could exceed 2^53. An item is pruned only when the items that dominate it have enough copies to fill every slot of its type (2 for rings), and pruning is off when stat maximums are set. Handles two rings, Unique items, and an optional average-item-level requirement. Node limit 700k in the UI (150k per ceiling run); the result reports truncation, the ceiling table does not.

Timing (Node 22, full 2,033-item Sage pool): one run takes about 15 to 20 ms; the 14-run ceiling table about 0.23 s. If you change scoring, pruning or the search, keep the exhaustive-search tests green and re-time a large pool.

## Page constraints

- Keep the title `Item Level Stat Lab`.
- Colors only through CSS tokens on `:root`, redefined for dark mode under `@media (prefers-color-scheme: dark)` (guarded `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` has an explicit background.
- `localStorage` only inside try/catch and only for per-viewer conveniences (the key is `ilvl-stat-lab-v3`). The page must render correctly without it. If the saved-state shape changes, bump the key suffix and keep `restoreState()` (src/ui/state.js) repairing old values.
- Works at ~400 px width with no horizontal page scroll (tables scroll in their own container).
- The page is not published as a claude.ai Artifact. Do not use the Artifact tool for this project.

## Working agreements with the owner

- Be concise and plain-spoken. The owner has said the UI felt "overwhelming" at one point, so favor a few clear tabs over many controls. Ask yourself whether each control earns its place; remove excess rather than explain it.
- Validate against external truth whenever possible (game files, Wiki, real items) and show the result. Distinguish what is verified from what is inferred. Several earlier claims had to be retracted (`docs/history.md`); do not repeat an inference as a fact, and add an entry there when something is retracted.
- Everything should be job-agnostic. No hard-coded Sage assumptions in labels, defaults, tests of shared logic, or copy. (Sage-specific facts, such as Eukrasian spells, were removed from the page on purpose.)
- When the owner reports a bug from a screenshot, reproduce it in the smoke test or a unit test first, fix, then add a regression check.
- Prefer root causes. Example: the "undefined" in Piece lab came from using a job-specific key where a neutral one belonged, not from missing text.
- esbuild is the only build tool and Alpine.js the only runtime dependency. Ask before adding any other dependency. The single self-contained output file is a feature.
- Do not commit or push unless the owner asks.

## Testing conventions

Details: `docs/testing.md`. Add formula or optimizer checks to the matching `tests/unit/<module>.test.js` with `node:test` and `node:assert/strict`, importing from `src/core/`. Generator rules go in `tests/data/test_generators.py`. UI regressions go in `tests/e2e/smoke.py` (it scans six representative jobs across every tab for `undefined`, `NaN` and `null` text, and checks for JS errors and horizontal overflow at 400 px). Prefer real items and published numbers as expected values (the Dreadwyrm sets, the Wiki's item level 475 caps, AkhMorning's GCD examples) over numbers produced by the code being tested. Optimizer changes must agree with the exhaustive-search reference.

## Documentation

Pages in `docs/` follow `docs/diagrams/STYLE.md`: concepts and math notation rather than code, code names only in a closing "Where this lives" table, hand-made SVG diagrams in the shared palette (rendered and checked in light and dark before finishing), every claim marked verified or inferred, numbers checked by running the code. When a change alters a documented number or rule, update the page that states it.
