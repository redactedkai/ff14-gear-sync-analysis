# Roadmap: ideas not yet built

Candidate expansions for the next stage. None of these is committed to; each needs the owner's go-ahead. The owner has found the page "overwhelming" before, so a new feature should replace or simplify controls where it can, not only add them.

Related pages: [validation.md](validation.md) (evidence still missing), [optimizer.md](optimizer.md), [math.md](math.md).

## Evidence

- **Verify the sync assumptions with in-game captures.** The main stat and Vitality clamp, and the clamp for lower-ranked substats, are inferred. What a useful capture looks like is in [validation.md, section 8](validation.md#8-open-question-in-game-captures). This is the most valuable missing evidence.
- **Diagnostics view for the pieces the formula misses.** About 1.3% of real pieces (217 of 16,584) do not match the formula exactly. Most belong to weapon lines with two equal substats ([validation.md, section 2](validation.md#what-the-misses-look-like)). A view listing them would make the remaining cases easier to study.

## Optimizer

- **Show GCD tiers more prominently.** Put the GCD tier table and the gain needed for the next tier closer to the optimizer result.
- **Stat minimums and maximums.** The engine already supports "maximize one stat with at least / at most this much of another". **The UI deliberately does not expose them**: the owner found the earlier constraint grid excessive. Only revisit with a much simpler control.
- **Compare a pool against a target**: "what is the best I can reach with gear from these sources or tiers?" Needs source data (vendors, drops, crafting), which the `Item` sheet does not have.

## Gear data

- **Materia.** Model melds on gear at or below the cap, with each item's meld limit and the overmeld rules. (Synced-down gear ignores melds in the current model.)
- **Browse by patch or expansion**, for tomestone and crafted gear. Needs `ItemUICategory`- and `ExVersion`-style data, which the pipeline does not fetch yet ([data-pipeline.md](data-pipeline.md)).
- **One-click cap presets for known content** (for example a minimum-item-level raid). Take the list from the owner; do not guess caps.

## Sharing

- **Save and share a pool or a result** by exporting and importing a JSON file. A URL hash was ruled out earlier because the page was then hosted as a claude.ai Artifact, which allowed only a bare token in the hash. The page is now a single local file, so that reason may no longer hold; check before choosing.
