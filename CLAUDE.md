# CLAUDE.md

Working brief for Claude Code sessions in this repo. Read it fully before changing anything. Deeper domain notes, validation numbers and open questions are in `docs/findings.md`.

## What this project is

An FFXIV item level sync calculator and gear optimizer, shipped as **one self-contained HTML page** (no server). Source is ES modules; esbuild bundles them, with Alpine.js (the only runtime dependency) and the data, into a single `dist/index.html` that opens from `file://`. It answers: given a sync cap (item level) and a job, what do the stats on a piece become, and which real gear combination maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, ...)?

The owner plays Sage and raids with Minimum Item Level and no Echo, so the sync cap they care about is **item level 123**. The tool is deliberately **job-agnostic**: all 22 combat jobs, cap and synced level are user settings. Do not reintroduce Sage-only or Spell-Speed-only wording, presets, or logic.

Current state: feature-complete first version. The next stage is feature expansion; see "Ideas not yet built" in `docs/findings.md`.

## Layout

```
src/
  index.html          page markup with Alpine directives; build markers <!-- STYLES --> and <!-- SCRIPT -->
  styles.css          all CSS (tokenized light/dark themes)
  main.js             entry: restore saved state, register store + components, Alpine.start()
  core/               pure logic, no DOM, importable from Node
    constants.js      slots, stat keys, profiles, JOBS, raw row layout (format facts read from item-format.json)
    item-format.json  SINGLE SOURCE for the generated-data format: job bit order, raw stat order (+ sheet
                      columns, BaseParam ids), slot codes. Read by constants.js and scripts/data/*.py
    tables.js         IL / PG / ITEMS re-exports, MAX_ILVL, MAX_REAL
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
    item-level.js     GENERATED: ItemLevel budget table (IL) and ParamGrow level data (PG)
    items.js          GENERATED: real gear database (ITEMS, 17,579 rows, ~1.4 MB)
scripts/
  build/build.mjs     esbuild bundle + inline into dist/index.html
  build/dev.mjs       watch + local server
  data/item_format.py  shared generator helpers: load item-format.json, read_csv
  data/fetch.py       sparse-clone the 6 needed CSVs from xivapi/ffxiv-datamining into data/
  data/gen_item_level.py  ItemLevel.csv + ParamGrow.csv -> src/data/item-level.js
  data/gen_items.py   Item.csv + EquipSlotCategory.csv + ClassJobCategory.csv -> src/data/items.js
  data/regen.py       both generators, then the build
tests/
  unit/*.test.js      node:test, one file per core module (npm test)
  e2e/smoke.py        Playwright browser smoke test (npm run smoke)
  data/               Python unittest of the generators, fixture CSVs in data/fixtures/ (npm run test:py)
docs/findings.md      domain notes, validation, open questions
docs/audit.md         engineering audit with a status table
```

`dist/`, `data/` and `tests/e2e/out/` are gitignored. **Never hand-edit `src/data/*.js`**; change the generators and re-run `npm run regen`.

## Commands (run from the repo root)

Requires Node 22+ (`npm install` once; `.nvmrc`, enforced by `engine-strict`) and Python 3.9+ for the data pipeline, smoke test and Ruff (`python -m pip install -r requirements-dev.txt`, then `python -m playwright install chromium` once).

- `npm run build` : assemble `dist/index.html`
- `npm run dev` : rebuild on change and serve `dist/` locally
- `npm test` : unit tests; every test must pass
- `npm run smoke` : browser test; must print `no errors` (needs `pip install playwright && playwright install chromium`)
- `npm run lint` / `npm run format` / `npm run format:check` : Biome (JS, JSON, CSS) and Ruff (Python); config in `biome.json` and `pyproject.toml` (140-column lines)
- `npm run test:py` : Python unittest of the data generators on fixture CSVs (`tests/data/`)
- `npm run check` : lint, format check, build, test, test:py, smoke
- `npm run fetch` / `npm run regen` : refresh game data after a patch (details below)

