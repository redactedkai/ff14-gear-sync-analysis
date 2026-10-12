# Validation: checking the model against external truth

The tool predicts stats from formulas. This page lists every check of those predictions against something the code did not produce: the game's own item data, the FFXIV Wiki, and AkhMorning's speed formulas. It also says which tests assert each check, and what evidence is still missing.

Related pages: [math.md](math.md) (the formulas being checked), [optimizer.md](optimizer.md) (the gear search and its correctness checks), [data-pipeline.md](data-pipeline.md) (where the item data comes from), [testing.md](testing.md) (how the tests are organised).

All numbers were produced by running the code against the data in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30).

## 1. Sources of truth

| Source | What it gives | Used for |
| --- | --- | --- |
| Game item data (`Item` sheet) | The final stats on 17,286 real combat pieces | Accuracy of the per-piece formula (section 2), the worked piece (section 4), real-gear optimizer pools (section 6) |
| FFXIV Wiki, Item Level Sync page | Published substat caps at item level 475 | The sync clamp rule (section 3) |
| Game `BaseParam` sheet, `MeldParam` table, and `Item.BaseParamModifier` | Per-item stat percentages: each item names a column (Vitality 90 on every Intelligence/Mind piece, every main stat 90 on four-main-stat pieces) | The stat factor, read per item (section 2) |
| xivgear (community gear planner), [source at commit 6c3c878](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/datamanager_new.ts) | How it computes sync caps, including shields (two-handed cap minus one-handed cap) | Agreement on the off-hand rule (section 2); a community reference, not external truth |
| AkhMorning (community reference), [Skill and Spell Speed page](https://www.akhmorning.com/allagan-studies/stats/speed/) | GCD and DoT formula, and its published tier tables ("2.5s Tiers" for a chosen level) | Speed and GCD (section 5) |

Expected values in the tests are of three kinds, and each section below says which:

- **External truth**: a number from the game data, the Wiki or AkhMorning. Evidence that the model is right.
- **Independent derivation**: a number the test computes itself from raw game data (for example an `ItemLevel` row times a `BaseParam` slot share), without calling the function under test. It checks the code against the stated rule, but the rule is only as good as its own evidence.
- **Brute-force reference**: the optimizer's answer compared with a search that tries every legal loadout. Evidence that the search finds the true best for the model's stats, not that the stats are right.
- **Regression value**: a number the code produced once, now pinned so it cannot change silently. It protects against regressions but is not evidence that the model is right.

## 2. Every real piece, by item level band

**What is compared.** For every database piece at item level 110 or above with at least two substats, the model predicts all its stats from its item level, slot and item kind alone: main stats and Vitality at full share times the item's stat factor, substats at 100% / 70% / 20% by their rank on the piece (see [math.md, section 4](math.md#4-the-stats-on-a-piece)). For predicted stats $\hat s_k$ and real stats $s_k$, a piece counts as

$$
\text{exact if } \max_k |\hat s_k - s_k| = 0, \qquad \text{within 1 if } \max_k |\hat s_k - s_k| \le 1 .
$$

Every stat on the piece has to match, not just one.

| Item level | Pieces | Exact | Within ±1 on every stat |
| --- | ---: | ---: | ---: |
| 110–135 | 956 | 944 (98.7%) | 944 (98.7%) |
| 136–300 | 3,774 | 3,772 (99.9%) | 3,774 (100.0%) |
| 301–600 | 7,187 | 7,162 (99.7%) | 7,184 (100.0%) |
| 601+ | 4,684 | 4,683 (100.0%) | 4,683 (100.0%) |
| All | 16,601 | 16,561 (99.8%) | 16,585 (99.9%) |

**Verified** (game data; external truth). What this does and does not show:

- The budget table, the slot shares, the double rounding and the stat factor are confirmed by these matches. The factor is read from the game files for each item (`BaseParam.MeldParam`, column `Item.BaseParamModifier`; [math.md, section 4](math.md#the-stat-factor-of-an-item)). With a single rounding the same check gives 80.0% exact (13,273; see [math.md, section 4](math.md#the-formula)).
- Reading the factor from the item, instead of from the piece's main stat (Vitality × 0.9 when the main stat is Intelligence or Mind), changed no prediction on any piece that has a main stat, except to fix the 13 pieces with all four main stats (all five of their main-stat and Vitality lines were 10% too high). It also lets the check cover pieces with no main stat, which the old rule could not predict: the band table gains the ten Occult accessories at 745, all exact (it was 16,550 of 16,586 before). Over the whole database, 17,222 of 17,286 pieces are now exact (99.6%), against 17,197 of the 17,265 the old rule could predict.
- **Main Attribute and Secondary Attribute.** Sixteen pieces carry the game's generic Main Attribute and Secondary Attribute (`BaseParam` 55 and 56) instead of a named main stat: the ten Occult accessories, the five pre-order earrings and Neophyte's Ring. The database now stores both (it used to drop them, so these pieces had no main stat). The check counts Main Attribute as a main stat and Secondary Attribute as a substat, each with its own factor (100 for every item kind). Twelve are exact: the Occult accessories, Aetheryte Earring and Neophyte's Ring (its Determination 25 is the 70% share next to Secondary Attribute 35) (**verified**). Four are misses (below).
- Five pieces carry no main stat at all: five Serpentskin pieces at 150 with Vitality only (14 and 22, far below any budget). They are outside the band check. Not explained.
- The 100 / 70 / 20 substat shares remain an **inferred** pattern. They fit almost every piece, but the game files do not store them.
- The model includes three refinements read off real pieces ([math.md, sections 3 and 4](math.md#4-the-stats-on-a-piece)): equal substats share the higher rank, every main stat counts, and an off-hand is the two-handed value minus the one-handed value. Before them the check gave 98.7% exact (16,369); they fix 141, 10 and 30 pieces. xivgear computes shield caps with the same off-hand rule (two-handed cap minus one-handed cap), which agrees with it but is not in-game evidence.
- Only 601+ is 100.0% exact.

### What the misses look like

There are 40 misses in total (12, 2, 25 and 1 per band), in five groups (a probe run for this page, not a committed test):

- **18 at item level 380**: Intelligence and Mind head, hands and feet carry Vitality 80 where the formula gives 79 ($1040 \times 85 / 1000 = 88.4 \to 88$, $\times 0.9 = 79.2 \to 79$; a single rounding would give 80). These 18 are every Intelligence and Mind head, hands and feet piece at 380 (Elemental, Omicron and Rakshasa; Strength and Dexterity head pieces there carry 88, as the formula says). Not a rounding error in the formula: of eight rounding orders tried, every one that gives 80 here is wrong on at least 1,017 other Intelligence and Mind pieces, and no other budget value fits either (the head needs a Vitality budget of 1,042 or more, the body 1,040 or less). The 380 pieces all follow one variant, the 90% applied to the budget before the slot share, at every slot; at the 76 other item levels where that variant and the formula disagree, real pieces follow the formula. Cause unknown; an anomaly confined to item level 380.
- **12 level-50 crafted HQ pieces at item level 110**: their Direct Hit gets no HQ bonus and sits at 25% of the slot's substat budget (4 on the accessories), outside the shares. **Explained**: it is the old Accuracy stat. The official patch 4.0 notes say "The \"accuracy\" attribute has been changed to \"direct hit\"" and that "the attributes of certain gear ... have been adjusted" ([patch 4.0 notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/8937c86379b2124393409732025dac57f23839bc)), and archived wiki pages from before 4.0 show Accuracy in that position (Ebony Cane: Accuracy 9, now Direct Hit 11; [Gamer Escape, 2015](https://web.archive.org/web/20150125060027/http://ffxiv.gamerescape.com:80/wiki/Ebony_Cane)). The converted values follow no share rule that the data shows, so these stay misses. The same holds for 13 item level 50 Replica High Allagan and Dreadwyrm healer pieces the check does not cover.
- **4 weapon and shield pairs** (Alexandrian Metal Blade and Buckler, item level 275; Palaka Shamshir and Pelta, 536): each pair adds up to the two-handed value, but one stat is split 1 off between them.
- **4 Main Attribute earrings**: Azeyma's (560), Bozjan and Menphina's (430) carry Main Attribute and Vitality at the full value although their item kind (0) gives Vitality 90%; Halone's Earring (690) carries both at 90% (Main Attribute 212 where the full value is 236), although Main Attribute's own factor is 100. Aetheryte Earring, of the same kind, has Main Attribute at full and Vitality at 90%. The five pre-order earrings follow no single rule. Not explained.
- **2 at item level 595** (Troian legs): Tenacity and Piety follow the common substat column of the budget table, not their own (1 lower). Not yet adopted into the model.

The two Vermilion Cloaks (item level 300), body pieces that also cover the head, used to be among the misses when they were treated as plain body pieces (135 per mille). They now have their own slot code with the game's body-plus-head share, 220 per mille (`ChestHeadPercent` in `BaseParam`), and the formula reproduces both exactly (**verified**) ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)).

Why the relic weapon steps carry two full substats is **not known**; the data only shows the pattern. The remaining misses are not explained. A diagnostics view for these pieces is on the [roadmap](roadmap.md).

**Tests.** The validation unit test requires, in every band, at least 98.5% exact and within 1, checks five real pieces the refinements reproduce (two relic weapons, a two-main-stat piece and two shields), and prints each band's figures as a test diagnostic. The page's "Checked against real gear" panel shows the same table, because the page and the test call the same function. The thresholds are lower than today's figures on purpose, so new gear after a patch can move them; a band below the threshold means the model needs a look ([data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch)).

## 3. Published sync caps at item level 475

The FFXIV Wiki's Item Level Sync page lists the substat caps at item level 475. The model's cap for a slot with share $p$ is $\operatorname{round}(\text{budget}_{\text{sub}}(475) \times p / 1000)$, with $\text{budget}_{\text{sub}}(475) = 1314$:

| Slot | Share $p$ (‰) | $1314 \times p / 1000$ | Model | Wiki |
| --- | ---: | ---: | ---: | ---: |
| Accessory | 67 | 88.04 | 88 | 88 |
| Head, hands, feet | 85 | 111.69 | 112 | 112 |
| Body, legs | 135 | 177.39 | 177 | 177 |
| One-handed weapon | 100 | 131.4 | 131 | 131 |
| Shield | 140 − 100 | 183.96 − 131.4 | 184 − 131 = 53 | 53 |

**Verified** (external truth): 5 of 5 match.

What this confirms: the clamp rule (each stat on a piece above the cap is limited to the full-share value of a same-slot piece at the cap) for **substats**. What it does not cover: the main stat, Vitality, and whether lower-ranked substats clamp against the full-share value or their own share. The Wiki lists one cap per slot and only for substats ([math.md, section 5](math.md#what-is-assumed)).

**Tests.** The validation unit test checks all five rows; the sync unit test checks the one-handed weapon and shield rows through a Paladin's caps (so the job-dependent weapon path is covered too); the smoke test checks that the page's Wiki table says "match" on every row.

### The caps at item level 123

The caps at 123 (head, hands, feet 29; body, legs 47; accessories 23; two-handed weapon 48; main stat 30 / 48 / 24 / 50; Paladin one-handed weapon 35 / 36 and shield 13 / 14) come from the same rule that reproduces the Wiki at 475. No published source lists them, and **no real piece carries them: the game has no gear at item level 123** (`Item.csv` has 260 items at 120, 137 at 125 and none in between), so they cannot be read off real items. What the data does support:

- **Independent derivation, every slot.** The caps unit test (`caps-real-items.test.js`) computes each slot's caps from `ItemLevel` row 123 (main stat 355, substat 346) and the `BaseParam` slot percents typed into the test, without calling `capsFor`, and checks that the page's caps equal them for Sage, Warrior (each armor slot, accessory and two-handed weapon) and Paladin (one-handed weapon and shield). Changing a slot percent or the rounding in the code makes it fail.
- **External truth on both sides of 123.** In the same test, every real piece at item level 120 and 125 with a main stat and a substat, in all twelve slot codes, has the main stat $\operatorname{round}(\text{row} \times \text{share})$ for its own row, and the largest substat in each slot equals the same value (120: head 29, body 46, accessory 23, two-handed 47; 125: head 30, body 47, accessory 24, two-handed 49). Shields follow the off-hand rule: the two item level 120 shields carry Tenacity 13 (47 − 34; the 40 ‰ share would give 14) and the item level 125 shield 14 (49 − 35). Half-up rounding at an exact .5 (which Paladin's one-handed main-stat cap, 35.5 → 36, depends on) matches 125 of 126 real pieces whose main stat lands on an exact half.

So the caps at 123 are an **independent derivation** backed by real pieces at the neighbouring rows, not external truth. The formula unit test, the sync caps view test and the smoke test (six jobs: Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon) assert the same numbers. The sync unit test derives the head caps itself from `ItemLevel` row 123 (substat 346, main stat 355, Vitality 375) and the head share of 85 ‰, without calling `capsFor`: $\operatorname{round}(346 \times 0.085) = 29$, $\operatorname{round}(355 \times 0.085) = 30$. It then clamps a real item level 130 head piece one item level above the cap and expects every stat to equal the smaller of its own value and that derived cap (Spell Speed 29, main stat 30), and does the same at cap 129 (main stat 32, Vitality 32, substats 31). That is an independent derivation from game data, so it checks the code against the rule; it is still not evidence that the game applies the rule at 123 (only the Wiki rows at 475 are).

## 4. The worked piece: an item level 130 healer head piece

A real item level 130 healer head piece has, in the game data, Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6. Building a head piece at 130 with Spell Speed, Piety and Direct Hit in that order reproduces all five values ([math.md, worked example](math.md#worked-example-a-healer-head-piece-at-item-level-130)). **Verified** (game data; external truth).

- The formula unit test builds the piece and expects these five values.
- The views unit test finds every real item level 130 Sage head piece with three substats in the database (two in the current data, chosen by properties, not by name), checks that both carry 33 / 32 / 31 / 22 / 6, and that the Piece stats, given each piece's substats in rank order, shows its real values raw and the head caps at 123 synced.
- The smoke test enters the same piece in the page's Piece stats and checks the five raw values and the synced Mind 30 and Spell Speed 29. The synced values are model output (section 3).

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
| Views unit test | Optimizer and ceiling views on real gear; a lone Unique ring; Piece stats on the real item level 130 head pieces; sync caps view; GCD tier text and tier lookup; browse and pool counts | Real gear: brute-force reference. Piece stats raw values: external truth (game data). Caps, 296: independent derivation (caps unit test). Tier at 1,839: external truth (AkhMorning). Tier lookup: independent scan |
| Items unit test | Item browser filters, pool item mapping, copies of Unique rings | Real rows from the database, picked by properties |
| Piece-subs unit test | Piece stats substat ranks never repeat | Rules of the page |
| Stat-factor unit test | The job's factor equals the item factor on every single-main-stat piece of all 22 jobs; only the 13 four-main-stat pieces differ; those 13, the Occult "of Magic" and "of Blood" accessories (Vitality 307 / 341) and Alexandrian Earrings of Casting reproduced; a synced Field Commander's Coat capped at main stat 43 and Vitality 46 at 123 in the optimizer and the gear browser | Game data and independent derivation from `ItemLevel` rows; synced values: rules of the model |
| Data-format and provenance unit tests | Shape of the generated data, including the stat factor table; recorded data source | Format definition |
| State unit test | Saved page state is repaired field by field; removed hypothetical and hand-entered pieces are dropped | Rules of the page |
| Generator tests (Python) | 50 tests on small CSV fixtures (slots, exclusions including multi-slot gear, stat placement, HQ rule, job mask, Unique flag, sort order, budget columns, level data, stat factor kind and table, schema errors) | Hand-built fixtures |
| Smoke test (browser) | In the built page: caps at 123 for six jobs, Wiki 475 table, Piece stats head piece values, real-gear optimizer totals for Sage and Warrior synced and unsynced, Paladin off-hand; no `undefined`/`NaN`/`null` text, no JavaScript errors, no horizontal scroll at 400 px | Caps and Wiki: as in the unit tests. Piece stats raw values: external truth. Optimizer totals: computed by the core and the brute force in Node at test time |

## 8. Open question: in-game captures

Three parts of the sync model have no direct evidence ([math.md, section 5](math.md#what-is-assumed)):

1. the main stat and Vitality are clamped like substats (with the piece's own stat factor, so a Field Commander's piece is capped at 90% of the main-stat cap for every job);
2. lower-ranked substats clamp against the full-share cap, not against their own share (for a 70% Piety on a head piece at cap 123: 29, not $\operatorname{round}(29 \times 0.7) = 20$);
3. sync never raises a stat.

Settled: melds (materia) are ignored on synced-down gear. The owner confirmed it in game: a piece is synced, and its materia stops counting, when its item level is above the duty's item level cap (with item level sync on) or its equip level is above the duty's level.

**Second-hand in-game values (xivgear's test notes).** Azeyma's Earrings (item level 560, item kind 0) synced to item level 430 showed main stat 71, Vitality 72, Direct Hit (Ninja) or Piety (Sage) 79 and Determination 79 in game ([xivgear `item_stats_tests.ts`](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/test/item_stats_tests.ts)). Not captured by this project; quoted from xivgear's code comments.

- **Supports question 1.** The main stat and Vitality are clamped, at the cap of the item's kind: 90% of the full accessory value (78 and 80 at 430), not the full value.
- **Disagrees by 1 on the main stat.** This model computes the cap as $\operatorname{round}(\operatorname{round}(1170 \times 67/1000) \times 0.9) = \operatorname{round}(78 \times 0.9) = 70$, where the game showed 71. xivgear's order, the factor first with floors ($\operatorname{round}(\lfloor \lfloor 1170 \times 90/100 \rfloor \times 67/100 \rfloor / 10) = 71$), gives 71. Vitality (72), Direct Hit and Determination (79) agree under both orders.
- **The orders split.** For an item's own stats, this model's order is far better: it matches 5,820 of 5,842 Intelligence and Mind pieces on Vitality, against 4,639 for xivgear's. Whether sync caps use a different order from item stats is **open**; one second-hand value is not enough to change every Intelligence and Mind Vitality cap.

Captures from the game are **the single most valuable evidence the project does not have**. A useful capture is a character sheet screenshot taken under a known sync cap (the duty name, or the cap item level), with the equipped gear listed by name, and ideally the same character unsynced for comparison. One capture with a piece whose second substat is above the cap (for example a 70% substat of 30 or more on a head piece at cap 123) would settle point 2 directly; the main stat and Vitality on the same sheet would settle point 1. Each capture should become a test case with the screenshot's numbers as the expected values.

## Where this lives

| Concept | File |
| --- | --- |
| Band accuracy, Wiki 475 table (shared by page and tests) | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`, `WIKI475`) |
| Prediction of a real piece's stats | `src/core/formulas.js` (`predictRaw`) |
| GCD, tier scan and tier lookup | `src/core/speed.js` (`gcdFor`, `gcdTiers`, `gcdTierAt`) |
| "Checked against real gear" panel | `src/ui/components/validation-panel.js` |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`) |
| Unit tests named above | `tests/unit/validation.test.js`, `formulas.test.js`, `sync.test.js`, `speed.test.js`, `optimizer.test.js`, `optimizer-exhaustive.test.js`, `optimizer-constraints.test.js`, `stat-factor.test.js`, `views.test.js`, `items.test.js`, `piece-subs.test.js`, `data-format.test.js`, `provenance.test.js`, `state.test.js` |
| Generator tests | `tests/data/test_generators.py` |
| Smoke test | `tests/e2e/smoke.py` |
