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
    item-format.json  shared data format (job bit order, raw stat order, slot codes, gear sources), read by JS and the Python generators
    tables.js         IL / PG / ITEMS / DATA_SOURCE re-exports, MAX_ILVL, MAX_REAL, footer label
    job-context.js    makeJobContext(jobId): frozen per-job description; slotActive, ilWeight, statColumn
    formulas.js       rounding, slot budgets, buildPiece, capsFor, syncStats, statDerivation, predictRaw
    sync-target.js    levelSyncIlvl, syncTarget: which item level a piece is synced to (item level cap or level sync)
    speed.js          speedParams, gcdFor, dotMult, gcdTiers
    tiers.js          statTier: a substat's effect from gear and its step (tier) start and next
    meld.js           materia melds: stoneValues, meldSlots, meldCaps, bestMeld (best melds of one piece), meldText
    items.js          pool items (mkItem, ids), genericItems, database rows (parseRow, dbStats, browseItems)
    optimizer/        candidates.js (vectors, scores, dominance) / search.js (branch-and-bound) / index.js (optimize)
    validation.js     accuracy against every real item + Wiki 475 caps (shared by page and tests)
  ui/
    state.js          saved-state shape, defaults, per-job reset, restoreState (repairs saved data), localStorage
    store.js          Alpine.store('app'): state + actions (setJob, tabs, pool edits)
    helpers.js        formatting, stat cells, number-field binding, debounced effects
    chart.js          budget chart SVG
    views/            pure view builders (no Alpine): what each tab shows, unit-tested in tests/unit/views.test.js
    components/       one Alpine.data() per page area (page/settings, piece-lab, sync-caps, validation-panel,
                      gear, optimizer)
  data/
    item-level.json   GENERATED: ItemLevel budget table, ParamGrow level data and BaseParam stat factor table ({_generated, source, IL, PG, MP})
    items.json        GENERATED: real gear database ({_generated, source, items}: 17,281 rows, ~1.5 MB)
    job-icons.js      GENERATED: the game's framed job icons as PNG data URLs (JOB_ICONS, ~0.2 MB)