Always run `npm run check` before telling the owner something works. For UI changes also open `dist/index.html` and look at it at desktop width and ~400 px phone width.

## Architecture

Core functions never read global job state. Everything job-dependent comes from a **JobContext** passed as the first argument (`makeJobContext('SGE')`, cached and frozen). It holds role-neutral stat keys and how they map for the job: `main` (Str/Dex/Int/Mind), `vit`, `crit`, `det`, `dh`, `spd` (Skill/Spell Speed), `spec` (Piety/Tenacity/none), plus `stats`, `substats`, `label`, `short`, `weaponMode`, `slotPct`, `activeSlotTypes`, `vitFactor`. Raw database rows use the 12-stat order `str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps` and are converted with `dbStats(job, st)`. Do not use job-specific keys (`sps`, `piety`, `mind`) in shared logic or UI; map through the context.

UI: `Alpine.store('app')` holds the saved state plus `jobCtx` (the current context) and `poolVersion` (bumped on every pool change). Each component recomputes a `view` object in an effect from the store; templates only display it. Keep large data (the item database, browse results) out of reactive state (plain or frozen objects). The optimizer and ceiling run debounced (120 ms) and only while the Optimizer tab is open. Persisting to localStorage is one debounced effect in `main.js`. Dynamic `<select>`s render options with `x-for` and mark the current one with `:selected`.

## The model (what the math assumes)

Confirmed against game files and the FFXIV Wiki:
- Item level is an index into the `ItemLevel` sheet (ids 0 to 920): per-stat budgets.
- A stat on a piece = `round( round(table[ilvl] x slotPercent/1000) x share )`, rounded **twice**. Slot percents (BaseParam): 2H weapon 140, 1H 100, off-hand 40, head/hands/feet 85, body/legs 135, ear/neck/wrist/ring 67. There is no belt slot.
- Vitality for Int/Mind jobs is the Vit budget x 0.9 (rounded again); for Str/Dex jobs x 1.
- Level sync caps each stat on a piece above the cap at the 100%-share value of a same-slot piece at the cap item level. Pieces at or below the cap are untouched. At cap 123 the caps are: head/hands/feet 29 (main stat 30), body/legs 47 (48), accessories 23 (24), 2H weapon 48 (50). The model reproduces the Wiki's published caps at item level 475 exactly.
- GCD and DoT tick scaling follow AkhMorning's formulas using `BaseSpeed` and `LevelModifier` from `ParamGrow`.

Empirical or assumed (say so in the UI and in answers; never present as fact):
- The 100% / 70% / 20% substat shares (by rank on a piece) are a **measured pattern, not stored in the game files**. They reproduce about 97 to 100% of real pieces exactly (`docs/findings.md` has the table). The Item pool and Optimizer use each item's real stats and do not depend on the shares. Only Piece lab, the generic-piece generator and hand-fill do.
- The Mind/Vitality/main-stat clamp under sync is inferred, not confirmed in game.
- Melds are ignored on synced-down gear.
- Substats on a synced piece are never scaled up.

## Data facts

- Source: xivapi/ffxiv-datamining CSVs (straight exports from the game client via XIVData Oxidizer; SaintCoinach before 2026). Nothing is derived by the miners.
- `scripts/data/gen_items.py` keeps: gear with an equip slot (not belt, not soul crystal), a non-empty combat `ClassJobCategory` (22-job bitmask in the order of `jobs` in `src/core/item-format.json`), item level >= 100, at least one stat. Stats are the item's own; **HQ bonus (`BaseParamValueSpecial`) is added only when `CanBeHq` is true**. `IsUnique` is carried so the optimizer allows only one copy of unique rings.
- Slot codes in `src/data/items.js` (defined in `src/core/item-format.json`): 0 = 2H weapon, 1 = 1H weapon, 2 = off-hand, 3 head, 4 body, 5 hands, 6 legs, 7 feet, 8 ear, 9 neck, 10 wrist, 11 ring.
- The highest real item level is **795** (`MAX_REAL`, computed from the database). The `ItemLevel` sheet runs to 920 but rows 796 to 920 have no gear on them, so the UI caps item level inputs at `MAX_REAL`. Do not claim those rows are "placeholders" or "intentional"; the data only shows they are unused.
- After a patch: `npm run fetch` (pulls the latest CSVs), `npm run regen`, `npm run check`. Expect some numbers in `tests/unit/` to need updating if new gear or table rows change them (for example the Dreadwyrm tests are tied to specific old items and should stay stable; generic-max and band-accuracy figures can move).

