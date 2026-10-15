# Roadmap: ideas not yet built

Candidates for the next stage; each needs the owner's go-ahead. The page has felt "overwhelming" before, so a new feature should replace or simplify controls where it can.

Feature ideas only. Findings and open evidence questions belong on the page they concern; the in-game captures the sync model still needs are in [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures).

Related pages: [optimizer.md](engineering/optimizer.md), [materia.md](mechanics/materia.md), [validation.md](mechanics/validation.md).

| When | Idea | Notes |
| --- | --- | --- |
| Later | Target GCD | "Reach this GCD tier, then maximize the target", through the engine's speed range. Needs every unbeaten meld version per piece; the engine refuses melds with a speed range today ([optimizer.md, section 6](engineering/optimizer.md#why-one-melded-version-per-piece-is-exact)). |
| Later | Food | Add food to the totals and tiers. It shifts every tier. |
| Later | Save and share a pool or result | As a JSON file or a URL. Pools can be large, so check URL length. |
| Later | Sets for comparison | Keep several optimizer results side by side (for example the same pool under different targets or tiebreaks) and compare their stats and tiers. |
| Later | Check sync caps against ffxiv-gearing | Validation only, not an integration: compare our synced stats with [ffxiv-gearing](https://asvel.github.io/ffxiv-gearing/) at every duty sync it offers, as was done with xivgear's meld caps ([materia.md, section 3](mechanics/materia.md)). A first test (2026-10-14) matched except where a stat factor is below 100% (it rounds the cap once, off by 1 in 839 of 28,386 cases) and shields (it uses the 40% share). |
| Later | Export to and import from xivgear | Export a result as an xivgear link (the set in the URL, with the item level cap; no login or server), import a set from an xivgear link. xivgear drops gear below item level 290 (except Blue Mage and Beastmaster), so the export is off for such sets, with a reason. Needs game item and materia ids in the item data first. Testing: a semi-exhaustive browser sweep (every job, each sync setting, several optimizer targets) that opens each exported set in xivgear and checks items, melds and synced stats against ours, plus import round trips. |
