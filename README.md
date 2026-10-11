# ff14-gear-sync-analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for every combat job and uses real item data from the game files.

It builds to a single self-contained HTML page that needs no server. The source is ES modules with an [Alpine.js](https://alpinejs.dev) UI, bundled by esbuild.

## Use it

```
npm install
npm run build     # builds dist/index.html
```

Open `dist/index.html` in a browser.

The page has two working tabs and one reference tab:

1. **Item pool**: browse real gear (filtered by the selected job) and add pieces to your pool.
2. **Optimizer**: picks one item per slot (two rings) from the pool to maximize one stat, with two tiebreakers and an optional average-item-level requirement.
3. **How the math works** (reference): Piece lab (how a piece's stats come from its item level) and Sync caps (what the sync cap allows, checked against real gear and the wiki).

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Bundle everything into `dist/index.html` (opens straight from disk) |
| `npm run dev` | Rebuild on every change and serve `dist/` locally |
| `npm test` | Unit tests (`node:test`) of the core math, the optimizer and the formula's accuracy against every real item |
| `npm run smoke` | Playwright browser smoke test (`pip install playwright && playwright install chromium` once) |
| `npm run check` | build, test, smoke |
| `npm run fetch` | Sparse-clone the six datamining CSVs this project needs into `data/` |
| `npm run regen` | Rebuild `src/data/item-level.js` and `src/data/items.js` from those CSVs, then the page (run after a game patch) |

Requires Node 22+. Python 3.9+ is needed only for the data pipeline and the smoke test. Run the commands from the repo root.

### Layout

| Path | Contents |
| --- | --- |
| `src/core/` | Pure logic with no DOM: stat formulas, sync caps, speed/GCD, item database access, optimizer, validation. Every function takes a `JobContext` (`makeJobContext('SGE')`) describing the selected job |
| `src/ui/` | Alpine store, saved state and one component per page area |
| `src/index.html`, `src/styles.css`, `src/main.js` | Page markup, styles and entry point |
| `src/data/` | Generated game data (do not edit by hand) |
| `scripts/build/` | esbuild build and dev server |
| `scripts/data/` | Fetch and generate game data (Python) |
| `tests/unit/`, `tests/e2e/` | Unit tests and the browser smoke test |

`CLAUDE.md` is the working brief for Claude Code sessions in this repo. `docs/findings.md` holds the domain notes, validation results and open questions. `docs/audit.md` is an engineering audit with a status table of what has been addressed.

## Data

Item stats, the item-level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, which are exports of the game client's own data. Formulas for the speed-to-GCD conversion follow AkhMorning's guide. The slot-share rule (100/70/20%) is an empirical pattern, not something stored in the game files.
