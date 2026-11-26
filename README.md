# Gear Sync Analysis

In FFXIV, some content **syncs** a character down: item level sync caps each stat on gear above a set item level, and level sync lowers the character's level and the gear above it to match (both in the [glossary](docs/glossary.md#game-terms)). Gear Sync Analysis is a calculator for understanding how both work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for all 23 combat jobs and uses real item data from the game files.

It builds to a single self-contained HTML page, `dist/index.html`, that opens from disk with no server. The only outside requests are the Google Fonts stylesheet and the HQ symbol font from a community mirror; offline, the page falls back to system fonts and a plain "(HQ)". The npm package is named `ff14-gear-sync-analysis`.

## AI Disclosure

The majority of this project's code, tests, and documentation was generated with AI assistance under my direction. I define the requirements and architecture, and I review, run, and test all changes before they are committed.

With that said, this is a hobby project that I work on my free time. Bug reports and pull requests are welcome.

## Requirements

- Node 22.18 or later (it runs `.ts` files by stripping their types). Run `npm install` once (or `npm ci` for a clean install that matches `package-lock.json` exactly, as CI does), and `npx playwright install chromium` once for the smoke test and the component stories (`npx playwright install firefox webkit` too for `test:stories:all`). Building and testing the page needs only Node.
- Python 3.11 or later, only for the data pipeline, its generator tests and Ruff: `python -m pip install -r requirements-dev.txt`. CI runs Ruff and the generator tests on 3.11 (the oldest supported) and 3.13 (`.python-version`). The npm scripts run `python3` or `python`, whichever exists (`scripts/py.mjs`).

Run all commands from the repo root.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser. For development, `npm run dev` rebuilds on every change and serves the page locally.

The page opens on **Sheets**: make a sheet for a job, level and item level sync, add gear sets to it, and press **Auto-fill** on a set to find the gear that maximizes a chosen stat. Sheets are saved in the browser. On the other tabs, pick your job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one. A fresh page starts with Paladin, level 100 and sync off; **Reset to defaults** gets back there. Your settings are saved in the browser, so they come back on the next visit. Switching jobs keeps the job-specific settings the new job can use (the browser's slot and sort, Piece stats' substats) and resets the rest.

