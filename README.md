# ff14-gear-sync-analysis

An FFXIV calculator for understanding how item level sync and level sync work, with an optimizer that picks the gear combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity, and so on) under a sync cap. It works for every combat job and uses real item data from the game files.

It is a single self-contained HTML page. No server, no framework, no runtime dependencies.

## Use it

```
python scripts/build.py     # builds dist/index.html
```

Open `dist/index.html` in a browser. A published copy also lives on claude.ai as an Artifact (see `CLAUDE.md`).

The page has two working tabs and one reference tab:

1. **Item pool**: browse real gear (filtered by the selected job) and add pieces to your pool.
2. **Optimizer**: picks one item per slot (two rings) from the pool to maximize one stat, with two tiebreakers and an optional average-item-level requirement.
3. **How the math works** (reference): Piece lab (how a piece's stats come from its item level) and Sync caps (what the sync cap allows, checked against real gear and the wiki).

## Develop

| Command | What it does |
| --- | --- |
| `npm run build` | Assemble `dist/page.html` (Artifact fragment) and `dist/index.html` (opens in a browser) |
| `npm test` | Node tests of the core math, the optimizer and the formula's accuracy against every real item |
| `npm run smoke` | Playwright browser smoke test (`pip install playwright && playwright install chromium` once) |
| `npm run check` | build, test, smoke |
| `npm run fetch` | Sparse-clone the six datamining CSVs this project needs into `data/` |
| `npm run regen` | Rebuild `src/data.js` and `src/items.js` from those CSVs (run after a game patch) |

Requires Python 3.9+ and Node 18+. Run the commands from the repo root. `npm` is only a convenience; each one is a plain `python` or `node` command listed in `package.json`.

`CLAUDE.md` is the working brief for Claude Code sessions in this repo. `docs/findings.md` holds the domain notes, validation results and open questions.

## Data

Item stats, the item-level budget table and level parameters come from the [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) CSVs, which are exports of the game client's own data. Formulas for the speed-to-GCD conversion follow AkhMorning's guide. The slot-share rule (100/70/20%) is an empirical pattern, not something stored in the game files.
