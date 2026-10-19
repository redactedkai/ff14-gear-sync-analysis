# Data changelog

One line per game data update: the date and short id of the [ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining) commit the data was generated from, its commit message, and the database rows and meals, with their change since the previous update. The regeneration adds the line by itself when it runs on a commit not listed yet ([data-pipeline.md, section 9](engineering/data-pipeline.md#9-updating-after-a-game-patch)). Add a few words after it on what changed: a new job, a new gear category, counts the regeneration reported as moved.

The log starts with commit `d9582a6`; earlier updates are in the git history of `src/data/`.

- 2026-09-30, `d9582a6` "TC 7.25 (#119)": 20,031 rows, 296 meals
