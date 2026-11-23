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
- `tests/`: `unit/`, `sweep/` (long optimizer sweep), `data/` (generators), `e2e/smoke.mjs` (the runner; the checks are in `e2e/checks/`), `domains.mjs` (sorts every file into one of 11 domains).
- `docs/`: `mechanics/` (the game), `engineering/` (the code), plus glossary, roadmap, history.
- `docs/scratchpad/`: gitignored. Reports, mockups and agent output go in `docs/scratchpad/<topic>/`; nothing committed links to it.

Pushing to `main` deploys to GitHub Pages (the only workflow).

## Branches

Feature branch → `dev` → `main`, one way, fast-forward when possible. Never commit on `main` directly. Before merging to `main`, run `npm run check` on `dev` and look at the page. Hotfixes branch from `main` and merge into `dev` too. After every merge into `dev`, rebuild (`npm run build` on `dev`) so the local `dist/index.html` shows `dev`. Non-`main` builds show a DEV badge. CI runs `npm run check`, the `tests/sweep/` sweep and the Python lint and tests on `dev`, `main` and PRs, and deploys only from `main`. Several sessions may work on this machine at once: before merging into `dev`, run `git worktree list`, and if another session holds `dev` or the main checkout, leave the merge to the owner. The merge steps are in the `merge-wave` skill (`.claude/skills/merge-wave/SKILL.md`).

## Commands

Needs Node 22.18+ (type stripping runs `.ts` files in Node; `npm install`, or `npm ci` for a clean install; then once `npx playwright install chromium`). Python 3.11+ (`pip install -r requirements-dev.txt`) is only for the data pipeline and its tests. Every command, with its time: README, "Develop".

- `npm run check` (a warning if installed packages differ from the lock, then lint, `typecheck`, build, `npm test`, `test:smoke`; no Python; about 1 min): **Run it before saying something works.** All unit tests must pass, the smoke test must print `no errors`, and a lint warning fails it.
- `npm run check:all` (adds `lint:py`, `test:py`) when touching `scripts/data/` or after `data:update`.
- While iterating, run the part you are changing: `npm run test:<domain>` (unit tests, seconds; `-- --smoke` adds its browser checks on a private copy of the page; `-- --fast` leaves out the long files), `npm run test:changed` for the domains `git status` points to, or `npm run test:fast` for every unit test but the long ones (about 12 s). Domains: `model`, `data`, `solver`, `auto-fill`, `set-page`, `sheets`, `gear-browser`, `math-page`, `app`, `look`, `tooling`. A partial run is never the bar for done: `npm run check` is, and only its bare `no errors` counts (a filtered smoke run prints `no errors (partial: ...)`).
- For UI changes, also look at the page at the viewports listed in `docs/engineering/testing.md` section 3.1 (named by CSS screen, from the 960 px floor up to 2560 x 1440).
- `npm run data:update` after a game patch (see `docs/engineering/data-pipeline.md` section 9).
- Commit subjects: 72 characters at most, details in the body.
- Git hooks (no AI attribution in commits, a warning on long subjects; `check` before a push to `main`): `git config core.hooksPath .githooks` once per clone.

## Code rules

Details: `docs/engineering/architecture.md`.

- New modules may be `.ts` (TypeScript 6, `tsconfig.json`: strict, `erasableSyntaxOnly`, no enums, namespaces, parameter properties or decorators). A `.ts` file is imported with its extension (`'../text.ts'`); `npm run typecheck` checks them, `.js` files stay unchecked. The first two are `src/ui/text.ts` and `src/ui/view-cache.ts`.
- Core code never reads global job state. Pass a **JobContext** (`makeJobContext(jobId)`). **Stat keys** are the game's own stat names: `str`, `dex`, `int`, `mind` (the main stat), `vit`, `crit`, `det`, `dh`, `sks`, `sps` (speed), `piety`, `ten` (the special substat). `job.stats` lists the keys a job has (a job without a special substat has six), `job.substats` the substats, and `job.mainKey`, `job.speedKey` and `job.specKey` (null for none) name its main, speed and special stat; `job.label` and `job.short` name them. Shared code (`src/core`, `src/ui/views`) may name a key in a table or a per-key map (labels, tier effects) but never hard-codes a job-specific key in logic: ask the job (`job.speedKey`, not `'sks'`). A unit test (`tests/unit/core/stat-keys.test.js`) greps for strays.
- Components build a `view` object; templates only display it. Keep big data (the item database, browse results) out of reactive state. The optimizer reads `Alpine.raw` data: reactive proxies were too slow, and a worker cannot be sent a proxy.
- Dynamic `<select>`s use `x-for` with `:selected`. Reset to defaults asks first; switching job does not.
- Use each piece's own slot code, not the job's weapon type (White Mage has one wand and shield).

