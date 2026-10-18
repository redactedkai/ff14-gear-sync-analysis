# Documentation

Gear Sync Analysis is a single-page calculator for Final Fantasy XIV. Given a job and an item level sync cap, it shows what the stats on a piece of gear become under sync, and it searches real gear from the game files for the combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity and so on). It covers all 23 combat jobs and ships as one HTML file that opens from disk.

These pages explain the model behind it, the evidence for that model, and how the code is built and tested. Every claim is marked verified (game files, the FFXIV Wiki, real items, tests) or inferred. How to build and run the page is in the [root README](../README.md); the rules for working in the repo are in [CLAUDE.md](../CLAUDE.md).

## Folders

- `mechanics/`: how the game works, as this project models it, and the evidence for it.
- `engineering/`: how the code is built, fed with game data and tested.
- This folder: the glossary, the roadmap, the history of corrections, and `diagrams/` (the SVG files and the style guide).

## Reading order

New to FFXIV: read the [glossary](glossary.md) first, or keep it open.

1. **Mechanics**: [math.md](mechanics/math.md), then [validation.md](mechanics/validation.md), then [materia.md](mechanics/materia.md).
2. **Engineering**: [architecture.md](engineering/architecture.md), [data-pipeline.md](engineering/data-pipeline.md), [optimizer.md](engineering/optimizer.md), [tier-ranking.md](engineering/tier-ranking.md), [testing.md](engineering/testing.md). [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md) is a reference table; open it when you need a code.
3. **Before changing anything**: [history.md](history.md) (mistakes not to repeat) and [roadmap.md](roadmap.md) (feature ideas and which are built).

Shorter paths:

- The math only: math.md, then validation.md.
- The gear search only: optimizer.md, then materia.md sections 3 and 4 (section 4 uses the score from optimizer.md section 3).
- Tier ranking: optimizer.md sections 2 to 6, then tier-ranking.md.
- After a game patch: data-pipeline.md section 9, then testing.md section 6.

## Pages

**Mechanics** (`mechanics/`)

| Page | What it covers |
| --- | --- |
| [math.md](mechanics/math.md) | The stat model: budget table, slot shares, the per-item stat factor, double rounding, substat shares; which pieces are synced (item level and level sync) and the cap rule; speed, GCD and DoT/HoT ticks; a verified and assumed table |
| [validation.md](mechanics/validation.md) | Every check of the model against outside data (real items, the Wiki's caps at item level 475, AkhMorning's tier tables), every synced stat against ffxiv-gearing and xivgear, the optimizer against brute force, which test asserts what, and the in-game evidence still missing |
| [materia.md](mechanics/materia.md) | Meld rules (values, item level gates, slots, caps), the best melds of one piece, why one melded version per piece is exact, substat tiers, checks against xivgear |

**Engineering** (`engineering/`)

| Page | What it covers |
| --- | --- |
| [architecture.md](engineering/architecture.md) | Layers, the job context, the shared store and views, what is saved in the browser, the single-file build, the dev loop |
| [data-pipeline.md](engineering/data-pipeline.md) | The game sheets used, fetching, the shared format file, item database rules and fields, the item level table, provenance, facts about the current data, the steps after a game patch |
| [optimizer.md](engineering/optimizer.md) | How the best gear set is found: lexicographic score, dominance pruning, branch and bound, correctness and timing |
| [tier-ranking.md](engineering/tier-ranking.md) | Ranking gear sets by stat tiers: the stages, and the shortfall filter, reduced-cost fixing, regain cuts, trial search and Pareto fronts that make those searches fast |
| [testing.md](engineering/testing.md) | Test layers, what each test file covers, the brute-force reference, commands, conventions, which expected numbers may move after a patch |
| [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md) | Working notes: what each `Item.SubcategorySort` code means for gear, piece counts, and how each was checked |

**Top level** (this folder)

| Page | What it covers |
| --- | --- |
| [glossary.md](glossary.md) | FFXIV terms, project terms and outside sources, each linked to the page that explains it |
| [roadmap.md](roadmap.md) | Feature ideas, each marked built or not |
| [history.md](history.md) | Claims and results that were corrected: what replaced them, how the mistake was found, and when |
| [diagrams/STYLE.md](diagrams/STYLE.md) | Where a page goes, how to link, how to write and mark claims, how to draw a diagram |
