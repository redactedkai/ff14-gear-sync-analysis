# CLAUDE.md

Working brief for Claude Code sessions in this repo. Read it fully before changing anything. Deeper domain notes, validation numbers and open questions are in `docs/findings.md`.

## What this project is

An FFXIV item level sync calculator and gear optimizer, shipped as **one self-contained HTML page** (no server, no framework, no runtime dependencies). It answers: given a sync cap (item level) and a job, what do the stats on a piece become, and which real gear combination maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, ...)?

The owner plays Sage and raids with Minimum Item Level and no Echo, so the sync cap they care about is **item level 123**. The tool is deliberately **job-agnostic**: all 22 combat jobs, cap and synced level are user settings. Do not reintroduce Sage-only or Spell-Speed-only wording, presets, or logic.

Current state: feature-complete first version. The next stage is feature expansion; see "Ideas not yet built" in `docs/findings.md`.

## Layout

```
src/
  head.html    <title>, Google Fonts link, all CSS (tokenized light/dark themes)
  body.html    page markup: settings, tabs, Item pool, Optimizer, "How the math works"
  core.js      pure logic, no DOM (formulas, sync clamp, GCD, optimizer, item DB access). Node-testable
  ui.js        DOM wiring, state, rendering, localStorage
  data.js      GENERATED: ItemLevel budget table (IL) and ParamGrow level data (PG)
  items.js     GENERATED: real gear database (ITEMS, 17,579 rows, ~1.4 MB)
scripts/
  build.py       src/* -> dist/page.html (Artifact fragment) and dist/index.html (browser-openable)
  fetch_data.py  sparse-clone the 6 needed CSVs from xivapi/ffxiv-datamining into data/
  gen_data.py    ItemLevel.csv + ParamGrow.csv -> src/data.js
  gen_items.py   Item.csv + EquipSlotCategory.csv + ClassJobCategory.csv -> src/items.js
  regen.py       gen_data + gen_items + build
tests/
  core.test.js   Node tests (npm test)
  smoke.py       Playwright browser smoke test (npm run smoke)
docs/findings.md
```

`dist/`, `data/` and `tests/out/` are gitignored. **Never hand-edit `src/data.js` or `src/items.js`**; change the generators and re-run `npm run regen`.

## Commands (run from the repo root)

- `npm run build` : assemble `dist/`
- `npm test` : core tests. Must print `ALL PASS`
- `npm run smoke` : browser test; must print `no errors` (needs `pip install playwright && playwright install chromium`)
- `npm run check` : all three
- `npm run fetch` / `npm run regen` : refresh game data after a patch (details below)

Always run `npm run check` before telling the owner something works. Tests and smoke test passing is the baseline; for UI changes also open `dist/index.html` and look at it at desktop width and ~400 px phone width.

## How the page is assembled

`build.py` concatenates `head.html + body.html + <script>(data.js + items.js + core.js + ui.js)</script>` into `dist/page.html`. Everything shares one global scope, so there are no imports. `core.js` ends with a guarded `module.exports` (used by nothing but humans reading it); the build disables that line, and `tests/core.test.js` loads `data.js + items.js + core.js` into one scope the same way.

`core.js` keeps **role-neutral stat keys**: `main` (Str/Dex/Int/Mind), `vit`, `crit`, `det`, `dh`, `spd` (Skill/Spell Speed), `spec` (Piety/Tenacity/none). `setProfile()` and `setJob()` mutate the globals `STATS`, `SUBSTATS`, `STAT_LABEL`, `SHORT`, `PROFILE`, `WEAPON_MODE`, `SLOT_PCT.weapon` so the same code serves every job. Raw database rows use the 12-stat order `str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps` and are converted with `dbStats()`. Do not use job-specific keys (`sps`, `piety`, `mind`) in shared logic or UI; map through the profile.

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
- `gen_items.py` keeps: gear with an equip slot (not belt, not soul crystal), a non-empty combat `ClassJobCategory` (22-job bitmask in the order of `JOBS` in `core.js`), item level >= 100, at least one stat. Stats are the item's own; **HQ bonus (`BaseParamValueSpecial`) is added only when `CanBeHq` is true**. `IsUnique` is carried so the optimizer allows only one copy of unique rings.
- Slot codes in `items.js`: 0 = 2H weapon, 1 = 1H weapon, 2 = off-hand, 3 head, 4 body, 5 hands, 6 legs, 7 feet, 8 ear, 9 neck, 10 wrist, 11 ring.
- The highest real item level is **795** (`MAX_REAL`, computed from the database). The `ItemLevel` sheet runs to 920 but rows 796 to 920 have no gear on them, so the UI caps item level inputs at `MAX_REAL`. Do not claim those rows are "placeholders" or "intentional"; the data only shows they are unused.
- After a patch: `npm run fetch` (pulls the latest CSVs), `npm run regen`, `npm run check`. Expect some numbers in `tests/core.test.js` to need updating if new gear or table rows change them (for example the Dreadwyrm tests are tied to specific old items and should stay stable; generic-max and band-accuracy figures can move).

