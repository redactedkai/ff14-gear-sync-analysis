# Roadmap: ideas not yet built

Candidates for the next stage; each needs the owner's go-ahead. The page has felt "overwhelming" before, so a new feature should replace or simplify controls where it can.

Related pages: [validation.md](validation.md), [optimizer.md](optimizer.md), [math.md](math.md), [data-pipeline.md](data-pipeline.md).

| When | Idea | Notes |
| --- | --- | --- |
| Next | Materia and food optimizer, as a third tab | Pick melds (on gear at or below the cap) and food to reach a stat target or a GCD tier. Scope still to be settled. |
| Next | Target GCD in the optimizer | "Reach this GCD tier, then maximize the target", through the engine's existing speed range. May fit best with the materia and food tab. |
| Later | Verify the sync assumptions in game | The main stat and Vitality clamp, the lower-substat clamp (strongly supported, see validation.md), the shield cap (two-handed minus one-handed) and the cap of pieces with their own slot share (one-handed weapon 100, cloak 220) are inferred. See [validation.md, section 8](validation.md#8-open-question-in-game-captures). |
| Later | Diagnostics view for the pieces the formula misses | 40 of 16,601 pieces; see [validation.md, section 2](validation.md#what-the-misses-look-like). |
| Later | Stat breakpoint visualizer | Show where each substat's next step (tier) is from the current gear, repurposed from AkhMorning's stat tier tables. Builds on the GCD tier math the page already has. |
| Later | Save and share a pool or a result | By a JSON file or a URL; check URL length, since pools can be large. |