scripts/
  build/build.mjs     esbuild bundle + inline into dist/index.html
  build/dev.mjs       watch + local server
  data/fetch.py       sparse-clone the 10 needed CSVs from xivapi/ffxiv-datamining into data/, download job icons into data/icons/
  data/item_format.py loads item-format.json, reads CSVs
  data/gen_item_level.py  ItemLevel.csv + ParamGrow.csv -> src/data/item-level.json
  data/gen_items.py   Item.csv + EquipSlotCategory.csv + ClassJobCategory.csv -> src/data/items.json
  data/gear_sources.py  Recipe.csv + SpecialShop.csv + TomestonesItem.csv -> shop and recipe flags (crafted, tomestone, ultimate)
  data/gear_categories.py  Item.SubcategorySort + shops -> each item's category (dungeon, savage, relic, ...); docs/engineering/subcategory-sort-codes.md
  data/gen_job_icons.py  data/icons/*.png (downloaded by fetch.py) -> src/data/job-icons.js
  data/provenance.py  source commit + file headers
  data/regen.py       both generators, then the build
tests/
  unit/*.test.js      node:test, one file per core module, plus state.test.js
  data/               Python generator tests on fixture CSVs
  e2e/smoke.py        Playwright browser smoke test (npm run smoke)
docs/                 see docs/README.md; style guide in docs/diagrams/STYLE.md
  mechanics/          the game: math (stat model, sync), validation (evidence), materia
  engineering/        the code: architecture, data-pipeline, optimizer, testing, subcategory-sort-codes
  glossary, roadmap, history and diagrams/ stay at the top level
```

`.github/workflows/pages.yml` deploys to GitHub Pages on push to `main` (Node unit tests, build, publish `dist/`). It is the only workflow; there is no separate CI.

`dist/`, `data/` and `tests/e2e/out/` are gitignored. **Never hand-edit `src/data/*`**; change the generators and re-run `python scripts/data/regen.py` (regenerates from the local CSVs without fetching).

## Commands (run from the repo root)

Requires Node 22+ (`npm install` once) and Python 3.9+ (data pipeline, generator tests and smoke test; `python -m pip install -r requirements-dev.txt`, then `python -m playwright install chromium`).

- `npm run build` : assemble `dist/index.html`
- `npm run dev` : rebuild on change and serve `dist/` locally
- `npm test` : unit tests and Python generator tests; every test must pass
- `npm run smoke` : browser test; must print `no errors`
- `npm run lint` : Biome (JS/JSON/CSS) and Ruff (Python) lint plus format check; `npm run format` rewrites
- `npm run check` : lint, build, test, smoke
- `npm run update-data` : fetch the newest game CSVs and regenerate `src/data/` after a patch (`docs/engineering/data-pipeline.md` section 9)

Always run `npm run check` before telling the owner something works. For UI changes also open `dist/index.html` and look at it at desktop width and ~400 px phone width.

## Architecture

Details and diagrams: `docs/engineering/architecture.md`.

Core functions never read global job state. Everything job-dependent comes from a **JobContext** passed as the first argument (`makeJobContext('SGE')`, cached and frozen). It holds role-neutral stat keys and how they map for the job: `main` (Str/Dex/Int/Mind), `vit`, `crit`, `det`, `dh`, `spd` (Skill/Spell Speed), `spec` (Piety/Tenacity/none), plus `stats`, `substats`, `label`, `short`, `weaponMode`, `slotPct`, `activeSlotTypes`, `vitFactor`. Raw database rows use the 14-stat order `str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps,mainAttr,secAttr` and are converted with `dbStats(job, st)`. `mainAttr`/`secAttr` are the game's generic Main and Secondary Attribute (pre-order earrings, Occult accessories): they add to the job's main stat and to Piety/Tenacity (spec) or Direct Hit. Do not use job-specific keys (`sps`, `piety`, `mind`) in shared logic or UI; map through the context.

UI: `Alpine.store('app')` holds the saved state plus `jobCtx` (the current context) and `poolVersion` (bumped on every pool change). Each component recomputes a `view` object in an effect from the store; templates only display it. Keep large data (the item database, browse results) out of reactive state (plain or frozen objects). The optimizer runs debounced (120 ms) and only while the Gear optimizer tab is open; the gear browser only while the Gear pool tab is open. Persisting to localStorage is one debounced effect in `main.js`. Dynamic `<select>`s render options with `x-for` and mark the current one with `:selected`.

## The model

Full derivation, worked example and verified/assumed table: `docs/mechanics/math.md`. Evidence: `docs/mechanics/validation.md`. Key rules:

- Item level is a row of the `ItemLevel` budget table. A stat on a piece = `round( round(budget x slotPercent/1000) x share )`, rounded **twice**. Slot percents: 2H weapon 140, 1H 100, off-hand 40, head/hands/feet 85, body/legs 135, accessories 67. An off-hand stat is not computed at 40: it is the 2H value minus the 1H value (inferred; fits 224 of 226 real off-hands, the plain 40 fits 195), so the shield substat cap at 123 is 13. No belt slot. Each stat also has a **per-item stat factor** read from the game files (`BaseParam.MeldParam[stat][Item.BaseParamModifier]`, carried as the last field of each item row, table `MP` in item-level.json): Vitality x 0.9 on Int/Mind gear, every main stat and Vitality x 0.9 on the 13 four-main-stat pieces, 1 otherwise; for item stats applied after the slot share (`round(round(slot value) x factor)`; the factor-first order is wrong on real items). Real pieces use their own factor, in predictRaw and in their sync caps; where no item is involved (Sync caps tab, Piece stats) the job's factor (`vitFactor`: 0.9 for Int/Mind jobs) is used, which equals the game files' value on every single-main-stat piece. xivgear computes shield caps with the same 2H - 1H rule.
- Sync caps each stat on a piece above the cap at its cap for the piece's own slot share (a 1H weapon 100, a cloak covering the head 220) and kind; pieces at or below are untouched. A cap rounds in a **different order from item stats**: factor first, floored, rounded once, `round(floor(floor(budget x factor%/100) x slotPercent/100) / 10)` (`capValue`); off-hand caps are 2H cap - 1H cap. With factor 100 this equals the full-share value of a same-slot piece at the cap (same number at every item level and share); with a factor below 100 it can differ by 1 either way. The order is verified by three second-hand in-game values from xivgear's tests (BLU head Vitality 56 at 270, RDM head 123 at 530 where the native 530 head has 122, Azeyma's Earrings main 71 at 430; the item order gives 57, 122, 70) and inferred elsewhere. At 123: head/hands/feet 29 (main 30), body/legs 47 (48), accessories 23 (24), 2H weapon 48 (50); Int/Mind Vitality 29 / 45 / 23 / 47. Reproduces the Wiki's item level 475 caps exactly.
- Which item level a piece is synced to (`syncTarget`): the item level cap if item level sync is on and the piece is above it; else, if its equip level is above the synced level (app.level), `ParamGrow.ItemLevelSync` of that level (50 -> 130, 60 -> 270, 70 -> 400, 80 -> 530, 90 -> 660, 100 -> 690; 1-49 map to themselves), independent of the item level sync switch; else untouched. Trigger verified by the owner; the mapping is the game file; "item level cap first when both apply" is second-hand (a player's report, xivgear issue #317); weapons using the same column is inferred. Only database pieces have an equip level (looked up by pool key, `equipLevel` in items.js, so the saved pool shape is unchanged); generated and hand-made pieces get only the item level cap. Piece stats and Sync limits (no equip level) show the item level cap, or with item level sync off and a level below 100 the level's item level. At T13 (level 50, cap 123) level sync adds 71 pieces (equip level 51, item level 120), synced to 130, no stat changes.
- GCD and DoT/HoT tick scaling follow AkhMorning's formulas with `ParamGrow` constants.

Empirical or assumed (say so in the UI and in answers; never present as fact):
- The 100% / 70% substat shares are a **measured pattern, not in the game files**, and so is the one exception: Direct Hit on gear whose only main stat is Mind (old healer Accuracy, item level 135 and below) is a fixed 20% line outside the ranking, the only third substat in the game (25% on eight green, HQ-able item level 110 pieces with three substats, raised in patch 4.0; the row's rarity field exists for this). The 11 Zodiac Atma weapons (item level 100) carry their Zenith step's item level 90 stats (verified) and are predicted at 90; this rule and the all-jobs accessory factors go by name (owner's decision): the six kind 0 earrings and rings with Main Attribute (pre-order, Bozja, Hall of the Novice) had their stats edited by hand across patches (verified, datamining history), so each carries its own main stat and Vitality factor for stored stats; synced, the game applies the file's 90%. With equal substats sharing the higher rank (relic weapon steps carry two full substats), every main stat counted and the off-hand rule: 99.7 to 100.0% exact per item level band, 99.9% overall (16,577 of 16,601), every piece within 1. The 24 misses are three small groups, all off by 1 (docs/mechanics/validation.md section 2). The Gear pool and Gear optimizer use real item stats and do not depend on them; only Piece stats does.
- The main stat / Vitality clamp under sync is inferred, supported only by the second-hand in-game values above; lower-ranked substats clamping to the full-share cap is strongly supported (a player's in-game test, The Balance's item level thresholds; docs/mechanics/validation.md section 8) but not verified in game.
- Melds are lost on synced-down gear (verified by the owner in game: a piece is synced when its item level is above the duty's cap with item level sync on, or its equip level is above the duty's level); substats are never scaled up (assumed). Meld rules (values and item level gates, VI/VIII/X/XII not past the first overmeld slot, each substat capped at the piece's own cap) are verified and in `docs/mechanics/materia.md`; every meld is assumed to succeed (owner's decision); 0-slot pieces flagged for overmelding (15 PLD shields) take none (inferred; xivgear gives them 5).

## Data

Full rules, counts and provenance: `docs/engineering/data-pipeline.md`. Key facts:

- Source: xivapi/ffxiv-datamining CSVs (straight client exports; nothing derived by the miners). The commit is recorded in both generated files and shown in the page footer.
- `gen_items.py` keeps gear with a slot (no belt, no soul crystal), a combat-job `ClassJobCategory`, item level >= 100 and at least one stat, and leaves out crafter and gatherer gear (any piece carrying GP, CP, Craftsmanship, Control, Gathering or Perception, listed by BaseParam id in `item-format.json` `crafterGathererParams`; the generator stops if a row id changes name) and retired gear (`gear_categories.RETIRED`: the Heavensward Diadem gear, 293 pieces). **HQ bonus only when `CanBeHq`**. `IsUnique` is carried so the optimizer allows only one copy of a Unique ring. `BaseParamModifier` (the item's stat factor kind, 0 to 12) is carried as the last row field; the generator stops on a kind with no `MeldParam` column. Each row also carries a mask of the six groups the Gear pool tab can exclude (crafted, tomestone, ultimate, current Savage, relic, PvP; Savage counts only gear at the highest equip level in the data, the current expansion; relic includes the Eureka, Bozja and Occult Crescent field op armor). A group is set from the piece's category (`gear_categories.py`: `Item.SubcategorySort` % 1000 plus shop data, no item names; each code verified in `docs/engineering/subcategory-sort-codes.md`) or from the shop and recipe flags (`gear_sources.py`: recipe results; tomestone costs, where shop costs below 8 are currency codes read through `UseCurrencyType`; the seven ultimate totems). The generator stops on an unknown code or when the two signals contradict. Dungeon loot tables are not in the game files, but dungeon gear has its own code (270). Categories and flags were spot-checked against the Lodestone (0 wrong); the Lodestone only shows shops active today, so a retired shop still in the game files shows no tomestone there.
- Job bit order, raw stat order and slot codes live in `src/core/item-format.json` only; a test checks the page against it. Changing it means regenerating the data.
- The highest real item level is **795** (`MAX_REAL`, computed from the database). The `ItemLevel` sheet runs to 920 but rows 796 to 920 carry no gear, so item level inputs cap at `MAX_REAL`. Do not claim those rows are "placeholders" or "intentional"; the data only shows they are unused.
- After a patch: `npm run update-data`, then `npm run check`. Which test numbers may move and which must not is in `docs/engineering/data-pipeline.md` section 9 and `docs/engineering/testing.md` section 6.

## Job mapping

tank (Str, Skill Speed, Tenacity): PLD WAR DRK GNB. healer (Mind, Spell Speed, Piety): WHM SCH AST SGE. melee (Str, Skill Speed): MNK DRG SAM RPR. dex (Dex, Skill Speed): NIN VPR BRD MCH DNC. caster (Int, Spell Speed): BLM SMN RDM PCT BLU. PLD uses a 1H weapon (100%) plus a shield (2H minus 1H value); every other job uses a 2H weapon (140%). Exception in the data: White Mage also has one A Realm Reborn wand and shield pair (Tidal Wave, item level 100), so the browser and optimizer go by each piece's own slot code, not the job's weapon mode.

## Optimizer

Full description, proofs and measurements: `docs/engineering/optimizer.md`.

Depth-first branch and bound over slots, after dominance pruning, with one integer score per item that encodes the lexicographic order (target, tiebreak 1, tiebreak 2). The weights are derived from the pool so a lower key can never outweigh a higher one; `optimize()` throws if a score could exceed 2^53. An item is pruned only when the items that dominate it have enough copies to fill every slot of its type (2 for rings; copies counted once per item), and pruning is off when a speed maximum is set. The two ring slots are bounded together by the best legal pair, so a Unique best ring is never counted twice. The only constraint is an optional speed range (engine only, for a future target-GCD control). Handles two rings, Unique items and pieces that take more than one slot: a 2H weapon leaves the off-hand empty, a cloak (slot code 12, body share 220 = `ChestHeadPercent`) leaves the head empty; blockable slots are searched last and a piece never prunes one that blocks fewer slots. Excluding gear groups (crafted, tomestone, ultimate, savage, relic, PvP; ticked boxes in the Gear pool tab, `browse.exclude`) hides them from both gear lists and filters the pool before the search. Melds (`optimize({melds})`, off in the engine, on by default on the page via the "Materia" switch, `opt.melds`): each piece that is not synced gets its best melds for the objective (`bestMeld`, an exact search over big and small stone splits; greedy is wrong on 2.2% of real cases) before scoring; one version per piece is exact (docs/mechanics/materia.md section 4), and melds with a speed range throw. Pruning compares each candidate only with the kept ones (sorted by score, then stat sum). Node limit 700k in the UI; a truncated result is marked with a note under it.

Timing (Node 22, full 1,999-item Sage pool): one run takes about 8 to 13 ms without melds and 13 to 17 ms with them (slowest across Sage and Warrior full pools: ~20 ms / ~42 ms). Across 9,800 real-gear runs the largest search is 203 nodes. A stress-test plan is in docs/scratchpad/perf/plan.md. If you change scoring, pruning or the search, keep the exhaustive-search tests green and re-time a large pool.

## Page constraints

- Keep the title `Gear Sync Analysis` (renamed from Item Level Stat Lab at the owner's request).
- Colors only through CSS tokens on `:root`, redefined for dark mode under `@media (prefers-color-scheme: dark)` (guarded `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` has an explicit background.
- `localStorage` only inside try/catch and only for per-viewer conveniences (the key is `ilvl-stat-lab-v4`). The page must render correctly without it. The site has no users yet (owner, 2026-10-12), so a saved-state shape change does not need a key bump: add the field and have `restoreState()` (src/ui/state.js) default and repair it. Bump the key suffix only once the site has users and old saves cannot be repaired field by field.
- Works at ~400 px width with no horizontal page scroll (tables scroll in their own container).
- The page is not published as a claude.ai Artifact. Do not use the Artifact tool for this project.

## Working agreements with the owner

- Be concise and plain-spoken. The owner has said the UI felt "overwhelming" at one point, so favor a few clear tabs over many controls. Ask yourself whether each control earns its place; remove excess rather than explain it.
- Validate against external truth whenever possible (game files, Wiki, real items) and show the result. Distinguish what is verified from what is inferred. Several earlier claims had to be retracted (`docs/history.md`); do not repeat an inference as a fact, and add an entry there when something is retracted.
- Everything should be job-agnostic. No hard-coded Sage assumptions in labels, defaults, tests of shared logic, or copy. Defaults favour no player's setup: no job chosen (the tabs wait for one), level 100, sync off with an empty cap; the optimizer maximizes the main stat with no tiebreaks; Piece stats at the highest real item level with the job's own substat first. (Sage-specific facts, such as Eukrasian spells, were removed from the page on purpose.)
- When the owner reports a bug from a screenshot, reproduce it in the smoke test or a unit test first, fix, then add a regression check.
- Prefer root causes. Example: the "undefined" in Piece stats came from using a job-specific key where a neutral one belonged, not from missing text.
- esbuild is the only build tool and Alpine.js the only runtime dependency. Ask before adding any other dependency. The single self-contained output file is a feature. The one intentional exception is the Google Fonts stylesheet in `src/index.html` (owner's decision): keep it, and keep the page working without it.
- Do not commit or push unless the owner asks.

## Testing conventions

Details: `docs/engineering/testing.md`. Add formula or optimizer checks to the matching `tests/unit/<module>.test.js` with `node:test` and `node:assert/strict`, importing from `src/core/`. Generator rules go in `tests/data/test_generators.py`. UI regressions go in `tests/e2e/smoke.py` (it scans six representative jobs across every tab for `undefined`, `NaN` and `null` text, and checks for JS errors and horizontal overflow at 400 px). Prefer real items and published numbers as expected values (specific real items from the game data, the Wiki's item level 475 caps, AkhMorning's GCD examples) over numbers produced by the code being tested. Optimizer changes must agree with the exhaustive-search reference.

## Documentation

Pages in `docs/` follow `docs/diagrams/STYLE.md`: concepts and math notation rather than code, code names only in a closing "Where this lives" table, hand-made SVG diagrams in the shared palette (rendered and checked in light and dark before finishing), every claim marked verified or inferred, numbers checked by running the code. When a change alters a documented number or rule, update the page that states it.
