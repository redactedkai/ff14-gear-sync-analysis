# ff14-gear-sync-analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for every combat job and uses real item data from the game files.

It builds to a single self-contained HTML page that needs no server. The only outside request is the Google Fonts stylesheet; offline, the page falls back to system fonts.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser. For development, `npm run dev` rebuilds on every change and serves the page locally.

The page has two working tabs and one reference tab:

1. **Item pool**: browse real gear (filtered by the selected job) and add pieces to your pool.
2. **Optimizer**: picks one item per slot (two rings) from the pool to maximize one stat, with two tiebreakers and an optional average-item-level requirement.
3. **How the math works** (reference): Piece lab (how a piece's stats come from its item level) and Sync caps (what the sync cap allows, checked against real gear and the Wiki).

Set your job, sync cap (item level) and synced level at the top. A fresh page starts at the first job in the game's list, level 100 and that level's own sync item level (690). Your settings and pool are saved in the browser, so they come back on the next visit. Switching jobs clears the pool and job-specific settings, after a warning.

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (core math, optimizer, data, saved state) and the Python data generator tests |
| `npm run smoke` | Browser smoke test of the built page |
| `npm run lint` | Biome (JavaScript, JSON, CSS) and Ruff (Python): lint and format check |
| `npm run format` | Format with Biome and Ruff |
| `npm run check` | Lint (with format check), build, all tests and the smoke test. Run this before calling a change done |
| `npm run update-data` | After a game patch: fetch the newest game data CSVs into `data/`, regenerate the data files and rebuild |

## Requirements

- Node 22 or later. Run `npm install` once.
- Python 3.9 or later, for the generator tests (part of `npm test`), the smoke test, linting and the data pipeline: `python -m pip install -r requirements-dev.txt`, then once `python -m playwright install chromium`. Building the page needs only Node.

Run all commands from the repo root.

## After a game patch

1. `npm run update-data` fetches the newest CSVs, regenerates `src/data/` (recording the source commit) and rebuilds.
2. `npm run check`, then review the diff of the two generated files.

`docs/data-pipeline.md` section 9 lists which test numbers may change after a patch and which must not. To regenerate from the CSVs you already have (for example after changing a generator), run `python scripts/data/regen.py`. Never edit `src/data/*.js` by hand.

## Documentation

[docs/README.md](docs/README.md) is the index: the stat model, validation against game data, the optimizer, the data pipeline, architecture, testing and a glossary of game terms. `CLAUDE.md` is the working brief for Claude Code sessions in this repo.

## Data

Item stats, the item-level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data. The speed-to-GCD formulas follow AkhMorning's guide. The substat share rule (100/70/20%) is a pattern measured on real items, not something stored in the game files.
