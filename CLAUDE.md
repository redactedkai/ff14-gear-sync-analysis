# CLAUDE.md

Rules for working in this repo. Details are in `docs/` (start at `docs/README.md`).

## The project

An FFXIV gear tool: pick a job and a sync cap, see what a piece's stats become, and find the real gear that maximizes a chosen stat. It ships as **one HTML file** (`dist/index.html`, opens from `file://`), built by esbuild from ES modules in `src/`, with Alpine.js as the only runtime dependency.

The owner plays Sage at item level 123, but the tool is **job-agnostic**: all 23 combat jobs, any cap, any level. No Sage-only or Spell-Speed-only wording, defaults or logic. Next work: `docs/roadmap.md`.

## Layout

- `src/core/`: pure logic, no DOM, runs in Node. `item-format.json` defines the data format for both JS and Python.
- `src/ui/`: state, Alpine store, view builders (`views/`, unit-tested), components.
- `src/data/`: **generated, never edit by hand.** Change `scripts/data/` and run `python scripts/data/regen.py`.
- `scripts/`: build, data generators, perf, and validation against ffxiv-gearing and xivgear (run by hand).
- `tests/`: `unit/`, `data/` (generators), `e2e/smoke.py`.
- `docs/`: `mechanics/` (the game), `engineering/` (the code), plus glossary, roadmap, history.

Pushing to `main` deploys to GitHub Pages (the only workflow).

## Branches

Feature branch → `dev` → `staging` → `main`, one way, fast-forward when possible. Never commit on `staging` or `main` directly. Before merging to `main`, run `npm run check` on `staging` and look at the page. Hotfixes branch from `main` and merge into all three. Non-`main` builds show a DEV/STAGING badge.

## Commands

Needs Node 22+ and Python 3.9+ (`pip install -r requirements-dev.txt`, `python -m playwright install chromium`).

- `npm run build`, `npm run dev`
- `npm test`: all must pass
- `npm run smoke`: must print `no errors`
- `npm run lint`, `npm run format`
- `npm run check`: all of the above. **Run it before saying something works.** For UI changes, also look at the page at full width and at 960 px.
- `npm run update-data`: after a game patch (see `docs/engineering/data-pipeline.md` section 9)

## Code rules

Details: `docs/engineering/architecture.md`.

- Core code never reads global job state. Pass a **JobContext** (`makeJobContext(jobId)`) and use its neutral keys (`main`, `vit`, `crit`, `det`, `dh`, `spd`, `spec`). Never use job keys like `sps`, `piety` or `mind` in shared code or UI.
- Components build a `view` object; templates only display it. Keep big data (the item database, browse results) out of reactive state. The optimizer reads `Alpine.raw` data because reactive proxies were too slow.
- Dynamic `<select>`s use `x-for` with `:selected`. Reset to defaults asks first; switching job does not.
- Use each piece's own slot code, not the job's weapon type (White Mage has one wand and shield).

## The model

Details: `docs/mechanics/math.md`, evidence in `docs/mechanics/validation.md`, materia in `docs/mechanics/materia.md`.

- Item stat: `round(round(round(budget × slotPercent / 1000) × factor) × share)`, rounded after each step; the factor is the item's own stat factor. Off-hand = 2H value − 1H value.
- Sync cap: `round(floor(floor(budget × factor% / 100) × slotPercent / 100) / 10)`, using the piece's own slot share. It matches the Wiki's item level 475 caps.
- Synced item level: the item level cap first; otherwise, if the equip level is above the synced level, that level's `ParamGrow.ItemLevelSync`. Gear that scales with the wearer (`Item.SubStatCategory` 2) always follows the level, whatever its equip level (math.md section 5).
- Food: HQ only. Without a Target GCD it never changes which gear wins; with one, the meal's speed counts toward the GCD, so meal and gear are chosen together.

**These are guesses, not facts; say so in the UI and in answers:** the 100%/70% substat shares, the main stat and Vitality clamp under sync, the off-hand rule, the food formula, every meld succeeding, and substats never scaling up.

## Data

Details: `docs/engineering/data-pipeline.md`.

- Source: xivapi/ffxiv-datamining CSVs. The commit appears in the generated files and the page footer.
- Kept: combat gear from A Realm Reborn on, item level 15+, with at least one stat. Dropped: crafter and gatherer gear, and the codes in `gear_categories.LEFT_OUT`. HQ bonus only if `CanBeHq`.
- Gear groups (crafted, tomestone, Savage, ...) come from game codes and shop data, never item names. The generator stops on anything unknown.
- The highest real item level is **795**. `ItemLevel` rows 796 to 920 have no gear. Don't call them "placeholders" or "intentional".

## Jobs

| Role | Jobs | Main stat | Speed | Special |
|---|---|---|---|---|
| Tank | PLD WAR DRK GNB | Str | Skill Speed | Tenacity |
| Healer | WHM SCH AST SGE | Mind | Spell Speed | Piety |
| Melee | MNK DRG SAM RPR BST | Str | Skill Speed | none |
| Ranged | NIN VPR BRD MCH DNC | Dex | Skill Speed | none |
| Caster | BLM SMN RDM PCT BLU | Int | Spell Speed | none |

PLD and BST use a 1H weapon and a shield; the rest use 2H. Level caps: BLU 80, BST 50; always go through `job.maxLevel`.

## Optimizer

Details: `docs/engineering/optimizer.md`.

Branch and bound over slots, after removing dominated items. Each item gets one integer score for (goal, tiebreak 1, tiebreak 2). It handles two rings, Unique items, and pieces that cover more than one slot. Melds are picked per unsynced piece by exact search. A Target GCD (`src/core/target-gcd.js`) becomes a speed band, counting food and the always-on haste of MNK, NIN, SAM and VPR. **If you change scoring, pruning or the search, keep the exhaustive-search tests passing and re-run `npm run perf`.**

## Page rules

- Title: `Gear Sync Analysis`.
- Colors only through CSS tokens on `:root`, with dark mode under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` sets its own background.
- `localStorage` only inside try/catch, for conveniences only (key `ilvl-stat-lab-v4`). No users yet: when the saved shape changes, repair it in `restoreState()` without bumping the key.
- Desktop only: must work at 960 px with no sideways scroll.
- Never publish it as a claude.ai Artifact.

## Working with the owner

- Keep it short and plain. Fewer controls beats more explanation.
- Check claims against the game files, the Wiki or real items, and say what is verified and what is guessed. Log retracted claims in `docs/history.md`.
- Neutral defaults: no job, level 100, sync off, main stat, no tiebreaks. The one exception: Savage, Ultimate and PvP gear are hidden by default.
- For a bug from a screenshot, reproduce it in a test first, then fix it.
- Fix root causes.
- No new dependencies without asking. Keep the Google Fonts link, and make sure the page works without it.
- Don't commit or push unless asked.

## Tests and docs

- Details: `docs/engineering/testing.md`. Formula and optimizer tests go in `tests/unit/<module>.test.js`, generator tests in `tests/data/test_generators.py`, UI regressions in `tests/e2e/smoke.py`. Use real items and published numbers as expected values.
- Docs follow `docs/diagrams/STYLE.md`. If a change alters a documented number or rule, update the doc.
