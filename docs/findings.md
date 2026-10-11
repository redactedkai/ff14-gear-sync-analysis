# Findings, validation and open questions

Notes accumulated while building the first version. `CLAUDE.md` has the short version; this file has the evidence.

## 1. How a piece's stats are produced

Item level is an index into the `ItemLevel` sheet, which holds one budget per stat per item level (Strength, Dexterity, Intelligence, Mind, Vitality, Critical Hit, Determination, Direct Hit Rate, Skill Speed, Spell Speed, Piety, Tenacity). A stat on a piece:

```
slot  = round(table[stat][ilvl] x slotPercent / 1000)     // the slot budget, rounded once
stat  = round(slot x share)                                 // share: 1.0 / 0.7 / 0.2 by substat rank
vit   = round(round(table.vit[ilvl] x slotPercent/1000) x 0.9)   // Int/Mind jobs; x1 for Str/Dex
```

Rounding is half up, and happens **twice**. Using a single rounding is wrong for about 1 piece in 30.

Slot percents come from the `BaseParam` sheet: one-handed weapon 100, off-hand 40, two-handed weapon 140, head/hands/feet 85, body/legs 135, earring/necklace/bracelet/ring 67. The belt slot is 0 (no belt in the game now).

The 100/70/20 substat shares are **not in the game files**. The game stores only the final stats on each item. The shares are a pattern measured from real gear: the piece's strongest substat gets the full slot budget, the second gets 70% of it, and a small third (mostly Direct Hit on healer gear) gets 20%.

## 2. Validation

### Against every real piece (tests/core.test.js, "band" lines)

All combat pieces with at least two substats and item level 110 or higher, with substat shares assigned by rank (about 16,600 pieces, all jobs):

| Item level | Pieces | Exact | Within +/-1 |
| --- | --- | --- | --- |
| 110-135 | 956 | 97% | 98% |
| 136-300 | 3,773 | 99% | 100% |
| 301-600 | 7,184 | 100% | 100% |
| 601+ | 4,673 | 97% | 97% |

The residual misses are not understood in detail. Likely candidates: pieces whose designers hand-tuned a value, and pieces whose substat order does not follow the rank rule. This is worth a future investigation (see section 6).

### Against published sync caps

The FFXIV Wiki (Item Level Sync page) lists the substat caps at item level 475: accessories 88, head 112, body 177, one-handed weapon 131, shield 53. The model reproduces all of them exactly (a test checks this).

### Against GCD references

AkhMorning's level-100 examples, and a set of level-50 tier thresholds (gear speed 150 -> 2.35s, 202 -> 2.30s, 307 -> 2.20s, 349 -> 2.16s), are asserted in the tests.

## 3. The sync model and what is unverified

When item level sync applies at cap C, a piece above the cap has each stat clamped to the value a **100%-share** stat on a same-slot piece at item level C would have. Pieces at or below C are unchanged. At C = 123:

| Slot | Substat cap | Main-stat cap |
| --- | --- | --- |
| Head / hands / feet | 29 | 30 |
| Body / legs | 47 | 48 |
| Earring / necklace / bracelet / ring | 23 | 24 |
| 2H weapon | 48 | 50 |

Unverified or assumed:
- The Mind, Vitality and other main-stat clamp behaves like the substat clamp (inferred; not confirmed in game).
- Melds are ignored on synced-down gear (the model sets them to zero).
- Substats are never scaled **up** by sync.
- Whether a piece's second and third substats are clamped against the 100% value or against their own share. The model uses the 100% value because that matches the Wiki table, but it has no in-game confirmation for lower shares.

If you can capture in-game numbers (a character sheet screenshot under a known sync, with the equipped gear listed), add them as test cases; they are the single most valuable thing the project does not have.

## 4. Item database facts

- 17,579 combat gear rows with item level >= 100 across all patches. The HQ bonus (`BaseParamValueSpecial`) is added only for items with `CanBeHq` true. Adding it for all items inflated the main stat on about 290 relic/raid pieces (found by diffing against the first version).
- `IsUnique` is kept: rings that are Unique can only be worn once, which changed the Dreadwyrm Healing synced Spell Speed from 194 to 171.
- Highest real item level is 795. The `ItemLevel` sheet has 921 rows (0 to 920).

