# Roadmap: ideas not yet built

Candidates for the next stage; each needs the owner's go-ahead. The page has felt "overwhelming" before, so a new feature should replace or simplify controls where it can.

Feature ideas only. Findings and open evidence questions belong on the page they concern; the in-game captures the sync model still needs are in [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures).

Related pages: [optimizer.md](engineering/optimizer.md), [materia.md](mechanics/materia.md), [validation.md](mechanics/validation.md).

| When | Idea | Notes |
| --- | --- | --- |
| Later | Tier-aware tiebreaks | Keep the target's best tier, then rank tiebreaks by tier, not raw total ([materia.md, section 5](mechanics/materia.md#5-breakpoints)). Needs a lower bound on any stat in the engine, and every unbeaten meld version per piece. |
| Later | Target GCD | "Reach this GCD tier, then maximize the target", through the engine's speed range. Needs every unbeaten meld version per piece; the engine refuses melds with a speed range today ([materia.md, section 4](mechanics/materia.md#4-why-one-melded-version-per-piece-is-exact)). |
| Later | Diagnostics view for formula misses | List the 24 pieces the formula misses by 1 ([validation.md, section 2](mechanics/validation.md#what-the-misses-look-like)). |
| Later | Food | Add food to the totals and tiers. It shifts every tier. |
| Later | Save and share a pool or result | As a JSON file or a URL. Pools can be large, so check URL length. |