## Job mapping

tank (Str, Skill Speed, Tenacity): PLD WAR DRK GNB. healer (Mind, Spell Speed, Piety): WHM SCH AST SGE. melee (Str, Skill Speed): MNK DRG SAM RPR. dex (Dex, Skill Speed): NIN VPR BRD MCH DNC. caster (Int, Spell Speed): BLM SMN RDM PCT BLU. PLD uses a 1H weapon (100%) plus a shield (off-hand 40%); every other job uses a 2H weapon (140%), which counts twice toward average item level.

## Optimizer notes

Branch-and-bound over slots with dominance pruning and a scalar lexicographic score (target, tiebreak 1, tiebreak 2, with weights derived from the pool so a lower-ranked stat can never outweigh a higher one; `makeScorer` in `src/core/optimizer/candidates.js`). Handles two rings, Unique items, and an optional average-item-level requirement. Node limit 700k in the UI (150k for per-stat ceiling runs); the result reports when it was truncated. A 1,283-item Sage pool solves in about 0.2 s. If you change the scoring or pruning, keep the core tests green and re-time a large pool. Dominance pruning keeps an item unless the items beating it have enough copies to fill every slot of its type (2 for rings), and is off when stat maximums are set. `tests/unit/optimizer-exhaustive.test.js` checks the optimizer against trying every combination; keep it green.

## Page constraints

- Keep the title `Item Level Stat Lab`.
- Colors only through CSS tokens on `:root`, redefined for dark mode under `@media (prefers-color-scheme: dark)` (guarded `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` has an explicit background.
- `localStorage` only inside try/catch and only for per-viewer conveniences (the key is `ilvl-stat-lab-v3`). The page must render correctly without it. If the saved-state shape changes, bump the key suffix and keep `restoreState()` (src/ui/state.js) repairing old values.
- Works at ~400 px width with no horizontal page scroll (tables scroll in their own container).
- The page is not published as a claude.ai Artifact. Do not use the Artifact tool for this project.

## Working agreements with the owner

- Be concise and plain-spoken. The owner has said the UI felt "overwhelming" at one point, so favor a few clear tabs over many controls. Ask yourself whether each control earns its place; remove excess rather than explain it.
- Validate against external truth whenever possible (game files, Wiki, real items) and show the result. Distinguish what is verified from what is inferred. Several earlier claims had to be retracted; do not repeat an inference as a fact.
- Everything should be job-agnostic. No hard-coded Sage assumptions in labels, defaults, tests of shared logic, or copy. (Sage-specific facts, such as Eukrasian spells, were removed from the page on purpose.)
- When the owner reports a bug from a screenshot, reproduce it in the smoke test or a unit test first, fix, then add a regression check.
- Prefer root causes. Example: the "undefined" in Piece lab came from using a job-specific key where a neutral one belonged, not from missing text.
- esbuild is the only build tool and Alpine.js the only runtime dependency. Ask before adding any other dependency. The single self-contained output file is a feature.
- Do not commit or push unless the owner asks.

## Testing conventions

Add formula or optimizer checks to the matching `tests/unit/<module>.test.js` with `node:test` and `node:assert/strict`, importing from `src/core/`. Add UI regressions to `tests/e2e/smoke.py` (it already scans six representative jobs across every tab for `undefined`, `NaN` and `null` text, and checks for JS errors and horizontal overflow at 400 px). Prefer real items and published numbers as expected values (for example the Dreadwyrm set, the Wiki's item level 475 caps, AkhMorning's GCD examples) over numbers produced by the code being tested.
