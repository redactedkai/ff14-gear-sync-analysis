# Validation: checking the model against external truth

The tool predicts stats from formulas. This page lists every check of those predictions against something the code did not produce: the game's own item data, the FFXIV Wiki, and AkhMorning's speed formulas. It also says which tests assert each check, and what evidence is still missing.

Related pages: [math.md](math.md) (the formulas being checked), [optimizer.md](optimizer.md) (the gear search and its correctness checks), [data-pipeline.md](data-pipeline.md) (where the item data comes from), [testing.md](testing.md) (how the tests are organised).

All numbers were produced by running the code against the data in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30).

## 1. Sources of truth

| Source | What it gives | Used for |
| --- | --- | --- |
| Game item data (`Item` sheet) | The final stats on 17,577 real combat pieces | Accuracy of the per-piece formula (section 2), the worked piece (section 4), real-gear optimizer pools (section 6) |
| FFXIV Wiki, Item Level Sync page | Published substat caps at item level 475 | The sync clamp rule (section 3) |
| AkhMorning (community reference), [Skill and Spell Speed page](https://www.akhmorning.com/allagan-studies/stats/speed/) | GCD and DoT formula, and its published tier tables ("2.5s Tiers" for a chosen level) | Speed and GCD (section 5) |

Expected values in the tests are of three kinds, and each section below says which:

- **External truth**: a number from the game data, the Wiki or AkhMorning. Evidence that the model is right.
- **Independent derivation**: a number the test computes itself from raw game data (for example an `ItemLevel` row times a `BaseParam` slot share), without calling the function under test. It checks the code against the stated rule, but the rule is only as good as its own evidence.
- **Brute-force reference**: the optimizer's answer compared with a search that tries every legal loadout. Evidence that the search finds the true best for the model's stats, not that the stats are right.
- **Regression value**: a number the code produced once, now pinned so it cannot change silently. It protects against regressions but is not evidence that the model is right.

## 2. Every real piece, by item level band

**What is compared.** For every database piece at item level 110 or above with at least two substats, the model predicts all its stats from its item level and slot alone: main stat and Vitality at full share, substats at 100% / 70% / 20% by their rank on the piece (see [math.md, section 4](math.md#4-the-stats-on-a-piece)). For predicted stats $\hat s_k$ and real stats $s_k$, a piece counts as

$$
\text{exact if } \max_k |\hat s_k - s_k| = 0, \qquad \text{within 1 if } \max_k |\hat s_k - s_k| \le 1 .
$$

Every stat on the piece has to match, not just one.

| Item level | Pieces | Exact | Within ±1 on every stat |
| --- | ---: | ---: | ---: |
| 110–135 | 956 | 930 (97.3%) | 934 (97.7%) |
| 136–300 | 3,771 | 3,748 (99.4%) | 3,756 (99.6%) |
| 301–600 | 7,184 | 7,153 (99.6%) | 7,184 (100.0%) |
| 601+ | 4,673 | 4,536 (97.1%) | 4,545 (97.3%) |
| All | 16,584 | 16,367 (98.7%) | 16,419 (99.0%) |

**Verified** (game data; external truth). What this does and does not show:

- The budget table, the slot shares, the double rounding and the 0.9 Vitality factor are confirmed by these matches. With a single rounding the same check gives 79.1% exact (see [math.md, section 4](math.md#the-formula)).
- The 100 / 70 / 20 substat shares remain an **inferred** pattern. They fit almost every piece, but the game files do not store them.
- Only 301–600 reaches 100.0%, and only for "within 1". No band is 100% exact.

### What the misses look like

There are 217 misses in total (26, 23, 31 and 137 per band). Grouping them (a probe run for this page, not a committed test):

- **142 of the 217 are weapons whose two largest substats are equal**: both are at the full slot budget, where the rank rule expects the second at 70%. They all belong to a few weapon lines: Hyperconductive (item level 230, 14 items), Manderville (615, 20), Amazing Manderville (630, 20) and four Phantom stages (745, 760, 775, 790; 22 each). The 601+ band's 137 misses are all weapons or off-hands, 128 of them from this group.
- Of the other 75, 52 are off by exactly 1, and 31 are shields or other off-hands (for example Vanguard Shield, item level 672: Critical Hit 63, predicted 62).
- The rest are small groups at item level 110: pieces that carry both Strength and Dexterity (the model predicts a single main stat), and pieces whose third substat is a few points above the 20% value.

Two Vermilion Cloaks (item level 300), body pieces that also cover the head and whose stats are far above the body budget, used to be among the misses. The generator now leaves out gear that occupies more than one slot ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)), so they are no longer in the database.

So the largest single group follows a different, simple pattern (two substats at 100%). Why those lines are built that way is **not known**; the data only shows the pattern. The off-by-one cases are not explained. Possible causes, neither confirmed, are hand-tuned values and a different rounding for off-hands. A diagnostics view for these pieces is on the [roadmap](roadmap.md).

**Tests.** The validation unit test requires, in every band, at least 95% exact and at least 96% within 1, and prints each band's figures as a test diagnostic. The page's "Checked against real gear" panel shows the same table, because the page and the test call the same function. The thresholds are lower than today's figures on purpose, so new gear after a patch can move them; a band below the threshold means the model needs a look ([data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch)).

## 3. Published sync caps at item level 475

The FFXIV Wiki's Item Level Sync page lists the substat caps at item level 475. The model's cap for a slot with share $p$ is $\operatorname{round}(\text{budget}_{\text{sub}}(475) \times p / 1000)$, with $\text{budget}_{\text{sub}}(475) = 1314$:

| Slot | Share $p$ (‰) | $1314 \times p / 1000$ | Model | Wiki |
| --- | ---: | ---: | ---: | ---: |
| Accessory | 67 | 88.04 | 88 | 88 |
| Head, hands, feet | 85 | 111.69 | 112 | 112 |
| Body, legs | 135 | 177.39 | 177 | 177 |
| One-handed weapon | 100 | 131.4 | 131 | 131 |
| Shield | 40 | 52.56 | 53 | 53 |

**Verified** (external truth): 5 of 5 match.

What this confirms: the clamp rule (each stat on a piece above the cap is limited to the full-share value of a same-slot piece at the cap) for **substats**. What it does not cover: the main stat, Vitality, and whether lower-ranked substats clamp against the full-share value or their own share. The Wiki lists one cap per slot and only for substats ([math.md, section 5](math.md#what-is-assumed)).

**Tests.** The validation unit test checks all five rows; the sync unit test checks the one-handed weapon and shield rows through a Paladin's caps (so the job-dependent weapon path is covered too); the smoke test checks that the page's Wiki table says "match" on every row.

### The caps at item level 123

The caps at 123 (head, hands, feet 29; body, legs 47; accessories 23; two-handed weapon 48; main stat 30 / 48 / 24 / 50; Paladin one-handed weapon 35 / 36 and shield 14 / 14) come from the same rule that reproduces the Wiki at 475. No published source lists them, and **no real piece carries them: the game has no gear at item level 123** (`Item.csv` has 260 items at 120, 137 at 125 and none in between), so they cannot be read off real items. What the data does support:

- **Independent derivation, every slot.** The caps unit test (`caps-real-items.test.js`) computes each slot's caps from `ItemLevel` row 123 (main stat 355, substat 346) and the `BaseParam` slot percents typed into the test, without calling `capsFor`, and checks that the page's caps equal them for Sage, Warrior (each armor slot, accessory and two-handed weapon) and Paladin (one-handed weapon and shield). Changing a slot percent or the rounding in the code makes it fail.
- **External truth on both sides of 123.** In the same test, every real piece at item level 120 and 125 with a main stat and a substat, in all twelve slot codes, has the main stat $\operatorname{round}(\text{row} \times \text{share})$ for its own row, and the largest substat in each slot equals the same value (120: head 29, body 46, accessory 23, two-handed 47; 125: head 30, body 47, accessory 24, two-handed 49). One exception: the two item level 120 shields carry Tenacity 13 and a 9, no 100%-share substat (the derived value is 14); the item level 125 shield carries 14. Half-up rounding at an exact .5 (which Paladin's one-handed main-stat cap, 35.5 → 36, depends on) matches 125 of 126 real pieces whose main stat lands on an exact half.

So the caps at 123 are an **independent derivation** backed by real pieces at the neighbouring rows, not external truth. The formula unit test, the sync caps view test and the smoke test (six jobs: Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon) assert the same numbers. The sync unit test derives the head caps itself from `ItemLevel` row 123 (substat 346, main stat 355, Vitality 375) and the head share of 85 ‰, without calling `capsFor`: $\operatorname{round}(346 \times 0.085) = 29$, $\operatorname{round}(355 \times 0.085) = 30$. It then clamps a real item level 130 head piece one item level above the cap and expects every stat to equal the smaller of its own value and that derived cap (Spell Speed 29, main stat 30), and does the same at cap 129 (main stat 32, Vitality 32, substats 31). That is an independent derivation from game data, so it checks the code against the rule; it is still not evidence that the game applies the rule at 123 (only the Wiki rows at 475 are).

## 4. The worked piece: an item level 130 healer head piece

A real item level 130 healer head piece has, in the game data, Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6. Building a head piece at 130 with Spell Speed, Piety and Direct Hit in that order reproduces all five values ([math.md, worked example](math.md#worked-example-a-healer-head-piece-at-item-level-130)). **Verified** (game data; external truth).

- The formula unit test builds the piece and expects these five values.
- The views unit test finds every real item level 130 Sage head piece with three substats in the database (two in the current data, chosen by properties, not by name), checks that both carry 33 / 32 / 31 / 22 / 6, and that the Piece lab, given each piece's substats in rank order, shows its real values raw and the head caps at 123 synced.
- The smoke test enters the same piece in the page's Piece lab and checks the five raw values and the synced Mind 30 and Spell Speed 29. The synced values are model output (section 3).

## 5. Speed and GCD

The GCD and DoT/HoT formulas are AkhMorning's community formulas, not game files ([math.md, section 6](math.md#6-speed-gcd-and-dothot-ticks)). Their inputs, $\text{sub}$ and $\text{div}$ per level, come from the game's `ParamGrow` sheet.

AkhMorning's [Skill and Spell Speed page](https://www.akhmorning.com/allagan-studies/stats/speed/) publishes tier tables: pick a level under "Show data for level" and the view "2.5s Tiers"; each row is the first speed of a new GCD tier, with its delta from the level's base (that delta is gear speed here) and the DoT scalar. The values below were read from that page on 2026-10-11 at levels 50, 90 and 100. The page text adds that at level 100 "2.49 happens at the 1st [tier], then 2.48s at the 5th, 2.47s at the 9th", one tier every 2780 / 130 = 21.38 points. The tables are generated by AkhMorning's own implementation of the formula with their level modifiers (level 50: SUB 341, DIV 341; level 100: 420, 2780, the same as `ParamGrow`), so a match shows the code and its inputs agree with the published reference. It is not an in-game measurement.

| Check | Values | Source | Asserted in a test? |
| --- | --- | --- | --- |
| Level 100 tiers | gear speed 22 → 2.49 s, 107 → 2.48 s, 193 → 2.47 s, 1,219 → 2.35 s, 1,818 → 2.28 s, 1,904 → 2.27 s, 2,845 → 2.16 s | AkhMorning tier table (external truth) | Yes, speed unit test (each start, one point below it still on the previous tier, and the DoT scalar) |
| Level 90 tiers | 15 → 2.49 s, 74 → 2.48 s, 834 → 2.35 s, 1,594 → 2.22 s | AkhMorning tier table (external truth) | Yes, speed unit test |
| Level 50 tiers | 3 → 2.49 s, 14 → 2.48 s, 150 → 2.35 s, 202 → 2.30 s, 286 → 2.22 s, 297 → 2.21 s, 307 → 2.20 s, 349 → 2.16 s | AkhMorning tier table (external truth) | Yes, speed unit test (also that `gcdTiers` lists them) |
| No gear speed | 0 → 2.50 s at levels 50, 90, 100 | AkhMorning tier tables (first row) | Yes, speed unit test |
| Level 100 tier around 1,839 gear speed | tier starts at 1,818, next at 1,904 | AkhMorning tier table (external truth) | Yes, views unit test |
| Tier lookup at every level | the tier start and next threshold equal a step-by-step scan of the GCD formula, 5 seeded speeds per level 1 to 100 | independent reference (same formula) | Yes, views unit test |
| Generic maximum at cap 123 | 296 gear speed → 2.22 s at level 50 | 296: independent derivation (sum of the ten armor and accessory substat caps from `ItemLevel` row 123 and the `BaseParam` shares; no real gear exists at 123). 2.22 s for 296: AkhMorning's level 50 table (tiers at 286 and 297) | Yes, caps unit test (the derived sum, its GCD, and the generic-piece optimizer for Sage and Warrior reaching it); optimizer and views unit tests |

The level-50 thresholds used to have no recorded source; they now match AkhMorning's level 50 table row for row. The tier-lookup check confirms the fast lookup agrees with the formula; it says nothing about whether the formula matches the game. The 296 total is full-share speed in every armor and accessory slot at cap 123, $3 \times 29 + 2 \times 47 + 5 \times 23$; the caps unit test derives it from `ItemLevel` row 123 and the slot shares without calling the code, and checks that the optimizer reaches it.

## 6. The optimizer against the true best

The optimizer works on real item stats, so it does not depend on the substat shares. Its checks compare it with a brute force that tries every legal loadout, not with outside data. The brute force shares the optimizer's rule for a piece's synced stats, so these checks test the search, not the clamp (the clamp is section 3). In short (details and numbers in [optimizer.md, section 7](optimizer.md#7-correctness-and-performance) and [testing.md, section 2.1](testing.md#21-the-brute-force-reference-and-the-real-gear-pools)):

- **Real-gear pools** (brute-force reference): seven jobs, one or two per role (White Mage, Sage, Warrior, Paladin, Dragoon, Bard, Black Mage), each with every item it can equip in a small item level window between 120 and 135 (3,072 to 147,456 loadouts). For every substat as the target, synced to 123 and unsynced, the optimizer's target, main stat and Vitality totals equal the brute force.
- **Unique rings** (brute-force reference): item level 130 Sage gear whose only ring is Unique wears it once (235 Spell Speed synced, 243 unsynced); with two copies allowed the same ring is worn twice (258 / 267).
- **Constraints** (brute-force reference): Warrior gear at item level 130 to 135 (32 items, 98,304 loadouts): speed minimums, maximums and ranges, and infeasible requirements.
- **Random pools** (brute-force reference): 400 seeded random pools (rings with 1 and 2 copies, Unique items, tiebreaks, speed ranges) and 200 pools with very large tiebreak values; regressions for the ring pruning bug and the score weights ([history.md](history.md)).
- **Page views and the built page** (brute-force reference): the optimizer and per-stat ceiling views on real Black Mage and Warrior gear, and the smoke test's Sage and Warrior pools (Spell Speed 247 / 255, Skill Speed 85 / 87), equal the brute force.
- **Real-gear probe** (run for the docs, not a committed test): 22 jobs × 35 item level windows × sync on and off × every stat as target = 9,800 runs, each against the exact optimum. The current code misses 0. The old ring rule missed 360.

None of these totals has been checked in game. They show the search returns the best loadout for the model's synced stats; whether the game syncs those pieces to the same values is the open question in section 8.

## 7. Which tests assert what

| Test | Checks | Kind of expected value |
| --- | --- | --- |
| Validation unit test | Band accuracy thresholds; Wiki 475 caps; highest real item level inside the budget table | External truth (game data, Wiki) |
| Formulas unit test | Caps at 123 per slot; the item level 130 healer head piece from the formula; Paladin weapon mode | Head piece: external truth (game data). Caps at 123: the values the caps unit test derives |
| Caps unit test (`caps-real-items`) | No gear exists at item level 123; real pieces at 120 and 125 in every slot carry round(row × share) as main stat and largest substat; the page's caps at 123 equal caps derived from `ItemLevel` row 123 and the `BaseParam` shares (Sage, Warrior, Paladin); the ten armor and accessory caps sum to 296, 2.22 s at level 50, and the generic-piece optimizer reaches that sum | Pieces at 120 and 125: external truth (game data). Caps at 123 and 296: independent derivation. 2.22 s: external truth (AkhMorning) |
| Sync unit test | Clamp edge cases on a real item level 130 head piece (at, below, one above the cap; unknown item level; no special substat; missing stats); Paladin Wiki 475 caps | Wiki rows: external truth. Head caps at 123 and 129: independent derivation from `ItemLevel` and the 85 ‰ share (not `capsFor`). Edge cases: rules of the model |
| Speed unit test | GCD tier starts and DoT scalars at levels 50, 90 and 100; 2.50 s with no gear speed; `gcdTiers` at level 50 | External truth (AkhMorning tier tables) |
| Optimizer unit test | Seven real-gear pools, every substat, synced and unsynced; Unique ring worn once; generic maximum 296 / 2.22 s | Pools and rings: brute-force reference. Generic maximum: independent derivation (caps unit test) |
| Optimizer-exhaustive unit test | Optimizer equals the brute force on random pools; ring and score-weight regressions; too-large scores throw; the two policies the brute force copies (a single ring only when no pair exists; a slot is never left empty to meet the speed maximum) on hand-made pools | Brute-force reference. Policies: rules of the engine |
| Optimizer-constraints unit test | Speed minimum, maximum and range, infeasible cases, truncation, empty pool on real Warrior gear | Brute-force reference |
| Views unit test | Optimizer and ceiling views on real gear; a lone Unique ring; Piece lab on the real item level 130 head pieces; sync caps view; GCD tier text and tier lookup; browse and pool counts | Real gear: brute-force reference. Piece lab raw values: external truth (game data). Caps, 296: independent derivation (caps unit test). Tier at 1,839: external truth (AkhMorning). Tier lookup: independent scan |
| Items unit test | Item browser filters, pool item mapping, copies of Unique rings | Real rows from the database, picked by properties |
| Piece-subs unit test | Piece lab substat ranks never repeat | Rules of the page |
| Data-format and provenance unit tests | Shape of the generated data; recorded data source | Format definition |
| State unit test | Saved page state is repaired field by field; removed hypothetical and hand-entered pieces are dropped | Rules of the page |
| Generator tests (Python) | 18 tests on small CSV fixtures (slots, exclusions including multi-slot gear, stat placement, HQ rule, job mask, Unique flag, sort order, budget columns, level data) | Hand-built fixtures |
| Smoke test (browser) | In the built page: caps at 123 for six jobs, Wiki 475 table, Piece lab head piece values, real-gear optimizer totals for Sage and Warrior synced and unsynced, Paladin off-hand; no `undefined`/`NaN`/`null` text, no JavaScript errors, no horizontal scroll at 400 px | Caps and Wiki: as in the unit tests. Piece lab raw values: external truth. Optimizer totals: computed by the core and the brute force in Node at test time |

## 8. Open question: in-game captures

Four parts of the sync model have no direct evidence ([math.md, section 5](math.md#what-is-assumed)):

1. the main stat and Vitality are clamped like substats (with the 0.9 Vitality factor for Intelligence and Mind jobs);
2. lower-ranked substats clamp against the full-share cap, not against their own share (for a 70% Piety on a head piece at cap 123: 29, not $\operatorname{round}(29 \times 0.7) = 20$);
3. melds (materia) on synced-down gear are ignored;
4. sync never raises a stat.

Captures from the game are **the single most valuable evidence the project does not have**. A useful capture is a character sheet screenshot taken under a known sync cap (the duty name, or the cap item level), with the equipped gear listed by name, and ideally the same character unsynced for comparison. One capture with a piece whose second substat is above the cap (for example a 70% substat of 30 or more on a head piece at cap 123) would settle point 2 directly; the main stat and Vitality on the same sheet would settle point 1. Each capture should become a test case with the screenshot's numbers as the expected values.

## Where this lives

| Concept | File |
| --- | --- |
| Band accuracy, Wiki 475 table (shared by page and tests) | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`, `WIKI475`) |
| Prediction of a real piece's stats | `src/core/formulas.js` (`predictRaw`) |
| GCD, tier scan and tier lookup | `src/core/speed.js` (`gcdFor`, `gcdTiers`, `gcdTierAt`) |
| "Checked against real gear" panel | `src/ui/components/validation-panel.js` |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`) |
| Unit tests named above | `tests/unit/validation.test.js`, `formulas.test.js`, `sync.test.js`, `speed.test.js`, `optimizer.test.js`, `optimizer-exhaustive.test.js`, `optimizer-constraints.test.js`, `views.test.js`, `items.test.js`, `piece-subs.test.js`, `data-format.test.js`, `provenance.test.js`, `state.test.js` |
| Generator tests | `tests/data/test_generators.py` |
| Smoke test | `tests/e2e/smoke.py` |