The page has two working tabs, **Sheets** and **Gear browser**, and a reference tab, **How the math works**. What each one shows: [docs/engineering/ui.md, section 1](docs/engineering/ui.md#1-the-tabs).

## Develop

Every npm command, in one place (other pages link here). Times are from the owner's 12-thread PC (2026-10-19 for `check`; the others as measured in [testing.md](docs/engineering/testing.md)).

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (core logic, page views, data format, saved state) |
| `npm run test:full` | Unit tests and a long random sweep of the optimizer's tier ranking (`tests/sweep/`, about 35 s); run it before changing scoring, pruning or the search. CI runs it |
| `npm run test:py` | The Python data generator tests |
| `npm run test:smoke` | Browser smoke test of the built page (build first); prints `no errors` when it passes. `-- --domain <name>` runs one domain's groups and prints `no errors (partial: N of M groups)` |
| `npm run test:fast` | Every unit test except the 19 long files (`LONG` in `tests/domains.mjs`): about 12 s against about 40 s for `npm test`. For work in progress; `check` is still the bar for done |
| `npm run test:changed` | The unit tests of the domains that own the files `git status` lists as changed (one line per path says why; `-- --list` shows the mapping only). For work in progress; `check` is still the bar for done |
| `npm run test:<domain>` | The unit tests of one domain: `model`, `data` (with the Python tests), `solver`, `auto-fill`, `set-page`, `sheets`, `gear-browser`, `math-page`, `app`, `look`, `tooling`. Add `-- --fast` to leave out the long files, `-- --smoke` to build a private copy of the page and run that domain's browser checks. For work in progress; `check` is still the bar for done |
| `npm run lint` | Biome (JavaScript, TypeScript, JSON, CSS and `src/index.html`): lint and format check, no file changes; a warning fails it; then `lint:lit` |
| `npm run lint:lit` | ESLint with `eslint-plugin-lit` and `eslint-plugin-lit-a11y` on the Lit elements (`src/ui/elements/**`), the markup Biome cannot read |
| `npm run typecheck` | `tsc --noEmit` over the `.ts` files (`tsconfig.json`: strict, erasable syntax only, `.js` files not checked); part of `check` |
| `npm run lint:py` | Ruff (Python): lint and format check, no file changes |
| `npm run format`, `npm run format:py` | Rewrite files with Biome, or with Ruff |
| `npm run test:stories` | Builds the story gallery and runs the component stories (`tests/stories/`) in Chromium (time: docs/engineering/testing.md, section 1); part of `check` |
| `npm run test:stories:all` | The same stories in Chromium, Firefox and WebKit, about 30 s; run by CI and `check:all` |
| `npm run check` | Lint (with format check), typecheck, build, unit tests, component stories (Chromium), smoke test; no Python; about 1 min. Warns if installed packages differ from the lock (run `npm ci`). Run before calling a change done |
| `npm run check:all` | `check`, then `test:stories:all`, `lint:py` and `test:py`. Run it when touching `scripts/data/` or after `data:update` |
| `npm run data:update` | After a game patch: fetch the newest game data CSVs into `data/`, regenerate `src/data/` and rebuild |
| `npm run perf` | Optimizer timing, 6 jobs' full pools (about 4 min); run it after changing the search |
| `npm run perf:full` | Optimizer timing, every job's full pool (about 25 min) |
| `npm run perf:adversarial` | Hostile pools and a forced 700,000-node search (about 15 s) |
| `npm run perf:browser` | Build, then time the page in Chromium at normal speed and 4× and 6× slower (about 10 min) |
| `npm run shots -- --out <dir>` | Screenshots of every view at 1440 and 960 px, light and dark (about 80 s); it builds its own copy of the page into `<dir>`, without the DEV badge, and leaves `dist/` alone ([testing.md](docs/engineering/testing.md)) |
| `npm run shots:compare -- <dirA> <dirB>` | Pixel compare two screenshot folders; lists what differs, exits 1 on a difference |
| `npm run test:visual` | Screenshot baselines (dark, 960 and 1440 px): runs only in the pinned Playwright Linux image, as the Visual CI workflow does; anywhere else it prints why it did nothing and exits 0. Not part of `check` ([testing.md](docs/engineering/testing.md#3-commands)) |
| `npm run stress:layout [-- --quick --fonts --browsers=chromium,firefox,webkit]` | Layout stress tool: builds a private copy of the page and checks every screen in 30 window sizes (6 screens x 8 Windows scales), a width sweep, text and font setups and extreme content, in a report; `--quick` about 1.5 min, a full run about 7 min; not part of `check` ([testing.md, section 3.1](docs/engineering/testing.md#31-viewports-to-look-at-for-ui-changes)) |
| `node scripts/perf/db-parse.mjs` | Time how long Chromium takes to read and run the inlined item database and the page's script, at normal speed and 4× and 6× slower (build first; about 1 min) |
| `node scripts/perf/target-gcd-sweep.mjs [--workers 5] [--jobs SGE,WAR] [--resume]` | Target GCD on every job's pool and sync setting, with checks (about an hour with 5 workers) |

For a UI change, also open `dist/index.html` and look at it at the five viewports in [testing.md, section 3.1](docs/engineering/testing.md#31-viewports-to-look-at-for-ui-changes) (from the 960 px floor to 2560 x 1440). What each command checks, how to run a subset, and the checks against ffxiv-gearing and xivgear are in [testing.md, section 3](docs/engineering/testing.md#3-commands); test layers and conventions are in the rest of [testing.md](docs/engineering/testing.md).

## After a game patch

Run `npm run data:update`, then `npm run check` and review the diff of the generated files. The steps are in [data-pipeline.md, section 9](docs/engineering/data-pipeline.md#9-updating-after-a-game-patch), and which test numbers may change after a patch and which must not is in [testing.md, section 6](docs/engineering/testing.md#6-after-a-game-patch). To regenerate from the CSVs you already have (for example after changing a generator), run `python scripts/data/regen.py`. Never edit `src/data/*` by hand.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run check`, the component stories in all three engines, the long `tests/sweep/` sweep, and `lint:py` and `test:py` on Python 3.11 and 3.13, on every push to `dev` or `main` and on pull requests. It publishes `dist/index.html` only from `main` (on a push, or by hand from the Actions tab), and only after those checks pass. One-time setup: in the repository's Settings → Pages, set Source to **GitHub Actions**. The page is then at `https://<owner>.github.io/<repo>/`. It is a single file with no paths to fix, so it works under that subpath as is.

## Documentation

[docs/README.md](docs/README.md) is the index, with a reading order. `docs/mechanics/` covers the game side: the stat model and sync, validation against game data, materia. `docs/engineering/` covers the code: architecture, the data pipeline, the optimizer, testing. [docs/glossary.md](docs/glossary.md) defines the game and project terms. [CLAUDE.md](CLAUDE.md) holds the project's working rules, for people and for Claude Code sessions alike.

## Contributing

The full rules are in [CLAUDE.md](CLAUDE.md); start the docs at [docs/README.md](docs/README.md). The ones that matter most:

- **Git hooks.** Once per clone, run `git config core.hooksPath .githooks`. The `commit-msg` hook rejects a `Co-Authored-By` or "Generated with" line (no AI attribution in this repo) and warns when the subject is over 72 characters, and `pre-push` runs `npm run check` before a push to `main`.
- **Branches.** Work on a feature branch off `dev`, merge it into `dev`, and move `dev` to `main` (fast-forward when possible). Never commit on `main`: a push to `main` deploys the live page. Builds from any other branch show a DEV badge.
- **Done means `npm run check` passes.** For UI changes, also look at the page at the five viewports in [testing.md, section 3.1](docs/engineering/testing.md#31-viewports-to-look-at-for-ui-changes). Run `npm run check:all` when touching `scripts/data/`, and `npm run test:full` and `npm run perf` when changing the optimizer's scoring, pruning or search.
- **Code rules** (details in [architecture.md](docs/engineering/architecture.md)):
  - Core code takes a JobContext (`makeJobContext(jobId)`) and uses the game's stat keys (`str`, `dex`, `int`, `mind`, `vit`, `crit`, `det`, `dh`, `sks`, `sps`, `piety`, `ten`); shared logic never hard-codes a job-specific one but asks the job (`job.speedKey`, not `'sks'`).
  - Read item database rows through `ROW` (`row[ROW.ilvl]`), never by position.
  - Keep big data (the item database, search results) out of the store or frozen in it; elements build a `view` object and templates only display it.
  - Write a rule once and share it; two copies drift.
  - `src/data/` is generated: change `scripts/data/` and regenerate, never edit it by hand.
- **Tests.** Unit tests go in `tests/unit/<src folder>/<module>.test.js` (Node), generator tests in `tests/data/` (Python), page regressions in `tests/e2e/checks/` (run by `tests/e2e/smoke.mjs`). Some modules are tested from a file named after a concern (`level-sync`, `multi-slot`), so to find a module's tests, search for its path: `grep -rl "core/sync-target.ts" tests/unit`. Each test belongs to one domain (`tests/domains.mjs`); `npm run test:<domain>` runs it. Expected values come from real items and published numbers, not from the tool's own output; see [testing.md](docs/engineering/testing.md).

## Data

Item stats, the item level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data; the page footer names the commit used. The speed-to-GCD formulas follow AkhMorning's guide, a community reference rather than game files. The substat share rule (100/70%, plus a fixed 20% Direct Hit line on older healer gear) is a pattern measured on real items, not something stored in the game files. Which claims are verified, inferred or assumed is listed once, in [validation.md, section 11](docs/mechanics/validation.md#11-verified-and-assumed). Only Stat Allocation depends on it; the optimizer and the gear browser use each item's real stats.

## License and credits

- **Code and docs:** MIT, see [LICENSE](LICENSE).
- **Game data and icons:** the FINAL FANTASY XIV game data in `src/data/` (item names and stats, level tables, food) and the 23 job icons in `src/data/job-icons.js` are © SQUARE ENIX CO., LTD. and are not covered by the MIT licence. This is an unofficial, non-commercial fan tool, under Square Enix's [FINAL FANTASY XIV Materials Usage License](https://support.na.square-enix.com/rule.php?id=5382&tag=authc).
- **Data source:** [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining); each generated file records the commit it came from.
- **Formulas:** the speed, GCD, tier, defense and food formulas follow [AkhMorning](https://www.akhmorning.com/); sync rules and caps were checked against [xivgear](https://xivgear.app/) and the [Console Games Wiki](https://ffxiv.consolegameswiki.com/). Each is credited where it is used (`docs/mechanics/`); they are re-implemented from the published maths, and no code is copied from them.
- **Interface icons:** a few small icons in `src/styles/` (arrows, tick, search, reset) are paths from [Remix Icon](https://remixicon.com/) 4.6.0, Apache License 2.0, © Remix Design.
- **Bundled:** Lit (BSD-3-Clause), Zag (`@zag-js/*`, MIT), Floating UI (`@floating-ui/*`, MIT) and proxy-compare (MIT). The build keeps the notices found in the bundled code (Lit's) at the end of the page's script through esbuild's `legalComments: 'eof'`, and adds the licence text of Zag, Floating UI and proxy-compare after them.

**Privacy.** The page loads its fonts from Google Fonts and the HQ symbol font from cdn.jsdelivr.net (a pinned copy of a GitHub mirror), which see each visitor's IP address. It has no analytics or cookies; settings are saved only in the browser's `localStorage`.