## Job mapping

tank (Str, Skill Speed, Tenacity): PLD WAR DRK GNB. healer (Mind, Spell Speed, Piety): WHM SCH AST SGE. melee (Str, Skill Speed): MNK DRG SAM RPR. dex (Dex, Skill Speed): NIN VPR BRD MCH DNC. caster (Int, Spell Speed): BLM SMN RDM PCT BLU. PLD uses a 1H weapon (100%) plus a shield (off-hand 40%); every other job uses a 2H weapon (140%), which counts twice toward average item level.

## Optimizer notes

Branch-and-bound over slots with dominance pruning and a scalar lexicographic score (target, tiebreak 1, tiebreak 2 weighted 1e8 / 1e4 / 1). Handles two rings, Unique items, and an optional average-item-level requirement. Node limit 700k in the UI (150k for per-stat ceiling runs); the result reports when it was truncated. A 1,283-item Sage pool solves in about 0.2 s. If you change the scoring or pruning, keep the core tests green and re-time a large pool.

## Artifact constraints (the page is also published on claude.ai)

The page is published as a hand-built Artifact at https://claude.ai/artifact/6mqisYFXEQjH4FNiAm2HoK (private to the owner). Publish `dist/page.html` (the fragment), not `dist/index.html`. Rules the fragment must obey:
- No `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`; start with `<title>` and `<style>`. Keep the title `Item Level Stat Lab`.
- Colors only through CSS tokens on `:root`, redefined for dark mode under `@media (prefers-color-scheme: dark)` (guarded `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` has an explicit background.
- External scripts only from the CSP allowlist (cdnjs, jsdelivr/npm, unpkg, tailwind, jquery) with exact pinned versions; stylesheets only from Google Fonts. The page currently loads no scripts, only Google Fonts. Everything else is inline.
- `localStorage` only inside try/catch and only for per-viewer conveniences (the key is `ilvl-stat-lab-v3`). The page must render correctly without it. If the saved-state shape changes, bump the key suffix and keep `init()` sanitizing old values.
- Works at ~400 px width with no horizontal page scroll (tables scroll in their own container).
- Do not paste the artifact URL back to the owner after republishing; say in one sentence what changed.

**Standing instruction from the owner: whenever the page changes, republish the artifact automatically** (same URL, using the Artifact tool, publishing `dist/page.html`) after `npm run check` passes. If your session has no Artifact tool, say so and mention that `dist/page.html` is ready to be republished from a claude.ai session.

## Working agreements with the owner

- Be concise and plain-spoken. The owner has said the UI felt "overwhelming" at one point, so favor a few clear tabs over many controls. Ask yourself whether each control earns its place; remove excess rather than explain it.
- Validate against external truth whenever possible (game files, Wiki, real items) and show the result. Distinguish what is verified from what is inferred. Several earlier claims had to be retracted; do not repeat an inference as a fact.
- Everything should be job-agnostic. No hard-coded Sage assumptions in labels, defaults, tests of shared logic, or copy. (Sage-specific facts, such as Eukrasian spells, were removed from the page on purpose.)
- When the owner reports a bug from a screenshot, reproduce it in the smoke test or a unit test first, fix, then add a regression check.
- Prefer root causes. Example: the "undefined" in Piece lab came from using a job-specific key where a neutral one belonged, not from missing text.
- Do not add dependencies or a bundler without asking. The single-file, no-build-step-for-the-browser property is a feature.
- Do not commit or push unless the owner asks.

## Testing conventions

Add formula or optimizer checks to `tests/core.test.js` using `eq(actual, expected, label)`. Add UI regressions to `tests/smoke.py` (it already scans six representative jobs across every tab for `undefined`, `NaN` and `null` text, and checks for JS errors and horizontal overflow at 400 px). Prefer real items and published numbers as expected values (for example the Dreadwyrm set, the Wiki's item level 475 caps, AkhMorning's GCD examples) over numbers produced by the code being tested.
