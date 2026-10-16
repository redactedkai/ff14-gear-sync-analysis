# Gear Sync Analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for all 23 combat jobs and uses real item data from the game files.

It builds to a single self-contained HTML page, `dist/index.html`, that opens from disk with no server. The only outside request is the Google Fonts stylesheet; offline, the page falls back to system fonts. The npm package is named `ff14-gear-sync-analysis`.

## Requirements

- Node 22 or later. Run `npm install` once, and `npx playwright install chromium` once for the smoke test. Building and testing the page needs only Node.
- Python 3.9 or later, only for the data pipeline, its generator tests and Ruff: `python -m pip install -r requirements-dev.txt`.

Run all commands from the repo root.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser. For development, `npm run dev` rebuilds on every change and serves the page locally.

Pick your job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one. A fresh page starts with no job, level 100 and sync off; **Reset to defaults** gets back there. Your settings are saved in the browser, so they come back on the next visit. Switching jobs resets the job-specific settings (the optimizer's target and tiebreaks, the browser's slot and sort).

Once a job is chosen, the page has two working tabs and one reference tab:

1. **Gear optimizer** (opens first): picks one item per slot (two rings) from every piece the job can wear to maximize one stat, with two optional tiebreakers. A Materia switch (on by default) gives each piece its best melds. Under **Gear to search**, unticking a group (crafted, tomestone, relic, current Savage, ultimate, PvP) leaves its gear out; current Savage, ultimate and PvP are left out by default.
2. **Gear browser**: one table of real gear for the selected job, with filters and its synced stats, for looking gear up. It has its own gear group boxes. HQ-capable crafted gear is marked HQ, and rings that can be worn on both hands ×2.
3. **How the math works** (reference): Piece stats (what sync does to one piece, and when an overgeared piece has more than a melded one at the cap) and GCD (the same for a full set's GCD), with how each stat is built, checked against real gear and the Wiki.

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (core logic, page views, data format, saved state) |
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

`.github/workflows/pages.yml` runs the unit tests, builds `dist/index.html` and publishes it on every push to `main` (or by hand from the Actions tab). One-time setup: in the repository's Settings → Pages, set Source to **GitHub Actions**. The page is then at `https://<owner>.github.io/<repo>/`. It is a single file with no paths to fix, so it works under that subpath as is.

## Documentation

[docs/README.md](docs/README.md) is the index, with a reading order. `docs/mechanics/` covers the game side: the stat model and sync, validation against game data, materia. `docs/engineering/` covers the code: architecture, the data pipeline, the optimizer, testing. [docs/glossary.md](docs/glossary.md) defines the game and project terms. [CLAUDE.md](CLAUDE.md) is the working brief and the owner's rules for Claude Code sessions in this repo.

## Data

Item stats, the item level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data; the page footer names the commit used. The speed-to-GCD formulas follow AkhMorning's guide, a community reference rather than game files. The substat share rule (100/70%, plus a fixed 20% Direct Hit line on older healer gear) is inferred: a pattern measured on real items, not something stored in the game files. Only Piece stats depends on it; the optimizer and the gear browser use each item's real stats.
