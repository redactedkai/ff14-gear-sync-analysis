# Roadmap: ideas not yet built

Candidates for the next stage; each needs the owner's go-ahead. The page has felt "overwhelming" before, so a new feature should replace or simplify controls where it can.

Related pages: [validation.md](validation.md), [optimizer.md](optimizer.md), [math.md](math.md), [data-pipeline.md](data-pipeline.md).

| When | Idea | Notes |
| --- | --- | --- |
| Later | Tier-aware tiebreaks | Keep the target's best tier, then rank the tiebreaks by tier rather than raw total ([materia.md, section 5](materia.md#5-breakpoints)). Needs a lower bound on any stat in the engine, and every unbeaten meld version per piece. |
| Later | Target GCD in the optimizer | "Reach this GCD tier, then maximize the target", through the engine's existing speed range. Melds would then need every meld version of each piece that no other beats, not one best version; the engine refuses melds with a speed range today ([materia.md, section 4](materia.md#4-why-one-melded-version-per-piece-is-exact)). |
| Later | Verify the sync assumptions in game | The main stat and Vitality clamp, the lower-substat clamp (strongly supported, see validation.md), the shield cap (two-handed minus one-handed) and the cap of pieces with their own slot share (one-handed weapon 100, cloak 220) are inferred, and so is "no melds" on the 15 Paladin shields with 0 slots but overmelding allowed ([materia.md, section 2](materia.md#2-the-rules)). See [validation.md, section 8](validation.md#8-open-question-in-game-captures). |
| Later | Diagnostics view for the pieces the formula misses | 40 of 16,601 pieces; see [validation.md, section 2](validation.md#what-the-misses-look-like). |
| Later | Food | Add food to the totals and the tiers; it shifts every tier, so it matters most for the tier rows. |
| Later | Save and share a pool or a result | By a JSON file or a URL; check URL length, since pools can be large. |
