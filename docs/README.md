# Documentation

Gear Sync Analysis is a single-page calculator for Final Fantasy XIV. Some FFXIV content syncs a character down: it caps the stats on gear above an item level (item level sync) or lowers the character's level (level sync; both in the [glossary](glossary.md#game-terms)). Given a job and an item level sync cap, it shows what the stats on a piece of gear become under sync, and it searches real gear from the game files for the combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity and so on). It covers all 23 combat jobs and ships as one HTML file that opens from disk.

These pages explain the model behind it, the evidence for that model, and how the code is built and tested. Every claim is marked verified (game files, the FFXIV Wiki, real items, tests) or inferred. How to build and run the page is in the [root README](../README.md); the rules for working in the repo are in [CLAUDE.md](../CLAUDE.md).

## Folders

- `mechanics/`: how the game works, as this project models it, and the evidence for it.
- `engineering/`: how the code is built, fed with game data and tested.
- This folder: the glossary, the roadmap, the history of corrections, and `diagrams/` (the SVG files and the style guide).

## Reading order

New to FFXIV: read the [glossary](glossary.md) first, or keep it open.

1. **Mechanics**: [math.md](mechanics/math.md), then [validation.md](mechanics/validation.md), then [materia.md](mechanics/materia.md).
2. **Engineering**: [architecture.md](engineering/architecture.md), [data-pipeline.md](engineering/data-pipeline.md), [optimizer.md](engineering/optimizer.md), [tier-ranking.md](engineering/tier-ranking.md), [ui.md](engineering/ui.md), [sheets.md](engineering/sheets.md), [testing.md](engineering/testing.md). [perf-log.md](engineering/perf-log.md) holds the dated benchmark runs; open it when you need an old timing. [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md) is a reference table; open it when you need a code.
3. **Before changing anything**: [history.md](history.md) (mistakes not to repeat) and [roadmap.md](roadmap.md) (feature ideas: to build, built).

Shorter paths:

- The math only: math.md, then validation.md.
- The gear search only: optimizer.md, then materia.md sections 3 and 4 (section 4 uses the score from optimizer.md section 3).
- Tier ranking: optimizer.md sections 2 to 6, then tier-ranking.md.
- After a game patch: data-pipeline.md section 9, then testing.md section 6.

### First change in 90 minutes

For a new contributor who wants to make a first, safe change without reading all the pages. About 90 minutes and roughly 9,000 words (an estimate, not measured). Afterwards a change is safe in the area read.

1. [Root README](../README.md), down to "Develop" (10 min). Build the page and click through it.
2. This page (5 min).
3. [glossary.md](glossary.md), "Game terms" only (10 min). Keep it open.
4. [math.md](mechanics/math.md) (25 min): "The model at a glance", sections 1 to 3, section 4 down to the worked example, then section 5 "The clamp rule" and "Caps at item level 123". Skip the rest until needed.
5. [architecture.md](engineering/architecture.md), sections 1 to 3 down to "Each area derives a view" (15 min).
6. [CLAUDE.md](../CLAUDE.md): "Code rules", "Readability", "Tests and docs" (10 min).
7. [testing.md](engineering/testing.md): sections 1, 4 and 5 (10 min).
8. [optimizer.md](engineering/optimizer.md): "Overview in plain words" only (5 min).

Then by task:

- **Data work:** [data-pipeline.md](engineering/data-pipeline.md) section 1, section 4.1 "Selection", section 9.
- **Search work:** optimizer.md sections 1 to 5, then tier-ranking.md.
- **Page work:** [ui.md](engineering/ui.md) and architecture.md section 3.
- **Any claim about the game:** [validation.md](mechanics/validation.md) sections 1 and 11.
- **Before changing a rule:** [history.md](history.md), "Lessons".

## Pages

**Mechanics** (`mechanics/`)

| Page | What it covers |
| --- | --- |
| [math.md](mechanics/math.md) | The stat model: budget table, slot shares, the per-item stat factor, double rounding, substat shares; which pieces are synced (item level and level sync) and the cap rule; weapon damage and defense; speed, GCD and DoT/HoT ticks, substat tiers, character panel totals and food; the status of its weapon damage, speed and food claims |
| [validation.md](mechanics/validation.md) | Every check of the model against outside data (real items, the Wiki's caps at item level 475, AkhMorning's tier tables), every synced stat against ffxiv-gearing and xivgear, the optimizer against brute force, which test asserts what, the in-game evidence still missing, and the one table of every claim's status (verified, inferred, assumed) |
| [materia.md](mechanics/materia.md) | Meld rules (values, item level gates, slots, caps), the best melds of one piece, why one melded version per piece is exact, substat tiers, checks against xivgear |

**Engineering** (`engineering/`)

| Page | What it covers |
| --- | --- |
| [architecture.md](engineering/architecture.md) | Layers, the job context, the shared store and views, what is saved in the browser, the single-file build, the dev loop, pieces and gear sets, recipes and the solver session, the optimizer's worker |
| [data-pipeline.md](engineering/data-pipeline.md) | The game sheets used, fetching, the shared format file, item database rules and fields, the item level table, the food table, routes for the Gear categories filter and each piece's own gear category, provenance, facts about the current data, the steps after a game patch |
| [optimizer.md](engineering/optimizer.md) | How the best gear set is found: an overview in plain words, then the lexicographic score (weapon damage first), Target GCD, dominance pruning, branch and bound, melds in the search, the page's pool and filters (Gear categories), correctness and timing |
| [tier-ranking.md](engineering/tier-ranking.md) | Ranking gear sets by stat tiers: the stages, and the shortfall filter, reduced-cost fixing, regain cuts, trial search and Pareto fronts that make those searches fast |
| [ui.md](engineering/ui.md) | The page's tabs and controls: what each tab shows, a set page's Auto-fill and its settings (Target GCD, the tier switch, character panel totals, the Food menu), the Gear browser's layout, the How the math works sub-tabs |
| [sheets.md](engineering/sheets.md) | The Sheets tab's saved data (sheets, gear sets, piece rows, Auto-fill settings), reading and writing, pins and Auto-fill, drafts and suggestions, the edit lock, names, Copy sheet |
| [testing.md](engineering/testing.md) | Test layers, the test domains, what each test file covers, the brute-force reference, commands, conventions, which expected numbers may move after a patch |
| [perf-log.md](engineering/perf-log.md) | Every dated benchmark run of the optimizer, tier ranking and the page build, newest first: the figures that look like they conflict, and which one applies today; each page keeps one current table |
| [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md) | Working notes: what each `Item.SubcategorySort` code means for gear, piece counts, and how each was checked |

**Top level** (this folder)

| Page | What it covers |
| --- | --- |
| [glossary.md](glossary.md) | FFXIV terms, project terms and outside sources, each linked to the page that explains it |
| [roadmap.md](roadmap.md) | Feature ideas: to build, built |
| [history.md](history.md) | Claims and results that were corrected: what replaced them, how the mistake was found, and when |
| [data-changelog.md](data-changelog.md) | One line per game data update: the datamining commit, rows and meals |
| [READING-SESSIONS.md](READING-SESSIONS.md) | The format of the Dalamud plugin's in-game recordings (session files), for checking the sync model against them |
| [diagrams/STYLE.md](diagrams/STYLE.md) | Where a page goes, how to link, how to write and mark claims, how to draw a diagram |
