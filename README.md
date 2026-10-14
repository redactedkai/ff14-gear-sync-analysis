# Gear Sync Analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for all 22 combat jobs and uses real item data from the game files.

It builds to a single self-contained HTML page, `dist/index.html`, that opens from disk with no server. The only outside request is the Google Fonts stylesheet; offline, the page falls back to system fonts. The npm package is named `ff14-gear-sync-analysis`.

## Requirements

- Node 22 or later. Run `npm install` once. Building the page needs only Node.
- Python 3.9 or later, for the generator tests (part of `npm test`), the smoke test, linting and the data pipeline: `python -m pip install -r requirements-dev.txt`, then once `python -m playwright install chromium`.

Run all commands from the repo root.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser. For development, `npm run dev` rebuilds on every change and serves the page locally.

Pick your job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one. A fresh page starts with no job, level 100 and sync off; **Reset to defaults** gets back there. Your settings and pool are saved in the browser, so they come back on the next visit. Switching jobs clears the pool and job-specific settings, after a warning.

Once a job is chosen, the page has two working tabs and one reference tab:

1. **Gear pool**: one table of real gear for the selected job. Tick a row to add it to your pool; switch between **All gear** and **My pool**. HQ-capable crafted gear is marked HQ, and rings that can be worn on both hands ×2.
2. **Gear optimizer**: picks one item per slot (two rings) from the pool to maximize one stat, with two optional tiebreakers. A Materia switch (on by default) gives each piece its best melds. In the Gear pool tab, ticked groups (crafted, tomestone, relic, current Savage, ultimate, PvP) are excluded from the lists and the search.
3. **How the math works** (reference): Piece stats (how a piece's stats come from its item level) and Sync limits (what the sync cap allows, checked against real gear and the Wiki).

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (core logic, page views, data format, saved state) and the Python data generator tests |
| `npm run smoke` | Browser smoke test of the built page (build first); prints `no errors` when it passes |
| `npm run lint` | Biome (JavaScript, JSON, CSS) and Ruff (Python): lint and format check |
| `npm run format` | Rewrite files with Biome and Ruff formatting |
| `npm run check` | Lint (with format check), build, all tests and the smoke test, in that order. Run this before calling a change done |
| `npm run update-data` | After a game patch: fetch the newest game data CSVs into `data/`, regenerate `src/data/` and rebuild |

For a UI change, also open `dist/index.html` and look at it at desktop width and at about 400 px. Test layers and conventions are in [docs/engineering/testing.md](docs/engineering/testing.md).

## After a game patch

1. `npm run update-data` fetches the newest CSVs, regenerates `src/data/` (recording the source commit) and rebuilds.
2. `npm run check`, then review the diff of the generated files.

Which test numbers may change after a patch and which must not is in [data-pipeline.md, section 9](docs/engineering/data-pipeline.md#9-updating-after-a-game-patch) and [testing.md, section 6](docs/engineering/testing.md#6-after-a-game-patch). To regenerate from the CSVs you already have (for example after changing a generator), run `python scripts/data/regen.py`. Never edit `src/data/*` by hand.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the unit tests, builds `dist/index.html` and publishes it on every push to `main` (or by hand from the Actions tab). One-time setup: in the repository's Settings → Pages, set Source to **GitHub Actions**. The page is then at `https://<owner>.github.io/<repo>/`. It is a single file with no paths to fix, so it works under that subpath as is.

## Documentation

[docs/README.md](docs/README.md) is the index, with a reading order. `docs/mechanics/` covers the game side: the stat model and sync, validation against game data, materia. `docs/engineering/` covers the code: architecture, the data pipeline, the optimizer, testing. [docs/glossary.md](docs/glossary.md) defines the game and project terms. [CLAUDE.md](CLAUDE.md) is the working brief and the owner's rules for Claude Code sessions in this repo.

## Data

Item stats, the item level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data; the page footer names the commit used. The speed-to-GCD formulas follow AkhMorning's guide, a community reference rather than game files. The substat share rule (100/70%, plus a fixed 20% Direct Hit line on older healer gear) is inferred: a pattern measured on real items, not something stored in the game files. Only Piece stats depends on it; the gear pool and the optimizer use each item's real stats.
