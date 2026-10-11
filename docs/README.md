# Documentation

Item Level Stat Lab is a single-page calculator for Final Fantasy XIV. Given a job and an item level sync cap, it shows what the stats on a piece of gear become under sync, and it searches real gear from the game files for the combination that maximizes a chosen stat (Spell Speed, Skill Speed, Piety, Tenacity and so on). It covers all 22 combat jobs and ships as one HTML file that opens from disk. These pages explain the model behind it, the evidence for that model, and how the code is built and tested. Each page separates what is verified (game files, the FFXIV Wiki, real items, tests) from what is inferred.

## Reading order

1. New to the game: [glossary.md](glossary.md) first.
2. The model: [math.md](math.md), then [validation.md](validation.md) for how well it matches real data.
3. The gear search: [optimizer.md](optimizer.md).
4. Working on the code: [architecture.md](architecture.md), [testing.md](testing.md), [data-pipeline.md](data-pipeline.md).
5. Planning: [roadmap.md](roadmap.md), [history.md](history.md), and the audits.

## Pages

| Page | What it covers |
| --- | --- |
| [math.md](math.md) | The stat model: budget table, slot and substat shares, double rounding, the sync clamp, speed and GCD |
| [optimizer.md](optimizer.md) | How the best gear set is found: lexicographic score, dominance pruning, branch and bound, correctness and timing |
| [data-pipeline.md](data-pipeline.md) | Where the game data comes from, how it is generated, provenance, and the steps after a game patch |
| [validation.md](validation.md) | Every check of the model against external truth (real items, Wiki caps, speed examples) and what evidence is still missing |
| [architecture.md](architecture.md) | Layers, the job context, the UI store and views, persistence, the single-file build, the dev loop |
| [testing.md](testing.md) | Test layers, what each test file covers, commands, conventions, numbers that may move after a patch |
| [glossary.md](glossary.md) | FFXIV and project terms, with links to the page that explains each |
| [roadmap.md](roadmap.md) | Ideas not yet built |
| [history.md](history.md) | Claims and results that were corrected, and how the mistakes were found |
| [audit.md](audit.md) | Engineering audit (findings F1 to F15) with a status table |
| [audit-2.md](audit-2.md) | Independent follow-up audit |
| [diagrams/STYLE.md](diagrams/STYLE.md) | Style guide for these pages and their diagrams |