## Readability

The owner reads this code as a maintainer; write for a reader new to it.

- Names say what they hold. Single letters only for loop indices, sort comparators and one-line lambdas. Put the unit in the name or the comment where it is ambiguous: a slot share is per mille, haste and food are percent, a stat factor is a fraction (0.9) except in `MP` and `predictRaw` (90).
- Read database rows through `ROW` (`row[ROW.ilvl]`, `rowStats(row)`), never `row[2]`. A number with a meaning gets a named constant (`BASE_GCD_MS`).
- Every exported function has a comment above it: what it returns and the shape of any object parameter, then the sources and decisions. Keep a comment next to the code it describes; move it with the code.
- Write a rule once. Two copies drift (the meld tie-break did); share a helper.
- In a long function, separate the steps with blank lines and a one-line comment for each step.

## The model

Details: `docs/mechanics/math.md`, evidence in `docs/mechanics/validation.md`, materia in `docs/mechanics/materia.md`.

- Item stat: `round(round(round(budget × slotPercent / 1000) × factor) × share)`, rounded after each step; the factor is the item's own stat factor. Off-hand = 2H value − 1H value.
- Sync cap: `round(floor(floor(budget × factor% / 100) × slotPercent / 100) / 10)`, using the piece's own slot share. It matches the Wiki's item level 475 caps.
- Synced item level: the item level cap first (for gear made for a higher level, no higher than the best gear made for the synced level, `capCeiling`); otherwise, if the equip level is above the synced level, that level's `ParamGrow.ItemLevelSync`. Gear that scales with the wearer (`Item.SubStatCategory` 2) always follows the level, whatever its equip level (math.md section 5).
- Food: HQ only. With raw ranking and no Target GCD it never changes which gear wins. With a Target GCD (the meal's speed counts toward the GCD) or with tier ranking (on by default: tiers count food), meal and gear are chosen together.
- Weapon damage (physical for Str/Dex jobs, magic for Int/Mind; none for BLU) and Defense/Magic Defense are synced like a stat: the same cap formula with their own budget, factor and slot share. Weapon damage is ranked but not shown; Defense is shown only, never ranked.

**These are guesses, not facts:** the 100%/70% substat shares, the exact weapon damage under sync (that sync lowers it rests on player reports), Defense under sync for item kinds other than 2, 4 and 6, and the off-hand rule. (Substats never scaling up and the 70% line reaching the full cap are verified by the Wiki's item level 475 example. The main stat and Vitality clamp under sync is verified: the owner's in-game recordings (Sage and Bard) and xivgear's code agree; only the all-jobs earrings and rings (kind 0) are unrecorded.) Always say so in answers. In the UI, mark a guess only where it changes a number the user acts on, in a few words next to it; the evidence and the full verified/guessed lists live in `docs/`.

## Data

Details: `docs/engineering/data-pipeline.md`.

- Source: xivapi/ffxiv-datamining CSVs. The commit appears in the generated files and the page footer.
- Patch table (`src/data/patches.json`): from `patchlist.json` of xivapi/ffxiv-datamining-patches (its own clone and commit); the sheet manager's Patch column maps a sheet's data date to it (`patchOnDay`).
- Kept: combat gear from A Realm Reborn on, at any item level, with at least one stat (Blue Mage weapons have weapon damage only and are kept). Dropped: crafter and gatherer gear, and the codes in `gear_categories.LEFT_OUT`. HQ bonus only if `CanBeHq`.
- The boxes of the Gear categories filter (quests, crafted, Savage, ...: what a player does to get a piece) and each piece's own gear category come from game codes and shop data, never item names (`scripts/data/gear_activities.py`). The generator stops on anything unknown.
- The highest real item level is **795**. `ItemLevel` rows 796 to 920 have no gear. Don't call them "placeholders" or "intentional".

## Jobs

Roles, main stat, speed and special substat of each job: `docs/mechanics/math.md` section 1 (tanks and healers have a special substat; the melee, Dexterity and caster jobs don't). Shields: PLD and BST use a 1H weapon and a shield (`ONE_HANDED_JOBS`); WHM and BLM use either a 2H weapon or a 1H weapon and a shield, at every level (`MIXED_WEAPON_JOBS`); the rest use 2H. A test derives both lists from the item data. Level caps: BLU 80, BST 50; always go through `job.maxLevel`.

## Optimizer

How it works: `docs/engineering/optimizer.md` (start at its overview) and `tier-ranking.md`. Rules:

- Weapon damage is the implicit first key of every search (none for BLU); it is not offered as a goal.
- Relics whose substats the player allocates are left out of the search, with no note on the page (roadmap A11 models them).
- **If you change scoring, pruning or the search, run `npm run test:full` (the exhaustive-search tests and the long sweep) and `npm run perf`.** It exits 1 on a truncated run or one over 1,000 nodes; it prints timing budget misses as information only: timing matters only above about 1 s, so don't rerun or investigate them below that.

## Page rules

- Title: `<screen> · Gear Sync Analysis` (`titleOf` in `src/ui/router/routes.js`); the file holds the bare `Gear Sync Analysis` until the router has run.
- Colors only through CSS tokens on `:root`, with dark mode under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`. `body` sets its own background.
- `localStorage` only inside try/catch, for conveniences only (key `ilvl-stat-lab-v4`). No users yet: when the saved shape changes, repair it in `restoreState()` without bumping the key.
- Desktop only: must work at 960 px with no sideways scroll.
- Never publish it as a claude.ai Artifact.

## Working with the owner

- Keep it short and plain. Fewer controls beats more explanation.
- Tables: a few words per cell; details go in notes below the table.
- Light theme: don't take light shots or list it as unchecked for now; keep both themes' tokens and the existing smoke checks working.
- Page text is neutral and self-contained: no "wins" or advice between overgeared and melded gear, and no "this", "that" or "here" without naming the thing.
- A mockup is an HTML page the owner can click, in `docs/scratchpad/<topic>/`, opened in the default browser.
- Check claims against the game files, the Wiki or real items, and say what is verified and what is guessed. Docs describe the current state only (no dates or decision logs); retracted claims go in `docs/history.md`.
- Neutral defaults: Paladin, level 100, sync off, main stat, no tiebreaks. The one exception: nine boxes of the Gear categories filter are off by default (Miscellaneous, Deep dungeons, Wondrous Tails, Variant & Criterion, PvP, Extreme (Current), Savage (Current), Ultimate, Events & promotions; `on` in `item-format.json`), and the market board switch is on.
- For a bug from a screenshot, reproduce it in a test first, then fix it.
- Fix root causes.
- Item level 123 is one example: check a rule across all item levels and slots. A ±1 stat mismatch passes; don't add special rules only to fix one.
- Never kill processes by name (`taskkill /IM node.exe`): other sessions' processes share the machine. Stop only what you started.
- No new dependencies without asking. Keep the Google Fonts link, and make sure the page works without it.
- Don't commit or push unless asked.
- No AI attribution in commits or PR descriptions: no `Co-Authored-By` or "Generated with" lines.

## Tests and docs

- Details: `docs/engineering/testing.md`. Unit tests go in `tests/unit/`, in the folder of the module's path under `src/` (`src/ui/views/gcd.js` → `tests/unit/ui/views/gcd.test.js`; a concern after a dot: `tests/unit/core/formulas.sync-clamp.test.js`), generator tests in `tests/data/test_<generator>.py`, UI regressions as a step in `tests/e2e/checks/<screen>/`, listed in `tests/e2e/groups.mjs`. Use real items and published numbers as expected values.
- A test's domain is its module's (`tests/domains.mjs`): a unit test needs no entry unless it mirrors no module (then add it to a domain's `tests` list); a smoke step names its domain in `groups.mjs`, by what it checks; a new `src/` or `scripts/` file must match a domain's `src` list. A unit test fails on a file with no domain. A unit test file whose tests take over 5 s goes on `LONG`.
- Docs follow `docs/diagrams/STYLE.md`. If a change alters a documented number or rule, update the doc.
