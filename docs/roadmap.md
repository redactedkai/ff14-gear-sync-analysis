# Roadmap: feature ideas

Feature ideas only; each needs the owner's go-ahead. An ID (A1, A2, ...) names an idea; IDs are never reused. A new feature should replace or simplify controls where it can: the page has felt "overwhelming" before. Findings and open questions belong on the page they concern (in-game captures still needed: [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures)).

## To build

In build order (owner, 2026-10-15).

| ID | Idea | Notes |
| --- | --- | --- |
| A4 | Gear sets and comparison | A sheet of sets for one job, level and cap: optimizer results and the player's own sets, compared by their stats and tiers. The player's own sets come first. |
| A3 | Save and share | A JSON file or a URL, holding the settings, the sets and the pieces picked from the same-result menus. After A4. |
| A11 | Relics with allocated substats | The optimizer leaves these relics out today, since the game files hold no substats for them ([optimizer.md, section 7](engineering/optimizer.md#7-the-pages-pool-and-its-filters)). Model the allocation so it can pick one. After A4. |

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

## Out of scope

- **A6, export to and import from xivgear** (owner, 2026-10-18). xivgear has no gear below item level 290 outside Blue Mage and Beastmaster, so it would not work below level 70. It would also tie the page to another project's format. xivgear stays a reference for checking our math.
