# Validation: checking the model against external truth

The tool predicts gear stats from formulas. This page is the evidence for those formulas: every check of a prediction against something the code did not produce (the game's own item data, the FFXIV Wiki, AkhMorning's speed formulas) and every comparison with two community gear planners (ffxiv-gearing and xivgear). For each check it says what was compared, how closely it matched, how strong that evidence is, and which test asserts it. Section 8 lists what is still unproven.

Related pages: [math.md](math.md) (the formulas being checked), [optimizer.md](../engineering/optimizer.md) (the gear search and its correctness checks), [data-pipeline.md](../engineering/data-pipeline.md) (where the item data comes from), [testing.md](../engineering/testing.md) (how the tests are organised), [glossary.md](../glossary.md) (game terms).

All numbers were produced by running the code against the data in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30).

**What is being checked.** In Final Fantasy XIV every piece of gear has an [item level](../glossary.md), a [slot](../glossary.md) (head, body, ring, ...) and a set of stats: a **main stat** (Strength, Dexterity, Intelligence or Mind, depending on the job), **Vitality** (hit points), and usually two **substats** (Critical Hit, Determination, Direct Hit, the speed stat, Tenacity or Piety). The game files store each item's final stats, but not how they were made. The project's model claims they are made like this ([math.md, section 4](math.md#4-the-stats-on-a-piece)):

$$
\text{stat} = \operatorname{round}\Big(\operatorname{round}\big(\operatorname{round}(\text{budget}(i) \times p / 1000) \times f\big) \times w\Big)
$$

- $\text{budget}(i)$: the stat's row in the game's budget table at item level $i$;
- $p$: the slot's share of the budget, in thousandths (85 for a head piece);
- $f$: the item's stat factor, a fraction such as 0.9, read from the game files;
- $w$: the substat share, 100% for the piece's highest substat and 70% for the second.

For example, Piety as the second substat on an item level 130 head piece: $363 \times 85/1000 = 30.855 \to 31$, then $31 \times 0.7 = 21.7 \to 22$, and the real piece carries 22 (section 4). Some content also **syncs** gear down to an item level cap, lowering each stat above its cap to the cap ([math.md, section 5](math.md#5-item-level-sync)), and the speed stat sets the GCD, the time between most actions ([math.md, section 6](math.md#6-speed-and-substat-tiers)).

**How the page is laid out.** Sections 2 to 5 test the model against external truth: real items, published caps, one worked piece, and the speed formulas. Section 6 covers the optimizer, section 7 indexes the tests, section 8 lists what no capture of the game supports yet, and sections 9 and 10 compare every synced stat with the two community planners. Section 11 sums up the status of each claim.

## 1. Sources of truth

Which outside sources does the project trust, and how strong is each kind of evidence a test can give?

| Source | What it gives | Used for |
| --- | --- | --- |
| Game item data (`Item` sheet) | Final stats of 17,316 real combat pieces at item level 100 and up | Sections 2, 4 and 6 |
| FFXIV Wiki, Item Level Sync page | Substat caps at item level 475 | The sync clamp (section 3) |
| Game `BaseParam` sheet (`MeldParam`) and `Item.BaseParamModifier` | Per-item stat percentages | The stat factor (section 2) |
| xivgear (community gear planner), [source at commit 6c3c878](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/datamanager_new.ts) | Its sync cap code and in-game notes in its tests; its whole core, run against this project's | Off-hand rule, cap order (section 8); every synced stat compared (section 10) |
| ffxiv-gearing (community gear planner), [source at commit 8d75ef8](https://github.com/Asvel/ffxiv-gearing/tree/8d75ef89c317401727066a28025fb4d860a92f20) | Its synced stats for every piece and duty sync | Section 9 |
| AkhMorning (community reference), [Skill and Spell Speed page](https://www.akhmorning.com/allagan-studies/stats/speed/) | GCD and DoT formula, tier tables | Speed and GCD (section 5) |

Notes:

- Each item names a column of the stat factor table (Vitality 90 on Intelligence/Mind gear, every main stat 90 on four-main-stat gear; [math.md, section 4](math.md#the-stat-factor-of-an-item)).
- xivgear is a community reference, not external truth; its in-game values are second-hand.

**Kinds of expected value.** A test compares the code's output with an expected value. Where that value comes from decides what a pass proves. There are four kinds, and each section below says which it uses:

| Kind | Where the expected value comes from | What a pass shows |
| --- | --- | --- |
| **External truth** | A number from the game data, the Wiki or AkhMorning | Evidence that the model is right |
| **Independent derivation** | A number the test computes itself from raw game data (for example an `ItemLevel` row times a `BaseParam` slot share), without calling the function under test | It checks the code against the stated rule, but the rule is only as good as its own evidence |
| **Brute-force reference** | The optimizer's answer compared with a search that tries every legal loadout | Evidence that the search finds the true best for the model's stats, not that the stats are right |
| **Regression value** | A number the code produced once, now pinned so it cannot change silently | It protects against regressions but is not evidence that the model is right |

## 2. Every real piece, by item level band

Does the formula reproduce the stats of every real piece, not just a few hand-picked ones? The game stores the final stats of every item, so each one is a free test case.

**What is compared.** For every database piece at item level 110 or above with at least two substats, the model predicts all its stats from its item level, slot and item kind (and, for the last two rules below, its rarity, HQ flag or name; [math.md, section 4](math.md#4-the-stats-on-a-piece)):

- every main stat on the piece and Vitality at full share times the item's stat factor;
- substats at 100% / 70% by their rank on the piece, equal substats sharing the higher rank;
- an off-hand as the two-handed value minus the one-handed value;
- Direct Hit on gear whose only main stat is Mind as a fixed 20% line, 25% on green HQ-able pieces with three substats;
- the two rules that go by name (Atma weapons, all-jobs earrings and rings); a third, 18 item level 46 dungeon pieces, applies below the band table.

**The metric.** For predicted stats $\hat s_k$ and real stats $s_k$, a piece counts as

$$
\text{exact if } \max_k |\hat s_k - s_k| = 0, \qquad \text{within 1 if } \max_k |\hat s_k - s_k| \le 1 .
$$

Every stat on the piece has to match, not just one.

| Item level | Pieces | Exact | Within ±1 on every stat |
| --- | ---: | ---: | ---: |
| 110–135 | 984 | 984 (100.0%) | 984 (100.0%) |
| 136–300 | 3,774 | 3,772 (99.9%) | 3,774 (100.0%) |
| 301–600 | 7,187 | 7,165 (99.7%) | 7,187 (100.0%) |
| 601+ | 4,684 | 4,684 (100.0%) | 4,684 (100.0%) |
| All | 16,629 | 16,605 (99.9%) | 16,629 (100.0%) |

**Verified** (game data; external truth). Every piece is within 1 on every stat; 110–135 and 601+ are 100.0% exact.

**What this does and does not show:**

- **The budget table, the slot shares, the double rounding and the stat factor** are confirmed by these matches. The factor is read from the game files for each item ([math.md, section 4](math.md#the-stat-factor-of-an-item)). With a single rounding the same check gives 80.0% exact (13,306; [math.md, section 4](math.md#the-formula)).
- **The shares stay inferred.** The 100 / 70 substat shares and the fixed 20% Direct Hit line on Mind-only gear remain an **inferred** pattern. They fit almost every piece, but the game files do not store them. Why the relic weapon steps carry two full substats is **not known**; the data only shows the pattern.
- **Main Attribute and Secondary Attribute.** Sixteen pieces carry the game's generic Main Attribute and Secondary Attribute (`BaseParam` 55 and 56) instead of a named main stat: the ten Occult accessories, the five pre-order earrings and Neophyte's Ring. The check counts Main Attribute as a main stat and Secondary Attribute as a substat, each with its own factor (100 for every item kind). The ten Occult accessories at 745 are exact with the file's factors. The six all-jobs earrings and rings are exact with their own factors ("Explained exceptions" below); Neophyte's Ring's Determination 25 is the 70% share next to Secondary Attribute 35 (**verified**).
- **Beastmaster.** The 35 pieces only Beastmaster can wear (item level 100 to 135, its one-handed axes and shields included; 28 of them in the 110–135 band) are all exact, the shields by the off-hand rule (**verified**, a unit test checks every one). They carry a Crucible bonus (+9 Strength and Vitality on Guttler) in the HQ bonus columns although they cannot be high quality, so it is not part of their stats ([data-pipeline.md, section 4](../engineering/data-pipeline.md#stats-and-the-hq-bonus)); the game applies it only inside the Crucible, which the tool does not model.
- **Cloaks.** The two Vermilion Cloaks (item level 300), body pieces that also cover the head, have their own slot code with the game's body-plus-head share of 220 ‰, and the formula reproduces both exactly (**verified**; [data-pipeline.md, section 4](../engineering/data-pipeline.md#4-item-database-generation)).

Two wider checks fall outside the band table, the whole database at item level 100 and up and the pieces below it:

![Two flows of real pieces. Item level 100 and up: 17,316 pieces, 17,292 exact (99.9%), 24 off by 1 and none off by more: 18 at item level 380, 4 in two weapon-and-shield pairs (275, 536), 2 Troian legs at 595. Exact because the model has a rule for them: 8 green HQ healer pieces at 110, the 6 all-jobs earrings and rings, the 11 Atma weapons. Below item level 100: 2,715 pieces, 2,695 exact (99.3%), 20 off by 1: 13 Replica High Allagan and Dreadwyrm pieces, 3 crafted weapons, the Plundered Earrings and Ear Cuffs, the Midnight Egg Cap and Harlequin's Acton. Of 42 misses on 2026-10-16, three general rules and the reduced-stat list fixed 22.](../diagrams/validation-funnel.svg)

- The 11 Zodiac Atma weapons (item level 100) are exact because the model predicts them at item level 90: each is a copy of its Zenith step, stat for stat (**verified**, game data; [math.md, section 4](math.md#substat-shares-empirical)).
- The pieces below item level 100 (in the database since 2026-10-15) are all within 1 (a unit test checks it); examined 2026-10-16 ("Below item level 100" below). The stat factor, three-substat and four-main-stat tests stop at 100.

### What the misses look like

The 24 misses in the diagram, 0, 2, 22 and 0 per band (a probe run for this page, not a committed test):

- **18 at item level 380.** Intelligence and Mind head, hands and feet carry Vitality 80 where the formula gives 79 ($1040 \times 85 / 1000 = 88.4 \to 88$, $\times 0.9 = 79.2 \to 79$; a single rounding would give 80). These 18 are every Intelligence and Mind head, hands and feet piece at 380 (Elemental, Omicron and Rakshasa); Strength and Dexterity head pieces there carry 88, as the formula says.
  - It is not a rounding error in the formula. Of eight rounding orders tried, every one that gives 80 here is wrong on at least 1,017 other Intelligence and Mind pieces. No other budget value fits either: the head needs a Vitality budget of 1,042 or more, the body 1,040 or less.
  - The 380 pieces all follow one variant, the 90% applied to the budget before the slot share, at every slot. At the 76 other item levels where that variant and the formula disagree, real pieces follow the formula.
  - Cause unknown; an anomaly confined to item level 380.
- **4 pieces in two weapon-and-shield pairs** (Alexandrian Metal Blade and Buckler, item level 275; Palaka Shamshir and Pelta, 536). Each pair adds up to the two-handed value, but one stat is split 1 off between them.
- **2 at item level 595** (Troian legs). Tenacity and Piety follow the common substat column of the budget table, not their own (1 lower). Not adopted into the model.

These misses are not explained. They affect only Piece stats: the optimizer and the gear browser use each item's real stats.

### Explained exceptions, now in the model

Two groups that used to miss have a known cause and a rule in the model ([math.md, section 4](math.md#substat-shares-empirical)):

- **Eight level 50 crafted HQ healer pieces at item level 110** carry Direct Hit at 25% of the slot's substat budget, not the 20% line. It is the old Accuracy stat, raised in patch 4.0.
  - The official patch 4.0 notes say "The \"accuracy\" attribute has been changed to \"direct hit\"" and that "the attributes of certain gear ... have been adjusted" ([patch 4.0 notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/8937c86379b2124393409732025dac57f23839bc)).
  - Archived wiki pages from before 4.0 show Accuracy in that position. The Ebony Cane had Accuracy 9, exactly the 20% line; it now has Direct Hit 11 ([Gamer Escape, 2015](https://web.archive.org/web/20150125060027/http://ffxiv.gamerescape.com:80/wiki/Ebony_Cane)).
  - The eight are exactly the green (`Rarity` 2), HQ-able Mind-only pieces with three substats. The model applies 25% to that group (fitted to these eight, **inferred**). 13 item level 50 Replica High Allagan and Dreadwyrm healer pieces also carry 25%, but the model does not apply it to them: nothing separates them from the blue crafted pieces at 20% (they are among the remaining misses below).
- **The six all-jobs earrings and rings** (item kind 0 with Main Attribute: Neophyte's Ring, the Aetheryte, Bozjan, Menphina's, Azeyma's and Halone's earrings) follow three factor patterns:
  - Vitality 90% with Main Attribute full (Neophyte's, Aetheryte);
  - both full (Bozjan, Menphina's, Azeyma's; their kind gives Vitality 90%);
  - both 90% (Halone's: Main Attribute 212 where the full value is 236, although its own factor is 100).

  Why: the stats were edited by hand patch by patch, with the factor table, item level and kind unchanged (**verified**, xivapi/ffxiv-datamining history). Neophyte's Main Attribute was 26 at 7.1, 29 at 7.2; Aetheryte 95 / 104 / Vitality 96 at 5.55, 51 / 53 / 46 at 6.0; Bozjan's Determination 124 at 5.35, 177 at 5.4.
  - The model gives each its own main stat and Vitality factor, by name (owner's decision; a test fails if a new piece joins the group).
  - Stored stats only: synced, the game applies the file's 90% (in-game values quoted in xivgear's tests, section 8), which the sync caps already use. One player report conflicts with this under level sync (section 8, "Conflicting report").

### Below item level 100

Three rules that hold for all gear, and one list of names, fixed 22 of the 42 misses (diagram above); no piece at 100 and up changed (every piece's prediction compared before and after):

- **Direct Hit above another substat ranks like any substat.** Wolf Ringbands (PvP, item level 55, Mind only) carry Direct Hit 15 and Piety 11: Direct Hit at 100%, Piety at 70%, not the fixed line. Everywhere else the fixed line is the smallest substat.
- **A third substat tied with the second also takes 70%.** Herklaedi (item level 50, a body piece covering hands, legs and feet) carry Tenacity 75, Determination 53 and Skill Speed 53. It is the only piece with three ranked substats.
- **Vitality only where the piece carries it.** The three starting city rings (Gridanian, Lominsan, Ul'dahn; item level 15) carry only Direct Hit 1.
- **18 dungeon pieces at item level 46 carry reduced stats** (equip level 44; Buccaneer's, Harlequin's, Sentinel's, Templar's and Coliseum head, body, hands, legs and feet): each main stat at 90% of the usual value, Vitality and substats at 80%, rounded after. That fits 17 exactly; Harlequin's Acton's Intelligence stays 1 off. Before, they were off by up to 4. The other 26 pieces of their sets at that level follow the usual rule and nothing in the data marks the 18, so the model lists them by name (owner's decision). **Inferred**, fitted to these 18.

The 20 that still miss (listed in the diagram) are left as they are. The 13 Replica High Allagan and Dreadwyrm healer pieces carry Direct Hit at 25%, like the eight green pieces in "Explained exceptions" above, but nothing separates them from the blue crafted pieces at 20%. The three crafted weapons are the Steel Claymore, Steel-barreled Carbine and Star Globe; the Midnight Egg Cap is a seasonal event piece with four main stats.

### Tests for this section

The validation unit test:

- requires, in every band, at least 98.5% exact and within 1, and prints each band's figures as a test diagnostic;
- checks five real pieces the refinements reproduce (two relic weapons, a two-main-stat piece and two shields);
- checks four for the fixed Direct Hit line (as the only, second and third substat, and Direct Hit ranked normally on Strength gear) and five for the 25% variant (three green crafted pieces at 25%, a blue and a non-HQ sibling at 20%);
- checks that every three-substat piece is Mind-only gear whose third line is Direct Hit;
- checks the 11 Atma weapons (and two Animus weapons at their own item level), and that the all-jobs factor table covers exactly the six pieces, each predicted exactly;
- below item level 100: the five pieces behind the three general rules are exact, the reduced-stat list matches the data (17 of 18 exact, all within 1), and every piece is within 1.

The thresholds are lower than today's figures on purpose, so new gear after a patch can move them; a band below the threshold means the model needs a look ([data-pipeline.md, section 9](../engineering/data-pipeline.md#9-updating-after-a-game-patch)).

## 3. Published sync caps at item level 475

Section 2 checks stats on unsynced gear. Does the sync clamp also match the game? Under an item level cap $C$, each stat of a piece above $C$ is lowered to a cap value for its slot ([math.md, section 5](math.md#the-clamp-rule)). The game does not publish its caps, but the FFXIV Wiki's Item Level Sync page lists the substat caps at item level 475.

For a substat (stat factor 100) the model's cap for a slot with share $p$ is $\operatorname{round}(\text{budget}_{\text{sub}}(475) \times p / 1000)$ ([math.md, section 5](math.md#the-clamp-rule)), with $\text{budget}_{\text{sub}}(475) = 1314$:

| Slot | Share $p$ (‰) | $1314 \times p / 1000$ | Model | Wiki |
| --- | ---: | ---: | ---: | ---: |
| Accessory | 67 | 88.04 | 88 | 88 |
| Head, hands, feet | 85 | 111.69 | 112 | 112 |
| Body, legs | 135 | 177.39 | 177 | 177 |
| One-handed weapon | 100 | 131.4 | 131 | 131 |
| Two-handed weapon | 140 | 183.96 | 184 | 184 |
| Shield | 140 − 100 | 183.96 − 131.4 | 184 − 131 = 53 | 53 |

**Verified** (external truth): 6 of 6 match. The Wiki table cites no source. A second-hand in-game substat cap agrees at another item level: xivgear's test notes give the Blue Mage earring's Critical Hit cap at 270 as 46, "Verified in-game by Wynn" ($\operatorname{round}(685 \times 67 / 1000) = 46$; [`sync_stats_tests.ts`](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/test/stats/sync_stats_tests.ts)).

- **What this confirms:** the clamp rule (each stat on a piece above the cap is limited to the full-share value of a same-slot piece at the cap) for **substats**.
- **What it does not cover:** the main stat and Vitality. The Wiki lists one cap per slot and only for substats; whether lower-ranked substats clamp against the full-share value is settled by the Wiki's Item Level page instead ([math.md, section 5](math.md#what-is-assumed)).

**Tests.** The validation unit test checks all six rows (`wikiChecks` in `src/core/validation.js`; the page no longer shows this table). The sync unit test checks the one-handed weapon and shield rows through a Paladin's caps, so the job-dependent weapon path is covered too.

### The caps at item level 123

The caps at 123 ([math.md, caps at item level 123](math.md#caps-at-item-level-123)) are the example used throughout these pages (123 is the minimum item level of [T13](../glossary.md), a level 50 raid). They come from the same rule that reproduces the Wiki at 475. No published source lists them, and **no real piece carries them: the game has no gear at item level 123** (`Item.csv` has 260 items at 120, 137 at 125 and none in between), so they cannot be read off real items. What the data does support:

- **Independent derivation, every slot.** The caps unit test computes each slot's caps from `ItemLevel` row 123 (main stat 355, substat 346) and the `BaseParam` slot shares typed into the test, without calling the code under test. It checks that the page's caps equal them for Sage, Warrior (each armor slot, accessory and two-handed weapon) and Paladin (one-handed weapon and shield). Changing a slot share or the rounding in the code makes it fail.
- **External truth on both sides of 123.** In the same test, every real piece at item level 120 and 125 with a main stat and a substat, in all twelve slot codes, has the main stat $\operatorname{round}(\text{row} \times \text{share})$ for its own row, and the largest substat in each slot equals the same value (120: head 29, body 46, accessory 23, two-handed 47; 125: head 30, body 47, accessory 24, two-handed 49).
- **Shields** follow the off-hand rule: the two item level 120 shields carry Tenacity 13 (47 − 34; the 40 ‰ share would give 14) and the item level 125 shield 14 (49 − 35).
- **Half-up rounding** at an exact .5 (which Paladin's one-handed main-stat cap, 35.5 → 36, depends on) matches 125 of 126 real pieces whose main stat lands on an exact half.

So the caps at 123 are an **independent derivation** backed by real pieces at the neighbouring rows, not external truth. The formula unit test, the sync caps view test and the smoke test (eight jobs: Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon, Beastmaster, Blue Mage) assert the same numbers.

The sync unit test also derives the head caps at 123 and 129 itself, from the `ItemLevel` rows and the 85 ‰ head share, and clamps a real item level 130 head piece against them ([testing.md, section 2](../engineering/testing.md#2-what-each-file-covers)). That checks the code against the rule; it is still not evidence that the game applies the rule at 123 (only the Wiki rows at 475 are).

## 4. The worked piece: an item level 130 healer head piece

Does one concrete piece come out right on every line, raw and synced? A real item level 130 healer head piece has, in the game data, Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6. The formula reproduces all five: Mind, Vitality, Spell Speed and Piety from a head piece at 130 with Spell Speed and Piety in that order, and Direct Hit from the fixed 20% line ([math.md, worked example](math.md#worked-example-a-healer-head-piece-at-item-level-130), which shows each step). **Verified** (game data; external truth).

Three tests use the piece:

- The formula unit test builds the piece with Spell Speed and Piety and expects Mind 33, Vitality 32, Spell Speed 31 and Piety 22, with no Direct Hit: the fixed line is a real-item line, not a rank.
- The views unit test finds every real item level 130 Sage head piece with three substats in the database (two in the current data, chosen by properties, not by name). It checks that each carries 33 / 32 / 31 / 22 / 6, and that Piece stats, given each piece's two ranked substats, shows their real values raw and the head caps at 123 synced.
- The smoke test enters the same piece in the page's Piece stats and checks the four raw values and the synced Mind 30 and Spell Speed 29. The synced values are model output (section 3).

## 5. Speed and GCD

Does the code compute the same GCD tiers as the published reference? The GCD (global cooldown) is the recast time of most actions, 2.50 s with no gear speed. Speed shortens it, but the result is rounded down to hundredths of a second, so it moves in steps: a **tier** is the range of speed values that give the same GCD ([glossary.md](../glossary.md)).

The GCD and DoT/HoT formulas are AkhMorning's community formulas, not game files ([math.md, section 6](math.md#6-speed-and-substat-tiers)). Their inputs, $\text{sub}$ and $\text{div}$ per level, come from the game's `ParamGrow` sheet.

**The reference.** AkhMorning's [Skill and Spell Speed page](https://www.akhmorning.com/allagan-studies/stats/speed/) publishes tier tables: pick a level under "Show data for level" and the view "2.5s Tiers". Each row is the first speed of a new GCD tier, with its delta from the level's base (that delta is gear speed here) and the DoT scalar. The values below were read from that page on 2026-10-11 at levels 50, 90 and 100. The page text adds that at level 100 "2.49 happens at the 1st [tier], then 2.48s at the 5th, 2.47s at the 9th", one tier every 2780 / 130 = 21.38 points.

**What a match shows.** The tables are generated by AkhMorning's own implementation of the formula with their level modifiers (level 50: SUB 341, DIV 341; level 100: 420, 2780, the same as `ParamGrow`). So a match shows the code and its inputs agree with the published reference. It is not an in-game measurement.

| Check | Values (gear speed → GCD) | Kind | Test |
| --- | --- | --- | --- |
| Level 100 tiers | 22 → 2.49 s, 107 → 2.48 s, 193 → 2.47 s, 1,219 → 2.35 s, 1,818 → 2.28 s, 1,904 → 2.27 s, 2,845 → 2.16 s | External truth | Speed |
| Level 90 tiers | 15 → 2.49 s, 74 → 2.48 s, 834 → 2.35 s, 1,594 → 2.22 s | External truth | Speed |
| Level 50 tiers | 3 → 2.49 s, 14 → 2.48 s, 150 → 2.35 s, 202 → 2.30 s, 286 → 2.22 s, 297 → 2.21 s, 307 → 2.20 s, 349 → 2.16 s | External truth | Speed |
| No gear speed | 0 → 2.50 s at levels 50, 90, 100 | External truth | Speed |
| Tier around 1,839 (level 100) | starts at 1,818, next at 1,904 (gear); 2,238 and 2,324 on the panel scale, as the page shows them | External truth | Views |
| Level table (MAIN, SUB, DIV) | all 100 levels equal AkhMorning's [Level Modifiers](https://www.akhmorning.com/allagan-studies/modifiers/levelmods/) table, read from the page's script 2026-10-16 (nine levels pinned in the test) | External truth | Views |
| GCD, level 100 | equals AkhMorning's speed table code at every speed 420 to 3,785 and seven recasts (1.5 to 4.0 s) | External truth | Speed |
| Effects on panel numbers | Critical Hit, Direct Hit, Determination, Tenacity, Piety and GCD by AkhMorning's formulas on base + gear equal the tool's: two jobs, nine levels, seven gear values | External truth | Tiers |
| Panel totals, Sage level 50 | Total = gear + 341 (Critical Hit, Direct Hit, Spell Speed), + 202 (Determination, Piety), + 0 (Mind, Vitality); With food adds the Food row | External truth (bases) | Views, smoke |
| Tiers sub-tab, level 100 | speed tiers on the panel 442, 527, 613 (2.49, 2.48, 2.47 s); tier sizes Critical Hit 13 or 14 (2780/200 = 13.9, as AkhMorning states), speed 85 or 86, level 50 speed 10 or 11 | External truth | Tiers |
| Tenacity tiers, level 100 | 1,617: 1,616 to 1,629, +4.8% and −8.6% (both effects worked by hand) | Derivation | Tiers |
| Tier lookup, every level | equals a scan of the formula | Independent reference | Speed |
| Generic maximum at cap 123 | 296 → 2.22 s at level 50 | Derivation; AkhMorning | Caps, optimizer, views |

Notes:

- All tier values come from AkhMorning's tier tables. The speed unit test asserts each tier start, one point below it still on the previous tier, and the DoT scalar; at level 50 it also checks that the tool's tier scan lists them. The level 50 thresholds match AkhMorning's level 50 table row for row.
- The tier lookup check compares the fast lookup with a step-by-step scan of the GCD formula, at 5 seeded speeds per level from 1 to 100. It confirms the lookup agrees with the formula; it says nothing about whether the formula matches the game.
- The generic maximum 296 is an independent derivation: the sum of the ten armor and accessory substat caps at 123 ([math.md, section 6](math.md#6-speed-and-substat-tiers)), from `ItemLevel` row 123 and the `BaseParam` shares; no real gear exists at 123. Its 2.22 s is external truth from AkhMorning's level 50 table (tiers at 286 and 297). The caps unit test derives the sum without calling the code, checks its GCD, and checks that the generic-piece optimizer for Sage and Warrior reaches it.

## 6. The optimizer against the true best

Does the optimizer return the best loadout (one piece per slot), and does that depend on the stat model? The optimizer works on real item stats, so it does not depend on the substat shares.

Its checks compare it with a brute force that tries every legal loadout (seven real-gear pools, Unique rings, speed constraints, 600 random pools, the page views) and with a 9,800-run probe on real gear; it equals the brute force in every case. The brute force shares the optimizer's rule for a piece's synced stats, so these checks test the search, not the clamp (the clamp is section 3). Details and numbers: [optimizer.md, section 8](../engineering/optimizer.md#8-correctness-and-performance).

None of these totals has been checked in game. They show the search returns the best loadout for the model's synced stats; whether the game syncs those pieces to the same values is the open question in section 8.

## 7. Which tests assert what

Which test holds each check, and how strong is its expected value? What each test file covers in full is in [testing.md, section 2](../engineering/testing.md#2-what-each-file-covers). This table gives the kind of each expected value (section 1).

| Test | Checks | Kind of expected value |
| --- | --- | --- |
| Validation | Band accuracy; Wiki 475; named pieces | External truth (1) |
| Formulas | The 130 head piece; level caps | External truth (2) |
| Caps (real items) | Pieces at 120 and 125; caps at 123; 296 | Truth; derivation (3) |
| Level sync | Level item levels; triggers and order; T13; optimizer | Game file; second-hand; reference (4) |
| Sync | Clamp edge cases; Paladin Wiki 475 caps | Truth; derivation (5) |
| Sync cap order | Cap order on in-game values; equal orders at factor 100 | Second-hand truth (6) |
| Speed | GCD tiers and DoT scalars at 50, 90, 100; haste | External truth (AkhMorning, job guides) |
| Optimizer | Seven real-gear pools; ring-pair bound | Brute-force reference |
| Optimizer, exhaustive | Random pools; regressions; engine policies | Brute-force reference |
| Optimizer, constraints | Speed limits on real Warrior gear | Brute-force reference |
| Views | Optimizer view; excluded groups; Piece stats; caps; tiers | Mixed (7) |
| Items | Browser filters, pool mapping, Unique copies | Real rows, picked by properties |
| Piece substats | Ranks never repeat | Rules of the page |
| Stat factor | Job factor vs item factor; named pieces | Game data; derivation (8) |
| Data format, provenance | Shape of the generated data; data source | Format definition |
| State | Saved state repaired field by field | Rules of the page |
| Food | Real meals; xivgear's food values; best meal and gear | Game data; second-hand; brute-force reference |
| Generator tests (Python) | Tests on small CSV fixtures | Hand-built fixtures (9) |
| Smoke test (browser) | The built page, eight jobs | Mixed (10) |

Notes:

1. Band accuracy thresholds and the pieces listed in section 2, Wiki 475 caps, and the highest real item level inside the budget table.
2. The item level 130 healer head piece is external truth (game data); the level caps are from the Lodestone patch notes.
3. No gear exists at item level 123; real pieces at 120 and 125 in every slot carry round(row × share) as main stat and largest substat (external truth). The page's caps at 123 equal caps derived from `ItemLevel` row 123 and the `BaseParam` shares (Sage, Warrior, Paladin); the ten armor and accessory caps sum to 296, 2.22 s at level 50, and the generic-piece optimizer reaches that sum (independent derivation; 2.22 s is AkhMorning).
4. `ParamGrow.ItemLevelSync` at each level cap and 1 to 49 (game file); the two triggers, the order when both apply (second-hand: xivgear issue #317), no equip level; no real piece level-synced at level 100; at T13 (level 50, cap 123) exactly 71 pieces newly synced, to 130, none loses a stat; level 90 roulette: level 100 head pieces capped at the item level 660 head values (derived from `ItemLevel` row 660 and the 85 ‰ share); optimizer equals the brute force under level sync (Sage, Warrior, Paladin). The views under level sync are in `ui-views.level-sync.test.js`.
5. A real item level 130 head piece at, below and one above the cap; unknown item level; no special substat; missing stats. Wiki rows are external truth; head caps at 123 and 129 are derived from `ItemLevel` and the 85 ‰ share; the edge cases are rules of the model.
6. The in-game values of section 8 (xivgear's test notes), on the real items where named; with a factor of 100 the cap order equals the item order at every item level 1 to 795 and every slot share; an off-hand cap is the two-handed minus the one-handed cap. Budgets are game data; equal orders are an independent comparison.
7. Real gear: brute-force reference. Piece stats raw values: external truth (game data). Caps, 296: independent derivation (caps unit test). Tier at 1,839 and the level table: external truth (AkhMorning).
8. The job's factor equals the item factor on every single-main-stat piece of all 23 jobs; the only pieces that differ are of kind 0 (the 13 four-main-stat pieces and the six all-jobs earrings and rings). Those 13, the Occult "of Magic" and "of Blood" accessories (Vitality 307 / 341) and Alexandrian Earrings of Casting are reproduced; a synced Field Commander's Coat is capped at main stat 43 and Vitality 45 at 123 in the optimizer and the gear browser (rules of the model).
9. Slots, exclusions including multi-slot gear, stat placement, HQ rule, job mask, Unique flag, sort order, budget columns, level data, stat factor kind and table, schema errors.
10. Caps at 123 for eight jobs and the Wiki 475 table (as in the unit tests); Piece stats head piece values (external truth); real-gear optimizer totals for Sage and Warrior synced and unsynced (computed by the core and the brute force in Node at test time); Paladin off-hand; no "undefined" / "NaN" / "null" text, no JavaScript errors, no horizontal scroll at 960 px.

## 8. Open question: in-game captures

Which parts of the sync model rest on no capture of the game by this project, and what evidence exists instead? The Wiki check (section 3) covers substat caps only. Three parts of the sync model have no capture of this project's own ([math.md, section 5](math.md#what-is-assumed)); the second and third are now verified from published values:

1. the main stat and Vitality are clamped like substats (with the piece's own stat factor, so a Field Commander's piece is capped at 90% of the main-stat cap for every job), with the factor-first cap order below; supported by second-hand in-game values;
2. lower-ranked substats clamp against the full-share cap, not against their own share (for a 70% Piety on a head piece at cap 123: 29, not $\operatorname{round}(29 \times 0.7) = 20$); **verified** (published) by the Wiki's Item Level page (accessories synced to 475: 127 / 89 becomes 88 / 88), and supported by a player's in-game report and The Balance's thresholds (below);
3. sync never raises a stat: **verified** for substats (published): the Wiki's 93 / 65 becomes 88 / 65, and its page says "Substats will not be scaled up".

**Level sync.** Melds on synced gear and the level sync trigger are settled (verified by the owner in game). What each part of level sync rests on is in [math.md, section 5](math.md#which-pieces-are-synced); the order when both triggers apply is second-hand, and weapons using the same level item level is second-hand at level 90 (xivgear issue #317) and inferred elsewhere. Two captures would check them:

- one in a level-synced duty with item level sync off (a roulette), with one piece above the level's item level, would check the level item level directly;
- one in a duty whose item level cap is above that level's item level, with a piece above both, would check the order.

### Optional in-game checks

Checks that could move a stat by more than 1, if the owner wants more captures. The values are for Sage, from the model. Read a value in the synced duty or FATE by swapping the one piece out of combat and noting the change on the character sheet.

| # | Check | Where | Model says | If wrong |
| --- | --- | --- | --- | --- |
| 1 | Main stat and Vitality clamp | Cap 123, item level 130 head | Mind 30, Vit 29 | Mind 33, Vit 32 |
| 2 | Cap uses the piece's own factor | Cap 123, Field Commander's Coat | Mind 43, Vit 45 | Mind 48, Vit 51 |
| 3 | Lower substat clamps to the full cap | Cap 123, item level 130 head | Piety 22 | Piety 20 |
| 4 | Item level cap beats the level's | Level 90, cap 665, gear above both | Head substat 186 | 184 |
| 5 | Weapon uses the level's item level | Level 50 FATE, no item level sync | Weapon Mind 54 | Another value |
| 6 | No scaling up | Cap 123, a piece below 123 | Stats unchanged | Stats raised |

- **1 and 3** use one real item level 130 healer head: Mind 33, Vitality 32, Spell Speed 31, Piety 22, Direct Hit 6.
- **2:** Field Commander's Coat is item level 160 with all four main stats, for every job.
- **4:** the player report behind the current rule was Aloalo Island (level 90, item level 665).
- **5:** FATEs sync level only, so a weapon above level 50 syncs to item level 130 by level alone.

### Second-hand in-game values (xivgear's test notes)

Not captured by this project; quoted from code comments in xivgear's tests (commit `6c3c878`, [`sync_stats_tests.ts`](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/test/stats/sync_stats_tests.ts), [`item_stats_tests.ts`](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/test/item_stats_tests.ts)). The budgets are this project's `ItemLevel` rows.

The two candidate cap orders differ only in when the stat factor $F$ applies. **Factor first** (the model) is $\operatorname{round}(\lfloor \lfloor B \times F/100 \rfloor \times p/100 \rfloor / 10)$; **item order** rounds the slot share first, then applies the factor, as an item's own stats do (section 2). With $F = 100$ they agree; with $F = 90$ they can differ by 1, and the in-game values decide:

![Two step-by-step pipelines for the Blue Mage head synced to item level 270, Vitality budget 736, factor 90%, head share 85 per mille. Factor first: 736 times 0.9 floored is 662, times 0.85 floored is 562 tenths, rounded 56. Item order: 736 times 85/1000 is 62.56, rounded 63, times 0.9 is 56.7, rounded 57. In game: 56, second-hand from xivgear's tests.](../diagrams/validation-cap-order.svg)

| In game | Budget | Cap, factor first | Cap, item order |
| --- | --- | --- | --- |
| Blue Mage head at 270: Vitality 56 | 736 | 56 | 57 |
| Red Mage head at 530: Vitality 123 | 1,603 | 123 | 122 |
| Azeyma's Earrings at 430: main stat 71 | 1,170 | 71 | 70 |
| The same: Vitality, Determination, Direct Hit, Piety | 1,197 / 1,175 | 72 / 79 / 79 / 71 | same |
| Menphina's Earring at 425: Vitality, Mind, Determination, Piety | 1,193 / 1,150 / 1,160 | 72 / 69 / 78 / 70 | same |

Notes on the rows:

- Blue Mage: the Edenmorn Hat of Casting (item level 530) synced to 270, "Verified in-game by Xi"; the steps are in the diagram above.
- Red Mage: "600 item synced down gives us 123? tested in game". Factor first $\lfloor 1603 \times 0.9 \rfloor = 1442$, $\lfloor 1442 \times 0.85 \rfloor = 1225 \to 123$; item order $\operatorname{round}(136.26) = 136$, $\times 0.9 \to 122$.
- Azeyma's Earrings: item level 560, kind 0, for Ninja and Sage. Factor first $\lfloor 1170 \times 0.9 \rfloor = 1053$, $\lfloor 1053 \times 0.67 \rfloor = 705 \to 71$; item order $\operatorname{round}(78.39) = 78$, $\times 0.9 \to 70$. The other values: Vitality 72, Determination 79, Direct Hit 79 (Ninja), Piety 71 (Sage).
- Menphina's Earring: item level 430, kind 0, for Sage.

What the table shows:

- **Supports question 1.** The main stat and Vitality are clamped, at the cap of the item's kind: 90% of the full accessory value on the kind 0 earrings (78 and 80 at 430), not the full value. A Secondary Attribute counted as Piety is capped at the 90% Piety cap (71), not the substat cap (79).
- **Settles the cap order.** Every value fits the factor-first cap, $\operatorname{round}(\lfloor \lfloor B \times F/100 \rfloor \times p/100 \rfloor / 10)$; the item order misses three of them by 1 (in game Blue Mage is 1 lower, Red Mage and Azeyma's 1 higher). The model computes caps factor first ([math.md, section 5](math.md#the-clamp-rule)). The Red Mage value also shows that a cap is not always what a same-slot piece at the cap carries: the native item level 530 head has Vitality 122.
- **Item stats keep the item order.** For an item's own stats the item order is far better: it matches 6,492 of 6,515 Intelligence and Mind pieces on Vitality, against 5,161 for factor first (data `d9582a6`, 2026-10-16). For a factor of 100 the two orders give the same number at every item level and slot share, so substat caps (and the Wiki check in section 3) are unaffected.
- The sync cap order unit test turns every row of the table into a test case, on the real items where the note names one.

### Conflicting report: the all-jobs earrings under level sync

A player wrote in an issue on another tool ([ffxiv-characterstatus-refined #32](https://github.com/Kouzukii/ffxiv-characterstatus-refined/issues/32), 2026-04-20, with a screenshot): "the Azeyma's Earring in Final Coils (i130) should be capping Str at 26, Vit at 28, and substats at 24", and that the Aetheryte Earring, Menphina's Earring and Neophyte's Ring behave the same. Final Coil is level 50, and the earring scales with level ([math.md, section 5](math.md#which-pieces-are-synced)), so it is synced to 130.

| Azeyma's Earrings at 130 | Main stat | Vitality | Substat |
| --- | --- | --- | --- |
| The report | 26 | 28 | 24 |
| Cap with the file's 90% (the model, xivgear, ffxiv-gearing) | 23 | 25 | 24 |
| Cap at 100% | 26 | 28 | 24 |

- The report fits the full factor on the main stat and Vitality; the Azeyma's row above (item level sync to 430, main stat 71) fits the 90%. Both are second-hand. The two differ in how the piece is synced (level sync on scaling gear against an item level cap), which might explain it (**inferred**, a guess).
- Not acted on (owner's decision, 2026-10-15): the model keeps the 90% on these six pieces. If the report is right, their main stat and Vitality are too low under level sync (by 3 at 130), in all three tools, so neither the ffxiv-gearing check (section 9) nor the xivgear check can show it. A capture in a level-synced duty wearing one of them would settle it.

### Evidence for question 2 (lower-ranked substats)

None of these are captures by this project. The numbers were checked against this project's data. The two rules differ only for a lower-ranked substat on a piece above the cap: the full-share rule caps it at the slot's cap, the own-share rule at 70% of it.

| Source | What it shows | Full-share cap | Own-share alternative | Kind |
| --- | --- | --- | --- | --- |
| [Square Enix forum, thread 468769](https://forum.square-enix.com/ffxiv/threads/468769) (2022) | Both substats of a chest at 123 | 123 | 86 | Player report |
| The Balance, [Dragonsong's Reprise guide](https://www.thebalanceffxiv.com/jobs/melee/reaper/fight-tips/dragonsong-war/) (sync 605) | Both substats cap from 725 | threshold 725 | no threshold | Gearing practice |
| Console Games Wiki, [Level Sync](https://ffxiv.consolegameswiki.com/wiki/Level_Sync) | Both accessory substats at 88 (475) | 88 / 88 | 88 / 62 | Wiki claim, no source |

Notes on the rows:

- Forum: in Sigmascape V2.0 Savage (a raid) at sync 345, a 495 healing chest (Critical Hit 184, Determination 129) showed both synced to 123. The post doesn't name the chest, but it matches the Bozjan Coat of Healing in the data. A player's in-game report, no screenshot.
- The Balance: Underkeep Earrings (725) have a lower substat of 129, the accessory cap at 605. Under the own-share rule every piece above 605 would be the same, so there would be no threshold.
- Console Games Wiki: "any accessories with a higher item level will have both substats capped at 88".

What it shows:

- **Strongly supports question 2.** The forum report is the only value where the two rules differ. Its poster asked Square Enix to switch to the own-share rule, which implies the game uses the full-share one. Nothing found contradicts it. Square Enix has not published how sync reduces individual stats.
- Found by research on 2026-10-12.

### Food and what a capture should contain

**Food.** The food formula (a percentage of base plus gear, floored, then capped) and food being applied unchanged under sync are **verified** by the owner in a synced duty (2026-10-18): the character sheet's stat after eating a known HQ meal equalled $\min(M, \lfloor 0.1 \times \text{before} \rfloor)$ added to the stat before ([math.md, section 6](math.md#food)).

Captures from the game are **the single most valuable evidence the project does not have**. A useful capture:

- is a character sheet screenshot taken under a known sync cap (the duty name, or the cap item level);
- lists the equipped gear by name;
- ideally has the same character unsynced for comparison.

One capture with a piece whose second substat is above the cap (for example a 70% substat of 30 or more on a head piece at cap 123) would settle point 2 directly; the main stat and Vitality on the same sheet would settle point 1. Each capture should become a test case with the screenshot's numbers as the expected values.

## 9. Against another tool: ffxiv-gearing

Does an independent implementation of sync, run on every piece and every sync setting, agree with this project? ffxiv-gearing (Asvel's planner, [asvel.github.io/ffxiv-gearing](https://asvel.github.io/ffxiv-gearing/), Chinese only) syncs stats with its own code. Like xivgear, it is a community reference, not external truth: agreeing with it shows the two models match, not that either matches the game. Its item data comes from the Chinese client, yet all 26,044 of its gear items have the same stats, item level, equip level and stat factor kind as this project's `Item` sheet (checked by game id), so every difference below comes from the math.

**What was compared.** Its own code, run in its own page (built from the pinned commit, and the live site), against this project's synced stats, side by side in that page:

- every database piece each of the 23 jobs can wear;
- at every sync it offers (each job level 50 to 100 up to the job's cap, level sync only and each duty item level it lists: 139 settings);
- every stat of the job.

**Result, 2026-10-16**, on the database from item level 15, with its tank Main Attribute rule corrected (D4) and its bonus stats taken off (D6): 11,480,969 piece checks, 73,252,638 stats, 99.90% equal (73,182,000), and every remaining difference is exactly 1. Every database piece is in its data. The live site gave exactly the same results as the local build (2026-10-16).

**Previous run.** At the previous run (2026-10-15, item level 100 and up: 55,426,805 stats, 99.87% equal, D1 64,080, D2 5,679) it did too; the 2,715 pieces below item level 100 added 17.8 million stats and 879 differences, all D1 or D2.

| Tag | Difference | Stats | Off by |
| --- | --- | --- | --- |
| D1 | Cap rounding order | 64,724 | 1 |
| D2 | Off-hand (shield) caps | 5,914 | 1 |
| D3 | Gear that scales with level (fixed here) | 0 | – |
| D4 | Main Attribute on tanks (corrected there) | 0 | – |
| D6 | Bonus stats in Crucible, Occult Crescent (taken off there) | 0 | – |
| – | Anything else | 0 | – |

Notes:

- **D1.** It rounds a cap once, $\operatorname{round}(B \cdot s \cdot f / 10^5)$; this project floors twice first ([math.md, section 5](math.md#the-clamp-rule)). With a factor of 100 the two agree everywhere: its caps alone, at the 230 item levels its data defines, every slot code and stat factor kind, equal this project's in all 292,560 cases; with a factor below 100 they differ by 1 in 6,068 of 138,000. This project's order rests on three second-hand in-game values (section 8); its order on none found. Accepted either way (off by 1).
- **D2.** It caps a shield at the 40% share; this project uses two-handed minus one-handed (**inferred**, fits 224 of 226 real off-hands). Never more than 1 apart.
- **D3.** 260 pieces (`Item.SubStatCategory` 2) scale with the character: the game's own text says "IL and attributes synced to current job level" (242 pieces) or that attributes and item level vary with the current level (the six experience-bonus accessories); the other 12, the Pictomancer and Viper starting sets (equip level 89, item level 560), have no item text (**verified**, game data `d9582a6`, recounted 2026-10-16).
  - ffxiv-gearing syncs them to the level's item level at every level it offers; this project synced them only like other gear, by equip level, so at level 50 with no item level cap Menphina's Earring (item level 430, equip level 1) kept its 430 stats here. **It was a gap in this project's model, fixed 2026-10-15** ([math.md, section 5](math.md#which-pieces-are-synced); [history.md](../history.md)): before the fix 4,023 stats differed for this reason, now 0.
  - The wiki's figures for the artifact armor among them (548 at level 89, 678 at level 99) equal `ParamGrow.ItemLevelSync` for those levels (**second-hand**), so this project uses that column at every level; ffxiv-gearing uses its own table at levels 50 to 100, the same values except 790 at 100, which no scaling piece reaches.
  - Now that both tools sync these pieces to the same item level, the cap rules apply to them too: 1,166 of the D1 and 50 of the D2 differences are on scaling pieces (tagged D3 before), and 60 D4 differences went away.
- **D4.** It gives a tank's Main Attribute to Vitality; this project gives it to Strength (**verified**).
  - The patch 5.0 notes say "The main attribute of the Aetheryte Earring when equipped by a tank has been changed from vitality to strength." ([Lodestone](https://na.finalfantasyxiv.com/lodestone/topics/detail/330f2b280067d69d85b17831c66712a499e97484)). The game data agrees: `ClassJob.PrimaryStat` for every tank is 3 (Vitality) in the 4.55–4.58 data and 1 (Strength) from 5.0 to today (xivapi/ffxiv-datamining commits f10581e and 2c4f0a2). ffxiv-gearing's Vitality therefore matches the game only as it was from 4.5 to 4.58, when the Aetheryte Earring was the only item with Main Attribute.
  - In its code the value comes from a 2020 tank switch for its damage math (commit dc4935a), which its 2026 Main Attribute support reused (9bd08ba) (**inferred** as the cause). xivgear also gives tanks Strength and Tenacity (PR #884, 2026). No in-game character sheet of a tank wearing such a piece has been found.
  - **Corrected in the check, not tagged:** before comparing, the harness sets ffxiv-gearing's tank `mainStat` to Strength in its own page, so its code runs with the rule the game has had since 5.0. Tagging every tank Strength and Vitality difference on these pieces would have hidden any other difference there. With the correction, each tank differs from it exactly as Monk does (65 D1, 40 D6), plus Paladin's shields; before, 4,752 stats were tagged D4, and the misrouted Main Attribute also made 3,000 of the D6 differences, on Occult Crescent pieces.
- **D6.** It adds the Crucible bonus (Beastmaster gear, +5 to +10 Strength and Vitality) always and the Occult Crescent bonus (+40 to +160 main stat) at item level sync 700, uncapped; this project leaves both out on purpose ([data-pipeline.md, section 4](../engineering/data-pipeline.md#4-item-database-generation)).
  - Each bonus is a fixed value on the item's own row (`BaseParamSpecial` with `ItemSpecialBonus` 11 or 9; each Occult upgrade is its own row with a larger value) (**verified**, game data), so the check takes exactly that value off its stat before comparing: 3,276 stats (2,870 before the item level 15 floor), none left off by more than 1 afterwards.
  - Tagging every difference on a bonus piece instead had hidden 1,705 ordinary ±1 differences there (Vitality on Occult healer and caster gear, D1; Beastmaster's shields, D2); they are now counted under D1 and D2.
- **Which pieces a job can wear** differs, not compared: it reassigns some all-classes pieces by their main stat (573 to 764 pieces a job, mostly old accessories such as Earrings of Casting); this project follows `ClassJobCategory`, so a Sage may wear them, as in game.

Re-run after a patch or a new ffxiv-gearing version: see the scripts in the table below (not part of `npm run check`; they need the clone and a browser).

**How the check runs.** It runs ffxiv-gearing's real code, not a port: its page exposes its store and game constants (`window.store`, `window.game`), so the harness bundles this project's core into that page and both tools compute every stat there.

- **Sync it models.** Which item level a piece syncs to: the duty's item level if below the piece's own; otherwise, if the job level is below the equip level, the lower of the piece's item level and the level's item level; pieces that scale with the character always to the level's. The cap is one rounded product of budget, slot share and stat factor, from the same `ItemLevel`, `BaseParam` and `MeldParam` columns as this project's.
- **Tags.** Each difference is tagged with the known cause it matches (D1 to D6 above; D5 is its hand-written item level 790 for level 100 against `ParamGrow.ItemLevelSync`'s 690, unused today because no gear needs level 100 sync). A difference matching none is `unexplained`, and one where the tools sync a piece to different item levels is `target`. The check passes with no `unexplained` and no `target`.
- **Caps alone.** A second sweep compares its caps with this project's at every item level its data defines, every slot code and stat factor kind (466,440 compared on 2026-10-15, none off by more than 1).
- **Pinned version.** `fetch.py` clones commit `8d75ef8` (2026-10-13, data 7.57) into `data/ffxiv-gearing`, which is gitignored. Output goes to `scripts/validate/out/gearing-<site>.json`, also gitignored.

## 10. Against another tool: xivgear

Does the most used planner, with its own code and its own item data, agree too? xivgear ([xivgear.app](https://xivgear.app), [github.com/xiv-gear-planner/gear-planner](https://github.com/xiv-gear-planner/gear-planner)) is the most used gear planner; it computes synced stats with its own TypeScript core and reads its item data from its own data service. Like ffxiv-gearing it is a community reference, not external truth: agreeing with it shows the two models match, not that either matches the game.

**What was compared.** Its own core, at commit `6c3c878e`, run under its own test runner, with this project's core bundled into the same process. For each of the 23 jobs and the same 139 sync settings as section 9:

- its data manager loads the job's gear for the setting;
- each piece is equipped alone in a gear set, and every stat of the job is read from it (`getStatDetail`);
- those stats are compared with this project's synced stats, piece by piece (matched by game id).

**Result, 2026-10-16**, on the database from item level 15: 9,920,950 piece checks, 63,074,926 stats, **40 differ** (99.99994% equal), every one off by exactly 1 and with a known cause.

| Tag | Difference | Stats | Off by |
| --- | --- | --- | --- |
| X3 | A piece synced to exactly its own item level | 40 | 1 |
| D1 | Cap rounding order | 0 | – |
| D2 | Off-hand (shield) caps | 0 | – |
| X1 | Level sync item level (corrected there) | 0 (8,766 before) | up to 7 |
| X2 | Gear that scales with level (corrected there) | 0 (3,085 before) | up to 189 |
| – | Anything else | 0 | – |

Notes:

- **D1, D2.** None: xivgear rounds caps factor first (this project's order came from its tests, section 8) and computes shield caps as two-handed minus one-handed, as this project does.
- **X3.** 15 crafted Intelligence and Mind pieces whose equip level is above the synced level and whose item level equals that level's (Voeburtite and Fae gear at 400, equip level 73, under level 70 sync; Shisui of Casting at 270, equip level 63, under level 60), so the target is the piece's own item level. xivgear applies the caps, which with the 90% Vitality factor gives 1 less (Vitality 140 becomes 139); this project leaves a piece at or below its target untouched. Which the game does is not known (**not verified**: the Blue Mage capture in section 8 is a different piece). Accepted (off by 1).
- **X1.** xivgear takes the item level of level sync from the highest item level of the job's gear at that equip level (its data service's `maxIlvlPerLvl`), which counts shields: a few Paladin shields sit 5 above the other gear, so Paladin alone is synced to 405 / 535 / 665 at levels 70 / 80 / 90 where `ParamGrow.ItemLevelSync` gives 400 / 530 / 660 (**verified**: its client `datamanager_new.ts` and its data service's `ItemsEndpoint.groovy`; the game file). A player's test in xivgear issue #317 saw level 100 gear and weapons synced to 660 at level 90 (**second-hand**). **Corrected in the check:** after its data loads, every compared piece it synced by equip level is synced again by its own code at the game file's item level (2,753 piece checks, all Paladin).
- **X2.** xivgear has no rule for gear whose item level follows the wearer's level (`Item.SubStatCategory` 2, not in its data): such a piece keeps its full stats under level sync (Halone's Earring at level 50: main stat 212 there, 23 here) and takes the cap alone under a cap above the level's item level. **Corrected in the check** with this project's rule, the same as ffxiv-gearing's (section 9, D3): 909 piece checks.
- **Pieces.** At each job's first setting 1,237 to 3,719 pieces are in both. xivgear has 1,028 to 3,399 a job that this project does not (below the item level 15 floor, crafter and gatherer gear, Aetherial and 1.0 gear, and for Beastmaster gear above its level cap); this project has up to 966 a job that its data service does not return (some item levels below 300). Not compared.

Re-run after a patch or a new xivgear version with the scripts in the table below; they write `scripts/validate/out/xivgear.json` (not part of `npm run check`; they need the clone, and the first run fetches its data service).

**Why xivgear is a check, not an import target.** It loads only items of item level 290 or higher (the floor for the job's minimum level 70; Blue Mage's is 50), so it dropped item level 130 pieces from a level 50, item level 123 set in a live test (2026-10-14) (**verified** in its source, `LEVEL_ITEMS[job.minLevel].minILvl`, and by that test). See [roadmap.md](../roadmap.md), out of scope.

## 11. Verified and assumed

The status of each claim this page checks, in one place. Details are in the section named.

| Claim | Status | Evidence |
| --- | --- | --- |
| Budget table, slot shares, double rounding, stat factor | **Verified** | 16,605 of 16,629 exact (section 2) |
| 100 / 70 substat shares, fixed 20% Direct Hit line | **Inferred** | Fit almost every piece; not in the files (section 2) |
| 25% Direct Hit on the eight green HQ healer pieces | **Inferred** | Fitted to the eight; patch 4.0 notes (section 2) |
| Reduced stats on 18 item level 46 pieces | **Inferred**; listed by name (owner's decision) | Fitted to the 18 (section 2) |
| Hand-edited stats of the six all-jobs pieces | **Verified**; factors by name (owner's decision) | Datamining history (section 2) |
| Sync clamp for substats | **Verified** | Wiki, 6 of 6 at 475 (section 3) |
| Caps at item level 123 | **Inferred** (independent derivation) | No gear at 123; real pieces at 120 and 125 (section 3) |
| Factor-first cap order | **Verified** by three **second-hand** in-game values; **inferred** for other caps with a factor below 100 | xivgear's tests (section 8; [math.md, section 5](math.md#the-clamp-rule)) |
| Main stat and Vitality clamped like substats | **Inferred**, supported second-hand | xivgear's in-game values (section 8) |
| Lower substats clamp at the full-share cap | **Verified** (published) | Wiki Item Level page; forum report, The Balance (section 8) |
| Sync never raises a stat | **Verified** for substats (published) | Wiki Item Level page ([math.md, section 5](math.md#what-is-assumed)) |
| All-jobs pieces at 90% under level sync | **Second-hand**, conflicting; kept (owner's decision) | Report of full factor (section 8) |
| Off-hand = two-handed − one-handed | **Inferred** | 224 of 226 real off-hands (section 9) |
| Melds on synced gear, level sync trigger | **Verified** by the owner in game | Section 8 |
| Order when both sync triggers apply | **Second-hand** | xivgear issue #317 (section 8) |
| A piece synced to its own item level is untouched | **Not verified** | xivgear differs by 1 (section 10) |
| GCD, DoT and tier formulas | **Community reference** | Match AkhMorning's tables (section 5) |
| Food formula, food under sync | Verified (owner, in a synced duty, 2026-10-18) | Section 8 |
| Optimizer finds the best loadout for the model's stats | Brute-force reference | Equal in every case (section 6) |

## Where this lives

| Concept | File |
| --- | --- |
| Band accuracy, Wiki 475 table | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Prediction of a real piece's stats | `src/core/formulas.js` (`predictRaw`) |
| Caps used by the tests above | `src/core/formulas.js` (`capsFor`, `capValue`) |
| Which item level a piece is synced to (item level and level sync) | `src/core/sync-target.js` (`syncTarget`, `levelSyncIlvl`) |
| GCD, tier scan and tier lookup | `src/core/speed.js` (`gcdFor`, `gcdTiers`, `gcdTierAt`) |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`) |
| Unit tests named above | `tests/unit/core-validation.test.js`, `core-formulas.test.js`, `core-formulas.caps-at-123.test.js`, `core-formulas.sync-clamp.test.js`, `core-formulas.sync-cap-order.test.js`, `core-sync-target.test.js`, `core-speed.test.js`, `core-optimizer.test.js`, `core-optimizer.exhaustive.test.js`, `core-optimizer.speed-limits.test.js`, `core-formulas.stat-factor.test.js`, `ui-views-*.test.js`, `core-items.test.js`, `core-item-format.test.js`, `core-tables.provenance.test.js`, `ui-state.test.js` |
| Generator tests | `tests/data/test_generators.py` |
| Smoke test | `tests/e2e/smoke.mjs` |
| Check against ffxiv-gearing (section 9) | `scripts/validate/gearing/` (`fetch.py` clones and builds it, `run.mjs --site local\|live` compares, `ours.js` is this project's side) |
| Check against xivgear (section 10) | `scripts/validate/xivgear/` (`fetch.py` clones it and installs its dependencies, `run.py` compares, `xg_sync_test.ts` runs in its test runner, `ours.js` is this project's side and the corrections) |
