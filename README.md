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

1. **Gear pool**: one table of real gear for the selected job. Tick a row to add it to your pool; switch between **All gear** and **My pool**. HQ-capable crafted gear is marked HQ, and rings that can be worn on both hands ×2.
2. **Gear optimizer**: picks one item per slot (two rings) from the pool to maximize one stat, with two optional tiebreakers. It can leave out crafted, tomestone, ultimate, current Savage or relic gear.
3. **How the math works** (reference): Piece stats (how a piece's stats come from its item level) and Sync limits (what the sync cap allows, checked against real gear and the Wiki).

Pick your job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one. A fresh page starts with no job, level 100 and sync off; **Reset to defaults** gets back there. Your settings and pool are saved in the browser, so they come back on the next visit. Switching jobs clears the pool and job-specific settings, after a warning.

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

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the unit tests, builds `dist/index.html` and publishes it on every push to `main` (or by hand from the Actions tab). One-time setup: in the repository's Settings → Pages, set Source to **GitHub Actions**. The page is then at `https://<owner>.github.io/<repo>/`. It is a single file with no paths to fix, so it works under that subpath as is.

## After a game patch

1. `npm run update-data` fetches the newest CSVs, regenerates `src/data/` (recording the source commit) and rebuilds.
2. `npm run check`, then review the diff of the two generated files.

`docs/data-pipeline.md` section 9 lists which test numbers may change after a patch and which must not. To regenerate from the CSVs you already have (for example after changing a generator), run `python scripts/data/regen.py`. Never edit `src/data/*.js` by hand.

## Documentation

[docs/README.md](docs/README.md) is the index: the stat model, validation against game data, the optimizer, the data pipeline, architecture, testing and a glossary of game terms. `CLAUDE.md` is the working brief for Claude Code sessions in this repo.

## Data

Item stats, the item-level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, exports of the game client's own data. The speed-to-GCD formulas follow AkhMorning's guide. The substat share rule (100/70%, plus a fixed 20% Direct Hit line on older healer gear) is a pattern measured on real items, not something stored in the game files.
