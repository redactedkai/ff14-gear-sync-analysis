# Gear Sync Analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for all 23 combat jobs and uses real item data from the game files.

It builds to a single self-contained HTML page, `dist/index.html`, that opens from disk with no server. The only outside request is the Google Fonts stylesheet; offline, the page falls back to system fonts. The npm package is named `ff14-gear-sync-analysis`.

## Requirements

- Node 22 or later. Run `npm install` once, and `npx playwright install chromium` once for the smoke test. Building and testing the page needs only Node.
- Python 3, only for the data pipeline, its generator tests and Ruff: `python -m pip install -r requirements-dev.txt`. CI uses 3.13 (`.python-version`); the code keeps to 3.9 syntax, but nothing tests 3.9. The npm scripts run `python3` or `python`, whichever exists (`scripts/py.mjs`).

Run all commands from the repo root.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser. For development, `npm run dev` rebuilds on every change and serves the page locally.

Pick your job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one. A fresh page starts with no job, level 100 and sync off; **Reset to defaults** gets back there. Your settings are saved in the browser, so they come back on the next visit. Switching jobs resets the job-specific settings (the optimizer's target and tiebreaks, the browser's slot and sort).

Once a job is chosen, the page has two working tabs and one reference tab:

1. **Gear optimizer** (opens first): picks one item per slot (two rings) from every piece the job can wear to maximize one stat, with two optional tiebreakers and an optional Target GCD, when you press **Optimize**. A Materia switch (on by default) gives each piece its best melds. Under **Gear to search**, the **Gear from** boxes leave out gear by how it is obtained (quests, crafting, Savage, PvP, ...); nine of them are off by default.
2. **Gear browser**: one table of real gear for the selected job, with filters and its synced stats, for looking gear up. A name search sits on its title line ("/" jumps to it), slot pills show how many pieces each slot has, a Reset button appears at their end while a filter is set, and a click on a column heading sorts by it (again to flip). A piece that sync lowers shows its synced numbers in bold, with its own numbers in small type under them. It has its own gear group boxes. HQ-capable crafted gear is marked HQ, and rings that can be worn on both hands ×2.
3. **How the math works** (reference): Piece stats (what sync does to one piece, and when an overgeared piece has more than a melded one at the cap, with how each stat is built, checked against real gear and the Wiki); GCD (how speed becomes the GCD at a level, with a haste and a speed of your own: the GCD, GCDs per minute, the cut to cast and recast times, the speed one step takes at every level, and the steps around the speed); and Substat tiers (where each substat's tiers start around your value, as on the character panel).

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (core logic, page views, data format, saved state) |
| `npm run test:full` | Unit tests and a long random sweep of the optimizer's tier ranking (`tests/full/`); run it before changing the search |
| `npm run test:data` | The Python data generator tests |
| `npm run smoke` | Browser smoke test of the built page (build first); prints `no errors` when it passes |
| `npm run lint` | Biome (JavaScript, JSON, CSS): lint and format check |
| `npm run lint:py` | Ruff (Python): lint and format check |
| `npm run format`, `npm run format:py` | Rewrite files with Biome, or with Ruff |
| `npm run check` | Lint (with format check), build, unit tests and the smoke test, in that order; no Python needed. Run this before calling a change done |
| `npm run check:all` | `check`, then `lint:py` and `test:data`. Run it when touching `scripts/data/` or after `update-data` |
| `npm run update-data` | After a game patch: fetch the newest game data CSVs into `data/`, regenerate `src/data/` and rebuild |

For a UI change, also open `dist/index.html` and look at it at desktop width and at 960 px. Test layers and conventions are in [docs/engineering/testing.md](docs/engineering/testing.md).

## After a game patch

1. `npm run update-data` fetches the newest CSVs, regenerates `src/data/` (recording the source commit) and rebuilds.
2. `npm run check`, then review the diff of the generated files.

Which test numbers may change after a patch and which must not is in [data-pipeline.md, section 9](docs/engineering/data-pipeline.md#9-updating-after-a-game-patch) and [testing.md, section 6](docs/engineering/testing.md#6-after-a-game-patch). To regenerate from the CSVs you already have (for example after changing a generator), run `python scripts/data/regen.py`. Never edit `src/data/*` by hand.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run check` and the long `tests/full/` sweep on every push to `dev` or `main` and on pull requests. It publishes `dist/index.html` only from `main` (on a push, or by hand from the Actions tab), and only after those checks pass. One-time setup: in the repository's Settings → Pages, set Source to **GitHub Actions**. The page is then at `https://<owner>.github.io/<repo>/`. It is a single file with no paths to fix, so it works under that subpath as is.

## Documentation

[docs/README.md](docs/README.md) is the index, with a reading order. `docs/mechanics/` covers the game side: the stat model and sync, validation against game data, materia. `docs/engineering/` covers the code: architecture, the data pipeline, the optimizer, testing. [docs/glossary.md](docs/glossary.md) defines the game and project terms. [CLAUDE.md](CLAUDE.md) holds the project's working rules, for people and for Claude Code sessions alike.

## Contributing

The full rules are in [CLAUDE.md](CLAUDE.md); start the docs at [docs/README.md](docs/README.md). The ones that matter most:

- **Branches.** Work on a feature branch off `dev`, merge it into `dev`, and move `dev` to `main` (fast-forward when possible). Never commit on `main`: a push to `main` deploys the live page. Builds from any other branch show a DEV badge.
- **Done means `npm run check` passes.** For UI changes, also look at the page at full width and at 960 px. Run `npm run check:all` when touching `scripts/data/`, and `npm run test:full` and `npm run perf` when changing the optimizer's scoring, pruning or search.
- **Code rules** (details in [architecture.md](docs/engineering/architecture.md)):
  - Core code takes a JobContext (`makeJobContext(jobId)`) and uses its neutral stat keys (`main`, `crit`, `det`, `dh`, `spd`, `spec`, `vit`), never job-specific ones such as `piety` or `mind`.
  - Read item database rows through `ROW` (`row[ROW.ilvl]`), never by position.
  - Keep big data (the item database, search results) out of Alpine's reactive state; components build a `view` object and templates only display it.
  - Write a rule once and share it; two copies drift.
  - `src/data/` is generated: change `scripts/data/` and regenerate, never edit it by hand.
- **Tests.** Unit tests go in `tests/unit/<module>.test.js` (Node), generator tests in `tests/data/` (Python), page regressions in `tests/e2e/smoke.mjs`. Some modules are tested from a file named after a concern (`level-sync`, `multi-slot`), so to find a module's tests, search for its path: `grep -l "core/sync-target.js" tests/unit/*.js`. Expected values come from real items and published numbers, not from the tool's own output; see [testing.md](docs/engineering/testing.md).

## Data

Item stats, the item level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data; the page footer names the commit used. The speed-to-GCD formulas follow AkhMorning's guide, a community reference rather than game files. The substat share rule (100/70%, plus a fixed 20% Direct Hit line on older healer gear) is inferred: a pattern measured on real items, not something stored in the game files. Only Piece stats depends on it; the optimizer and the gear browser use each item's real stats.

## License and credits

- **Code and docs:** MIT, see [LICENSE](LICENSE).
- **Game data and icons:** the FINAL FANTASY XIV game data in `src/data/` (item names and stats, level tables, food) and the 23 job icons in `src/data/job-icons.js` are © SQUARE ENIX CO., LTD. and are not covered by the MIT licence. This is an unofficial, non-commercial fan tool.
- **Data source:** [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining); each generated file records the commit it came from.
- **Formulas:** the speed, GCD, tier, defense and food formulas follow [AkhMorning](https://www.akhmorning.com/); sync rules and caps were checked against [xivgear](https://xivgear.app/) and the [Console Games Wiki](https://ffxiv.consolegameswiki.com/). Each is credited where it is used (`docs/mechanics/`); they are re-implemented from the published maths, and no code is copied from them.
- **Bundled:** Alpine.js and @vue/reactivity, both MIT; the build keeps their notices at the top of the page's script.

**Privacy.** The page loads its fonts from Google Fonts, which sees each visitor's IP address. It has no analytics or cookies; settings are saved only in the browser's `localStorage`.