### Where the item level rows above 795 come from

The datamining repository stores CSVs exported straight from the game client (XIVData Oxidizer; SaintCoinach before January 2026), so the 921 rows are in the game's own data and are not computed by the miners. The repository's history for `ItemLevel.csv` has two relevant snapshots:
- January 2026 (exporter migration): 901 rows, ids 0 to 900.
- Patch 7.50 (April 2026): 921 rows, ids 0 to 920. Twenty rows were added and about 120 existing rows from row 766 upward changed value.

The highest equippable item level was 795 in both snapshots. The added rows follow a smooth, nearly linear climb (rows 896 to 920: Mind 10415 up to 11742, substats 4385 up to 4626, Vitality 11409 up to 13163), which looks like budget headroom ahead of released gear. That is an inference. The data cannot show whether it is deliberate planning, and nothing above 795 can be checked against real items.

## 5. Speed and GCD

`ParamGrow` gives `BaseSpeed` (the "sub" level stat) and `LevelModifier` (the "div") per character level, and `ItemLevelSync` (the default sync item level for each level; for example 130 at level 50).

```
gcd(ms)   = floor( base x (1000 + ceil(130 x (sub - speed) / div)) / 10000 ) / 100     // speed = sub + gearSpeed
dotMult   = (1000 + floor(130 x gearSpeed / div)) / 1000
```

Level 50 uses `sub = div = 341`; level 100 uses 420 / 2780. "Gear speed" in the page means the summed gear stat; the character's own base value (`sub`) is added internally. Whether a given action is affected by speed depends on the job, so the page only reports the 2.5 s base GCD and DoT/HoT tick scaling.

Known GCD tier thresholds at level 50: 0 -> 2.50, 3 -> 2.49, 202 -> 2.30, 307 -> 2.20, 349 -> 2.16. The generic-gear maximum under a 123 cap (all armor and accessory slots, weapon excluded) is 296 gear Spell Speed -> 2.22 s.

## 6. Ideas not yet built (candidate expansions)

- Compare a pool against a target: "what is the best I can reach with gear from these specific sources/tiers?" (needs source data: vendors, drops, crafting; not in the item sheet).
- Materia: model melds on gear at or below the cap, with the per-item meld limit and overmeld rules.
- Multi-target optimization: maximize one stat subject to a minimum on another (the engine supports `mins`/`maxs`; the UI deliberately does not expose them after the owner found the constraint grid excessive).
- Show the GCD tier table and the "next tier" marginal gain more prominently in the Optimizer.
- Explain the residual 1 to 3 percent of pieces where the formula misses; list them in a diagnostics view.
- Save and share a pool or a result (URL hash is possible only for a bare token in the Artifact host; use export/import of JSON instead).
- Tomestone/crafted gear browsing by patch or expansion label (needs `ItemUICategory`, `ExVersion`-style data).
- One-click cap presets for known content (for example a minimum-item-level raid), taken from the owner's own list, not guessed.
- Verify the Mind/Vit clamp and the lower-share clamp with in-game captures (see section 3).

## 7. History of corrections (so they are not repeated)

- Early versions assumed Eukrasian-spell GCD behavior and other Sage specifics; those were removed because the tool is job-agnostic.
- A "materia-slot x0.91" explanation of main-stat differences was wrong; the real cause was NQ versus HQ values. The database uses HQ for HQ-able items.
- The first Dreadwyrm result (synced Spell Speed 194 of 200) forgot that the ring is Unique; the correct figures are 171 synced and 176 unsynced.
- A slider maximum of 520 was arbitrary and was replaced by the real maximum item level (795).
- Calling item level rows 796 to 920 an "unused placeholder" was an inference stated as fact; they are simply unused so far.
- No existing item-level-sync calculator could be confirmed by searching. XIVGear's README and site do not describe one. Do not claim novelty without checking again.
