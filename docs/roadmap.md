# Roadmap: feature ideas

Feature ideas only; each needs the owner's go-ahead. An ID (A1, A2, ...) names an idea; IDs are never reused. A new feature should replace or simplify controls where it can: the page has felt "overwhelming" before. Findings and open questions belong on the page they concern (in-game captures still needed: [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures)).

## To build

In build order (owner, 2026-10-15).

| ID | Idea | Notes |
| --- | --- | --- |
| A4 | Gear sets and comparison | A sheet of sets for one job, level and cap: optimizer results and the player's own sets, compared by their stats and tiers. The player's own sets come first. |
| A3 | Save and share | A JSON file or a URL, holding the settings, the sets and the pieces picked from the same-result menus. After A4. |
| A11 | Relics with allocated substats | The optimizer leaves these relics out today, since the game files hold no substats for them ([optimizer.md, section 7](engineering/optimizer.md#7-the-pages-pool-and-its-filters)). Model the allocation so it can pick one. After A4. |
| A12 | Import from xivgear | Bring a set or sheet in from an xivgear link or its exported JSON, as sets in the sheet: pieces, materia and meal by game id, with the job, level and cap; relic substats and custom items are listed as not mapped. After A4. |
| A13 | Split the page template into partials | `src/index.html` is the last file several agents edit at once (about half of the commits that touch `src/`). Move its sections into `src/partials/` with the build's existing `<!-- INCLUDE -->` markers ([architecture.md, section 5](engineering/architecture.md#5-build)). The built page must stay byte for byte the same, as in `de94f60`. After A4. |

## Built

On `dev` at least; live once on `main`.

| ID | Idea | Details |
| --- | --- | --- |
| A1 | Target GCD | [optimizer.md, section 2](engineering/optimizer.md#target-gcd-from-a-gcd-to-a-speed-range) |
| A2 | Food | [math.md, section 6](mechanics/math.md#food) |
| A5 | Check sync caps against ffxiv-gearing | [validation.md, section 9](mechanics/validation.md#9-against-another-tool-ffxiv-gearing) |
| A7 | Rank by tier | [tier-ranking.md](engineering/tier-ranking.md) |
| A8 | Substat tiers (breakpoints) | [math.md, section 6](mechanics/math.md#substat-tiers-breakpoints) |
| A9 | Other pieces with the same result | [ui.md, section 2](engineering/ui.md#other-pieces-with-the-same-result) |
| A10 | Gear from filter | [data-pipeline.md, section 4](engineering/data-pipeline.md#sources) |
