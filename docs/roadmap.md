# Roadmap: ideas not yet built

Candidate expansions for the next stage. None is committed to; each needs the owner's go-ahead. The owner has found the page "overwhelming" before, so a new feature should replace or simplify controls where it can, not only add them.

Related pages: [validation.md](validation.md) (evidence still missing), [optimizer.md](optimizer.md), [math.md](math.md), [data-pipeline.md](data-pipeline.md).

## Next

- **Materia and food optimizer, as a third tab.** Model melds on gear at or below the cap (each item's meld limit and the overmeld rules) and pick food, to reach a stat target or a GCD tier. Synced-down gear ignores melds in the current model, so this only helps pieces at or below the cap. Scope and controls still to be settled with the owner.
- **Target GCD in the optimizer.** One picker: "reach this GCD tier, then maximize the target". It would set a speed minimum (and optionally a maximum, so no speed is wasted past the tier) through the engine's speed range, which already exists and is tested. xivgear has a similar target GCD, but only in its meld and food solver, so this may fit best with the materia and food tab. Limits on other stats were removed from the engine: the owner found the earlier constraint grid excessive, and only the GCD case is worth a control.
- **Leave out dungeon gear.** Crafted, tomestone and ultimate toggles are done, from the game files. Dungeon loot is not in the game files (it lives on the servers), so this needs an outside source. The official Lodestone duty pages list complete loot tables (all 55 gear pieces for each recent dungeon checked, including Mistwake and The Clyteum), and their duty categories are the game's own content types; Teamcraft and Garland Tools are incomplete for recent patches. Scraping the Lodestone during `npm run update-data` is the candidate; it is a grey area under Square Enix's terms, so it needs the owner's go-ahead.

## Later

- **Verify the sync assumptions with in-game captures.** The main stat and Vitality clamp, and the clamp for lower-ranked substats, are inferred. What a useful capture looks like is in [validation.md, section 8](validation.md#8-open-question-in-game-captures). This is the most valuable missing evidence.
- **Diagnostics view for the pieces the formula misses.** About 1.3% of real pieces (217 of 16,584) do not match the formula exactly; most belong to weapon lines with two equal substats ([validation.md, section 2](validation.md#what-the-misses-look-like)). A list of them would make the remaining cases easier to study.
- **Filter gear by expansion or patch.** Needs `ExVersion`-style data the pipeline does not fetch yet. May share work with the source toggles above.
- **One-click cap presets for known content** (for example a minimum-item-level raid). Take the list from the owner; do not guess caps.
- **Save and share a pool or a result**, by a JSON file or a URL. A URL hash was ruled out while the page was a claude.ai Artifact; the page is now on GitHub Pages, so that reason no longer applies. Pools can be large, so check the URL length before choosing.
