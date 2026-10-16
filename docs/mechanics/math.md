# The stat model: from item level to synced stats

This page explains how the stats on a piece of gear follow from its item level, and what item level sync does to them. It covers the formulas the tool uses, a worked example with real game data, and which parts are verified and which are inferred.

Related pages: [optimizer.md](../engineering/optimizer.md) (how the tool picks the best gear set), [data-pipeline.md](../engineering/data-pipeline.md) (where the game tables come from and how they are regenerated), [validation.md](validation.md) (how the model is checked against real items, the Wiki and AkhMorning) and [glossary.md](../glossary.md).

All numbers below come from the game tables in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30) or from running the tool's own code against them.

## 1. Terms

- **Item level**: a number on every piece of gear. It is not a strength rating by itself. It is a row number in a game table that holds a stat budget for each stat.
- **Slot**: where the piece is worn: weapon, off-hand (shield), head, body, hands, legs, feet, earring, necklace, bracelet, and two rings.
- **Item level sync**: some content lowers your gear to a cap. For example, a duty run with the Minimum Item Level option and no Echo uses a fixed cap ([glossary.md](../glossary.md)). Pieces above the cap lose stats; pieces at or below it are unchanged. The owner's main case is cap 123, but every formula here works for any cap.
- **Level sync**: content for a lower character level lowers your level to match. Gear whose equip level (the character level needed to wear it) is above that level is synced to an item level the game assigns to the level (section 5). A duty can do both at once: T13, a level 50 raid, run with Minimum Item Level is level 50 and item level 123.
- **Stats.** Each of the 23 combat jobs uses one of five role profiles. The tool uses role-neutral names:

| Neutral name | Meaning | Tank | Healer | Melee (Str) | Dexterity | Caster |
| --- | --- | --- | --- | --- | --- | --- |
| main stat | primary damage/healing stat | Strength | Mind | Strength | Dexterity | Intelligence |
| Vitality | hit points | Vitality | Vitality | Vitality | Vitality | Vitality |
| substats | Critical Hit, Determination, Direct Hit | same | same | same | same | same |
| speed | shortens the global cooldown (GCD) | Skill Speed | Spell Speed | Skill Speed | Skill Speed | Spell Speed |
| special substat | role-only substat | Tenacity | Piety | none | none | none |

The "Melee (Str)" column covers Monk, Dragoon, Samurai, Reaper and Beastmaster; the "Dexterity" column Ninja, Viper, Bard, Machinist and Dancer. Speed and the special substat also count as substats. Paladin and Beastmaster wear a one-handed weapon and a shield (section 3); every other job a two-handed weapon. Beastmaster's speed stat and missing special substat are *inferred* from its melee role (no game column names a job's substats; xivgear uses the same), and its own gear carries neither.

- **Level cap.** Two limited jobs stop below the game's level cap of 100: Blue Mage at 80 and Beastmaster at 50 (**verified**: the Lodestone's [Patch 6.45 Notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/2a6c65f39b5b16b58bd4f0d9b1edaa8c0b7ec4f3), "The level cap for blue mage has been increased to 80", and [Patch 7.56 Notes](https://na.finalfantasyxiv.com/lodestone/topics/detail/a8a526ad64db45c8ca8d1c7fdcce8a5eedaa18bc), "begins at level 1 with a maximum level of 50"). The game files hold no level cap; their `ClassJob` sheet flags exactly these two jobs as limited (`IsLimitedJob`). A job cannot wear gear whose equip level is above its cap, so the tool leaves such gear out of the gear list and the search, and the synced level goes no higher than the cap. At its cap a limited job is never level-synced (section 5).

## 2. The budget table

The game's `ItemLevel` sheet has one row per item level (rows 0 to 920). Each row holds a budget for each of the 12 stats. In this data:

- The four main-stat columns (Strength, Dexterity, Intelligence, Mind) are identical in every row.
- Determination, Direct Hit, Skill Speed and Spell Speed are identical to Critical Hit in every row.
- Piety and Tenacity match Critical Hit except in 6 rows (540, 565, 570, 590, 595, 596), where they are 1 to 8 higher. The Sync limits sub-tab's table adds a Piety or Tenacity cap column only when the cap item level is one of these rows and the cap differs in some slot.
- Vitality has its own column.

So in practice there are three curves: main stat, substat and Vitality. We write them as $\text{budget}_s(i)$ for stat $s$ at item level $i$.

![Two line charts of the main-stat and substat budgets by item level. The top chart covers rows 1 to 920 and shades rows 796 to 920 as having no gear. The bottom chart zooms on item levels 100 to 200, marks the cap 123 (main stat 355, substat 346), and shades 135 to 150, where the substat budget rises steeply.](../diagrams/math-budget.svg)

What the curve looks like (read from the table):

- **Up to 130**, both curves rise slowly, by 2 to 4 per item level (from 130 to 135 the substat gains 22). At 123 the main stat is 355 and the substat is 346.
- **From 135 to 150**, the substat budget jumps by about 10 per item level, from 385 to 528. The main stat keeps its slow pace (394 to 426). From 138 to 252 the substat budget is larger than the main-stat budget.
- **After 150**, substats grow by 0 to 2 per item level again.
- **From about 250 to 450**, the two curves stay within a few points of each other and cross several times.
- **From about 450 upward**, the main stat and Vitality pull far ahead. At 795 the main stat is 6,050, the substat 3,190 and Vitality 6,736.

The highest item level on any real piece is **795**. Rows 796 to 920 are in the sheet but no gear uses them, so the tool limits item level inputs to 795. The data does not say why those rows exist.

## 3. Slot shares

A slot does not get the whole budget. It gets a fraction of it, called its **slot share** and stored in per-mille (thousandths) in the game's `BaseParam` sheet:

| Slot | Share $p$ (‰) |
| --- | --- |
| Two-handed weapon | 140 |
| One-handed weapon | 100 |
| Off-hand (shield) | 40 |
| Head, hands, feet | 85 |
| Body, legs | 135 |
| Body that also covers the head (cloak) | 220 |
| Earring, necklace, bracelet, ring | 67 |

**Verified**: these are the values in `BaseParam.csv` for all 14 stats the database stores; the generator stops if one differs. The sheet's waist column is 0; the game no longer has a belt slot. The cloak share is the game's body-plus-head column. The two real cloaks (Vermilion Cloaks, item level 300) are reproduced exactly with it ([validation.md, section 2](validation.md#2-every-real-piece-by-item-level-band)).

Paladin and Beastmaster are the only combat jobs with a one-handed weapon plus a shield (100 + 40). Every other job uses a two-handed weapon (140).

**The off-hand is the two-handed value minus the one-handed value.** Real shields do not follow the 40 ‰ share directly. Each stat on an off-hand equals the two-handed weapon's value minus the one-handed weapon's value at the same item level and substat share, each computed with the formula below. That is 140 − 100 = 40, but rounded as two weapons rather than once at 40.

- It reproduces 224 of 226 real off-hands exactly, against 195 for the 40 ‰ share.
- Vanguard Shield, item level 672: Critical Hit 63 = 218 − 155, where 40 ‰ gives 62.
- The item level 120 shields: Tenacity 13 = 47 − 34, where 40 ‰ gives 14.

**Inferred**: it fits the data, but the game files do not say how shields are built. Sync uses it too, so a shield's caps are the two-handed cap minus the one-handed cap (section 5). xivgear, a community gear planner, computes shield caps the same way: its source says to ignore the off-hand percentage and take the two-handed cap minus the one-handed cap ([datamanager_new.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/datamanager_new.ts#L118-L240)). That is agreement, not confirmation in game.

## 4. The stats on a piece

![Flow diagram of the seven steps from item level to synced stat, with Spell Speed and Piety values from an item level 130 healer head piece. Spell Speed goes 363, 30.855, 31, then is clamped from 31 to 29 at cap 123. Piety goes 363, 30.855, 31, times 0.7 is 21.7, rounds to 22, and stays 22.](../diagrams/math-pipeline.svg)

### The formula

For a stat $s$ at item level $i$ in a slot with share $p$, the **slot budget** is

$$
B_s(i) = \operatorname{round}\!\left(\frac{\text{budget}_s(i) \times p}{1000}\right)
$$

and the stat on the piece is

$$
\text{stat}_s = \operatorname{round}\big(B_s(i) \times w\big)
$$

where $w$ is the stat's **substat share** (below). The main stat and Vitality always take $w = 1$.

**Rounding is half up**: $\operatorname{round}(x) = \lfloor x + 0.5 \rfloor$, so 31.5 becomes 32. The code adds a tiny epsilon so that floating-point noise such as 22.4999999 still rounds as 22.5 would.

**Rounding happens twice**: once for the slot budget, then again after the share. Rounding only once at the end reproduces 13,306 of the 16,629 checked pieces exactly (80.0%). Rounding twice reproduces 16,605 (99.9%). Both figures come from running the model over the item database.

Example where it matters: Antiquated Atlas, a level 60 healer two-handed weapon at item level 200, has Piety 57. The substat budget at 200 is 587:

$$
587 \times 140/1000 = 82.18 \to 82, \qquad 82 \times 0.7 = 57.4 \to 57
$$

Rounding once gives $587 \times 0.14 \times 0.7 = 57.526 \to 58$, which is wrong.

### The stat factor of an item

Some stats get one more factor $f_s$ between the slot budget and the substat share:

$$
\text{stat}_s = \operatorname{round}\Big(\operatorname{round}\big(B_s(i) \times f_s\big) \times w\Big) \qquad (\text{the inner rounding only when } f_s \ne 1)
$$

The factor belongs to the **item**, not to the job. The game files hold it: `BaseParam` has a table of percentages (`MeldParam`) with one row per stat and 13 columns, and each item names a column with `Item.BaseParamModifier` (its **kind**). The page keeps each item's kind and the table, and reads $f_s = \text{MeldParam}[s][\text{kind}] / 100$.

| Kind of item | Main stat | Vitality | Pieces |
| --- | --- | --- | --- |
| Strength (1, 2, 3, 10), Dexterity (4, 11, 12) | 100% | 100% | 11,389 |
| Intelligence (5), Mind (6) | 100% | 90% | 5,843 |
| Strength + Dexterity (7) | 100% | 100% | 25 |
| Intelligence + Mind (8) | 100% | 90% | 5 |
| All four main stats (0) | 90% | 90% | 19 |

Counts are database pieces. Notes on the kinds:

- Kind 7 is the Gloam and High Allagan "of Striking" sets and the Occult "of Blood" accessories. Kind 8 is the Occult "of Magic" accessories. (Occult accessories are item level 745 field operation gear.)
- Kind 9 is crafter and gatherer gear, which the database leaves out.
- Kind 0 is the Lieutenant's, Field Commander's and Warlord's sets and Proto Ultima Mesh (13 pieces with all four main stats), plus six earrings and rings every job can wear, which carry the game's generic Main Attribute (Halone's, Azeyma's, Bozjan, Menphina's, Aetheryte, Neophyte's).

Every substat (Critical Hit, Determination, Direct Hit, both speeds, Tenacity) is 100% in every column. Piety is 70% or 90% in most columns, but no piece carries Piety in such a column, so it never applies to an item's own stats. It does apply to a cap: a Secondary Attribute counts as Piety for a healer ([data-pipeline.md, section 3](../engineering/data-pipeline.md#3-the-shared-format-definition)), and on a kind 0 earring it is capped at the 90% Piety cap (Azeyma's Earrings at 430: 71 for Sage in game; [validation.md, section 8](validation.md#8-open-question-in-game-captures)).

So for a piece with a single main stat the factor is exactly the job rule: **Vitality × 0.9 on Intelligence and Mind gear, 1 everywhere else**. The difference shows on two kinds of piece:

- Pieces with all four main stats have every main stat and Vitality at 90%. Field Commander's Coat, item level 160 body: $\operatorname{round}(448 \times 135/1000) = 60$, $\times 0.9 = 54$, which is what it carries.
- Pieces with no named main stat (the Occult accessories at 745) take the factor of their kind: "of Magic" Vitality 307, "of Blood" 341, from the same budget ($5085 \times 67/1000 = 340.695 \to 341$, $\times 0.9 = 306.9 \to 307$).

An Intelligence earring every job can wear (Alexandrian Earrings of Casting) still has Vitality × 0.9, because the factor goes with the item.

**Verified** in the game files: the table and the item column are read from the client data on every regeneration, and the generator stops if an item names a column the table does not have. The order of the rounding (slot share first, then the factor) is read off real items. Applying the 90% first, as xivgear does for its sync caps, is right on only 18 Intelligence/Mind pieces where the two orders differ, and wrong on 1,199.

**Where no item is involved** (the Sync limits tab and Piece stats, which describe a slot for a job), the page uses the factor the job's own gear carries: main stat 1, Vitality 0.9 for Intelligence and Mind jobs, 1 otherwise. A unit test checks this against the game files for all 23 jobs: every database piece a job can wear that carries that job's main stat and no other has exactly those factors. The only pieces whose factors differ from the job's are of kind 0: the 13 four-main-stat pieces and the six all-jobs earrings and rings.

### Substat shares (empirical)

The game stores only the final numbers on each item. It does not store how a slot budget is split between substats. Real gear follows this pattern, ranked by size on the piece:

| Rank on the piece | Share $w$ |
| --- | --- |
| Largest substat | 100% |
| Second | 70% |

Two refinements, both read off real pieces:

- **Equal substats share the higher rank.** The relic weapon steps Hyperconductive, Manderville, Amazing Manderville and Phantom carry two substats at 100% (141 pieces). A relic weapon is upgraded in steps through a long quest line.
- **Every main stat on a piece is at full share.** Ten item level 110 pieces carry Strength and Dexterity at the same value.

**Direct Hit on healer gear is a fixed 20% line, outside the ranking.** On gear whose only main stat is Mind, Direct Hit sits at 20% of its slot value whatever its size next to the other substats: as the third line (113 pieces), as the second (4), or as the only substat (8 early relic weapons). It is the old Accuracy stat, renamed Direct Hit in patch 4.0 ([validation.md, section 2](validation.md#what-the-misses-look-like)).

- It is the only third substat in the game. Over every combat piece in `Item`, at any item level, the only pieces with three substats, and the only substat lines below half their slot value, are Direct Hit on Mind-only gear at item level 50 to 135.
- Strength, Dexterity and Intelligence gear never has a third substat, and Direct Hit on any other gear ranks like other substats.
- High quality (HQ) crafted pieces carry bonus stats over the normal version. On HQ pieces this line gets no HQ bonus while the other substats do (all 16 HQ-able pieces).

**Inferred** (measured; not in the game files).

**On green crafted pieces the line is 25%.** Green and blue are item rarities, shown as the colour of the item's name (`Item.Rarity` 2 and 3). Eight item level 110 crafted healer pieces carry Direct Hit at exactly 25% of the slot value: Ebony Cane, Kirimu Codex, Platinum Planisphere, Platinum Circlet, the Arachne Robe and Culottes, and the Kirimu Gloves and Boots of Healing.

- Before patch 4.0 they carried it at 20% (the Ebony Cane's Accuracy 9; [validation.md, section 2](validation.md#what-the-misses-look-like)), and 4.0 raised them.
- In the data they are exactly the Mind-only pieces with Direct Hit that are green, can be HQ and carry three substats. Their blue crafted siblings (High Adjudicator's Gavel, Mighty Thunderdome, The Law of Levin First Edition) and green pieces that cannot be HQ stay at 20%.
- The model applies 25% under exactly that condition.

**Inferred**, and fitted to these eight: no other piece matches it, and since gear above item level 135 never carries this line, no new piece will test it. Adopted by the owner because it changes no other piece.

Two exceptions go by item name, because nothing in the data marks the pieces (owner's decision):

- **Atma weapons carry their Zenith stats.** The 11 Zodiac Atma weapons (item level 100; Zenith, Atma and Animus are steps of the Zodiac relic weapon) are exact copies of their Zenith step (item level 90): the same main stat, Vitality, substats and weapon damage (**verified**, `Item`; Curtana Zenith and Curtana Atma both carry Strength 22, Vitality 24, Direct Hit 26, Tenacity 18 and damage 61). The following Animus step, also item level 100, carries item level 100 stats. The model predicts an item whose name ends in " Atma" (exactly these 11) at item level 90. This only affects the whole-database accuracy figure; the pieces are below the banded check's item level 110.
- **The all-jobs earrings and rings carry their own factors.** The six kind 0 pieces with Main Attribute (Neophyte's Ring and the Aetheryte, Bozjan, Menphina's, Azeyma's and Halone's earrings) were edited by hand patch by patch (**verified**, datamining history). So their main stat and Vitality follow no one factor: Main Attribute full and Vitality 90% (Neophyte's, Aetheryte), both full (Bozjan, Menphina's, Azeyma's), both 90% (Halone's). The model gives each its own pair of factors. This applies to stored stats only: synced, the game applies the file's 90% (second-hand in-game values; [validation.md, section 8](validation.md#8-open-question-in-game-captures)).

**Inferred**: the shares are a measured pattern, not a game rule. Predicting every combat piece at item level 110 or above that has at least two substats this way (main stats and Vitality at full share times the item's stat factor, substats by rank, the Direct Hit line, off-hands as in section 3) reproduces 99.9% of them exactly (16,605 of 16,629), and every one within 1. The per-band table, and what the misses look like, are in [validation.md, section 2](validation.md#2-every-real-piece-by-item-level-band).

Where the shares matter: Piece stats uses them, with the two ranked substats (it does not build the fixed Direct Hit line), and so does the "generic maximum" in section 6, which is built from formula pieces. The item pool and the optimizer read each real item's own stats, so they do not depend on the shares.

### Worked example: a healer head piece at item level 130

Take a healer head piece at item level 130 with Spell Speed and Piety, plus the fixed Direct Hit line of older healer gear. A real piece like this is in the game files with Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6 (**verified**: exactly one database row has all five values; two other item level 130 head pieces carry the same numbers on different substats). Head share $p = 85$. Table values at row 130: main stat 385, Vitality 414, substats 363.

| Stat | Budget | $\times\,85/1000$ | Round | Share | Round | Game file |
| --- | --- | --- | --- | --- | --- | --- |
| Mind | 385 | 32.725 | 33 | 100% | 33 | 33 |
| Vitality | 414 | 35.19 | 35 | ×0.9 = 31.5 | 32 | 32 |
| Spell Speed (rank 1) | 363 | 30.855 | 31 | 100% | 31 | 31 |
| Piety (rank 2) | 363 | 30.855 | 31 | 70% = 21.7 | 22 | 22 |
| Direct Hit (fixed line) | 363 | 30.855 | 31 | 20% = 6.2 | 6 | 6 |

Every value matches the real piece. The Vitality line also shows the half-up rule at work: 31.5 rounds to 32. Piece stats, given Spell Speed and Piety, shows the first four lines; the Direct Hit line comes from the accuracy check's model.

## 5. Item level sync

### Which pieces are synced

A piece is synced in two cases (**verified** by the owner in game):

1. **Item level sync**: the duty has an item level cap $C$ (item level sync on) and the piece's item level is above $C$. The piece is synced to $C$.
2. **Level sync**: the piece's equip level is above the synced character level $L$. The piece is synced to the item level the game assigns to $L$, $\text{sync}(L)$.

A third kind of piece follows the level whatever its equip level: gear whose item level **scales with the wearer** (`Item.SubStatCategory` 2; 260 pieces: the level 89 and 99 boost gear at item level 560 and 690, and six all-jobs earrings and rings such as Menphina's Earring). The game's own description says so: "IL and attributes synced to current job level." (241 pieces), or that attributes and item level vary with the current level (the six accessories) (**verified**, game data). Such a piece is synced to $\text{sync}(L)$ whenever that is below its own item level, or to the item level cap where that is lower still. That the target is $\text{sync}(L)$ at every level is *inferred*: it gives the Wiki's artifact armor item levels (548 at level 89, 678 at level 99; *second-hand*), and ffxiv-gearing applies the same rule at levels 50 to 90 ([validation.md, section 9](validation.md#9-against-another-tool-ffxiv-gearing)).

A synced piece also loses its materia melds (**verified** by the owner in game; [materia.md, section 2](materia.md#2-the-rules)).

$\text{sync}(L)$ is the `ItemLevelSync` column of the game's `ParamGrow` sheet (**verified**: read from the game file):

| Synced level $L$ | 1 to 49 | 50 | 60 | 70 | 80 | 90 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| $\text{sync}(L)$ | $L$ | 130 | 270 | 400 | 530 | 660 | 690 |

Between the level caps it rises in steps of 3 (54 → 133, ..., 59 → 148). No real piece has an equip level above 100, so at level 100 level sync never applies. The same holds for a limited job at its own cap (Blue Mage 80, Beastmaster 50, section 1): it cannot wear gear of a higher equip level, so Piece stats and Sync limits show no level sync there. Scaling gear (below) is the exception: at 80 a Blue Mage wears Azeyma's and Halone's Earrings (item level 560 and 690) at 530, at 50 a Beastmaster wears the five scaling accessories it can equip at 130.

When both apply, the **item level cap wins**, even where it is the higher of the two. In Aloalo Island (level 90, item level 665) a player saw level 95 and 96 gear at item level 666 and 669 with item level 665 stats, not 660; level 94 gear at item level 663 (below the cap) was synced to 660 by its level ([xivgear issue #317](https://github.com/xiv-gear-planner/gear-planner/issues/317)). *Second-hand*: a player's report quoted by xivgear, which applies the same order; not captured by this project. In the owner's case the order does not matter: at T13 the cap 123 is below $\text{sync}(50) = 130$.

The synced item level $t$ of a piece at item level $i$ with equip level $e$ is therefore

$$
t =
\begin{cases}
\min(C, \text{sync}(L)) & \text{if the piece scales, } \text{sync}(L) < i \text{ and item level sync is on with } i > C \\
\text{sync}(L) & \text{else if the piece scales and } \text{sync}(L) < i \\
C & \text{else if item level sync is on and } i > C \\
\text{sync}(L) & \text{else if } e > L \\
\text{none (untouched)} & \text{otherwise}
\end{cases}
$$

and the clamp below is applied with $t$ in place of $C$. A piece synced to an item level at or above its own keeps its stats; only its materia stops counting.

- **Weapons.** The game file has one `ItemLevelSync` column for every slot. xivgear's sheet code uses a separate weapon table from its own data service for the sheet-wide target, but syncs each item with the one table. That weapons use the same value is *inferred*; the player report above saw level 100 weapons synced to item level 660 in P12S, a level 90 duty, which fits it at level 90.
- **Pieces with no equip level.** Generated and hand-made pieces, and the Piece stats and Sync limits tabs (which have no item behind them), know only an item level. A generated or hand-made pool piece is synced only by the item level cap. Piece stats and Sync limits use the item level cap when item level sync is on; with it off and a synced level below 100, they show $\text{sync}(L)$, the cap a piece with a higher equip level gets.

What changes at T13 (level 50, cap 123), measured on the current data: 71 pieces (all equip level 51, item level 120) are synced by their level alone, to 130. That is above their item level, and a direct clamp to the item level 130 caps lowers none of their stats for any job that can wear them, so no stat changes. Every other piece is synced exactly as by the cap alone.

With item level sync off, level sync alone syncs this many of the 17,316 database pieces (the 35 Beastmaster pieces, equip level 50, are synced at none of these levels; scaling gear is counted in, 1 to 5 pieces a level that the equip level alone would leave):

| Synced level | $\text{sync}(L)$ | Pieces synced | Above $\text{sync}(L)$ | With a stat lowered |
| --- | --- | --- | --- | --- |
| 50 | 130 | 16,188 | 15,975 | 15,954 |
| 60 | 270 | 13,014 | 12,795 | 12,795 |
| 70 | 400 | 9,503 | 9,278 | 9,278 |
| 80 | 530 | 6,247 | 6,016 | 6,016 |
| 90 | 660 | 3,266 | 3,035 | 3,035 |

A stat is lowered on every piece above $\text{sync}(L)$ except 21 at level 50: item level 133 pieces whose stats equal the item level 130 caps.

### The clamp rule

Let $C$ be the sync cap. Each piece has a **cap value** for each stat, computed from budget row $C$, the piece's slot share $p$ (‰) and its stat factor $F_s$ in percent (section 4; $F_s = 100 f_s$). The factor comes first and each step is floored; only the last step rounds:

$$
\text{cap}_s(C) = \operatorname{round}\!\left(\frac{1}{10}\left\lfloor \frac{\lfloor \text{budget}_s(C) \times F_s / 100 \rfloor \times p}{100} \right\rfloor\right)
$$

**This is not the order of an item's own stats.** A piece's stats round the slot budget first and apply the factor after (section 4), and that order is the right one for items: it fits 5,820 of 5,842 Intelligence and Mind pieces on Vitality, the factor-first order 4,639. Caps follow the factor-first order because the game's sync values do (below).

**With $F_s = 100$ the two orders give the same number**, so every cap of a stat without a factor (all substats, the main stat on single-main-stat gear, Vitality on Strength and Dexterity gear) is the full-share value of a piece of the same slot at item level $C$, $B_s(C)$. Write $x = \text{budget}_s(C) \times p / 100$. Then $\lfloor x \rfloor / 10$ is a multiple of 0.1 at most 0.1 below $x / 10$, so no rounding threshold ($k + 0.5$) lies between them, and $\operatorname{round}(\lfloor x \rfloor / 10) = \operatorname{round}(x / 10) = B_s(C)$. A unit test checks this at every item level 1 to 795 for every slot share and the off-hand.

**With a factor below 100 the orders differ**, and the cap can be 1 above or 1 below what a same-slot piece of the same kind carries at $C$. For Intelligence and Mind Vitality (factor 90) that happens in 1,159 of 4,770 item level and slot combinations (item levels 1 to 795; head, body, accessory, two-handed and one-handed weapon, off-hand): 405 times 1 higher, 754 times 1 lower. The same holds for the main stat, Vitality and Piety (factor 90) of the kind 0 pieces (all four main stats, and the all-jobs earrings and rings): about one item level in four per slot changes.

For a real piece $F_s$ is the piece's own factor. For the Sync limits tab and Piece stats, which have no item behind them, it is the job's (Vitality 90 for Intelligence/Mind jobs). The two differ only for the kind 0 pieces. Synced to 123, Field Commander's Coat (item level 160, body) is capped at main stat 43 and Vitality 45 for every job, where the job rule gives a Warrior 48 and 51:

$$
\lfloor 355 \times 0.9 \rfloor = 319,\ \lfloor 319 \times 1.35 \rfloor = 430,\ 43.0 \to 43; \qquad \lfloor 375 \times 0.9 \rfloor = 337,\ \lfloor 337 \times 1.35 \rfloor = 454,\ 45.4 \to 45
$$

**Evidence for the cap order.** xivgear computes caps this way (`statCapWithJob`, [xivmath.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/xivmath/src/xivmath.ts#L647-L649)), and three in-game values quoted in its tests fit the factor-first cap and miss the item order by 1; the values, the arithmetic and the sources are in [validation.md, section 8](validation.md#8-open-question-in-game-captures). **Verified** by these three second-hand in-game values; for the other factor-below-100 caps the order is **inferred** from them.

Then, for a piece at item level $i$:

$$
\text{synced}_s =
\begin{cases}
\text{stat}_s & \text{if } i \le C \\
\min\big(\text{stat}_s,\ \text{cap}_s(C)\big) & \text{if } i > C
\end{cases}
$$

Pieces at or below the cap are untouched. Above the cap, each stat is cut down to the cap value. Stats that are already below the cap stay as they are.

![Bar chart of the item level 130 healer head piece from the worked example synced to item level 123. Mind is clamped from 33 to 30, Vitality from 32 to 29 and Spell Speed from 31 to 29. Piety 22 and Direct Hit 6 are below the cap of 29 and are kept.](../diagrams/math-clamp.svg)

### Caps at item level 123

Cap 123 uses budget row 123: main stat 355, substat 346, Vitality 375. The Intelligence/Mind Vitality column takes the 90% factor first (the clamp rule above): $\lfloor 375 \times 0.9 \rfloor = 337$, then body $\lfloor 337 \times 1.35 \rfloor = 454 \to 45$ and two-handed weapon $\lfloor 337 \times 1.40 \rfloor = 471 \to 47$. Both are one below what a native piece of the slot carries ($\operatorname{round}(51 \times 0.9) = 46$, $\operatorname{round}(53 \times 0.9) = 48$). Head and accessories come out the same either way.

| Slot | Substat cap | Main-stat cap | Vitality cap (Str/Dex) | Vitality cap (Int/Mind) |
| --- | --- | --- | --- | --- |
| Head, hands, feet | 29 | 30 | 32 | 29 |
| Body, legs | 47 | 48 | 51 | 45 |
| Earring, necklace, bracelet, ring | 23 | 24 | 25 | 23 |
| Two-handed weapon | 48 | 50 | 53 | 47 |
| One-handed weapon (Paladin, Beastmaster) | 35 | 36 | 38 | – |
| Shield (Paladin, Beastmaster) | 13 | 14 | 15 | – |

On the worked example piece, cap 123 changes Mind from 33 to 30, Vitality from 32 to 29 and Spell Speed from 31 to 29. Piety (22) and Direct Hit (6) stay as they are.

For jobs with no special substat (melee, Dexterity and caster DPS), Piety or Tenacity on a piece is ignored, so its cap is 0.

These caps are computed, not read off real gear: the game has no gear at item level 123 (the items jump from 120 to 125). A unit test derives every slot's cap from budget row 123 and the slot shares without calling the code, and checks the same rule against every real piece at item level 120 and 125 ([validation.md, section 3](validation.md#the-caps-at-item-level-123)).

### Check against published caps

The FFXIV Wiki's Item Level Sync page lists substat caps at item level 475. The clamp rule above reproduces all five published values (accessory 88, head 112, body 177, one-handed weapon 131, shield 53). **Verified**; the table and what it does not cover are in [validation.md, section 3](validation.md#3-published-sync-caps-at-item-level-475).

### What is assumed

- **Main stat and Vitality** are clamped the same way as substats, with the piece's own stat factor. The Wiki table covers substats only. The three second-hand in-game values of the clamp rule above (two Vitality caps and a kind 0 earring's main stat at its kind's 90%; [validation.md, section 8](validation.md#8-open-question-in-game-captures)) support it. This project has no capture of its own, so it stays *inferred* in general, and so does using the piece's factor rather than the job's. xivgear does the same: its caps take the factor from the item (`BaseParamModifier`), and its `applyStatCaps` ([gear.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/gear.ts)) clamps every stat on a synced piece, main stats and Vitality included, exempting only weapon delay (`NO_SYNC_STATS`, [geartypes.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/xivmath/src/geartypes.ts)). With the factor-first order, its cap formula and this page's are the same.
- **Lower-ranked substats** are clamped against the full-share cap. The alternative would clamp them against their own share at the cap (for example $\operatorname{round}(29 \times 0.7) = 20$ for a 70% Piety on a head piece at 123, instead of 29). *Inferred, strongly supported*: a player's in-game report shows a lower substat clamped to the full cap, and The Balance's item level thresholds for "both substats capped" only make sense under this rule. Nothing contradicts it, but this project has no capture of its own. The evidence is in [validation.md, section 8](validation.md#8-open-question-in-game-captures).
- **No scaling up**: sync never raises a stat. *Assumed.*

In-game captures under a known sync would settle the first two points; what to capture is in [validation.md, section 8](validation.md#8-open-question-in-game-captures).

## 6. Speed and substat tiers

Speed shortens the **global cooldown (GCD)**, the shared recast timer of most actions, normally 2.5 s. It also makes damage-over-time (DoT) and heal-over-time (HoT) effects tick harder. The tool uses AkhMorning's community formulas with two per-level values from the game's `ParamGrow` sheet:

- $\text{sub}$ (`BaseSpeed`): the character's own speed at that level
- $\text{div}$ (`LevelModifier`): the level's scaling divisor

| Level | sub | div |
| --- | --- | --- |
| 50 | 341 | 341 |
| 60 | 354 | 600 |
| 70 | 364 | 900 |
| 80 | 380 | 1300 |
| 90 | 400 | 1900 |
| 100 | 420 | 2780 |

**Gear speed** $g$ is the sum of Skill Speed or Spell Speed on the gear. **Total speed** is $\text{sub} + g$; at level 50, 296 gear speed is 637 total. The tool shows gear speed and adds sub internally. AkhMorning writes the formula with total speed:

$$
m = 1000 + \left\lceil \frac{130\,(\text{sub} - \text{total speed})}{\text{div}} \right\rceil = 1000 - \left\lfloor \frac{130\, g}{\text{div}} \right\rfloor
$$

$$
\text{GCD} = \frac{1}{100}\left\lfloor \frac{b \cdot m}{10000} \right\rfloor \ \text{seconds}
$$

where $b$ is the base recast in milliseconds (2,500). The DoT/HoT tick multiplier is

$$
\text{tick multiplier} = 1 + \frac{1}{1000}\left\lfloor \frac{130\, g}{\text{div}} \right\rfloor
$$

Example at level 50 with $g = 296$: $\lfloor 130 \times 296 / 341 \rfloor = \lfloor 112.85 \rfloor = 112$, so $m = 888$. That gives $\lfloor 2500 \times 888 / 10000 \rfloor = 222$, a 2.22 s GCD, and a tick multiplier of 1.112.

**GCD tiers at level 50.** Because of the floors, the GCD drops in steps. The tool finds them by scanning gear speed from 0 to 1,200:

| Gear speed | GCD |
| --- | --- |
| 0 | 2.50 s |
| 3 | 2.49 s |
| 150 | 2.35 s |
| 202 | 2.30 s |
| 286 | 2.22 s |
| 297 | 2.21 s |
| 307 | 2.20 s |
| 349 | 2.16 s |

After 3, a new tier starts about every 10.5 points of gear speed.

**Generic maximum under cap 123.** Give every armor and accessory slot the full-share speed cap: head, hands and feet at 29 each, body and legs at 47 each, and five accessories (earring, necklace, bracelet, two rings) at 23 each (weapon excluded):

$$
3 \times 29 + 2 \times 47 + 5 \times 23 = 87 + 94 + 115 = 296
$$

That is a 2.22 s GCD at level 50, one point below the 2.21 s tier at 297. A real gear set usually falls short of this, because a piece rarely has speed as its top substat in every slot.

Verification status: the formulas are a community reference, not game files. Which GCD values are asserted in tests, and their sources, is in [validation.md, section 5](validation.md#5-speed-and-gcd). Whether a particular action's recast is reduced by speed depends on the job, so the tool reports only the 2.5 s base GCD and the tick multiplier.

### Substat tiers (breakpoints)

Like the GCD, every other substat's effect moves in steps (critical rate, Determination multiplier, Direct Hit rate, Tenacity, Piety), because its formula floors too, so points between two steps do nothing. The optimizer maximizes raw totals, not effects ([optimizer.md](../engineering/optimizer.md)). What that means for its answers:

- **The target:** since every effect only rises with more points, the highest raw target total is always in the highest reachable step. Proved from the formulas and confirmed on 736 optimizer runs on full pools.
- **Tiebreaks:** in 200 of 572 runs with a target and one tiebreak, another loadout keeps the target's step and puts the tiebreak a step higher. This happens mostly at level 100, where steps are 14 to 25 points wide, and rarely at level 50 (cap 123), where they are 1 to 3. It nearly always needs different gear, not different melds ([materia.md](materia.md)).
- **What the tool does:** it keeps raw totals and shows the steps instead. Under the result it shows each substat's effect from gear (no food), the points above the start of its step and the points to the next. Ranking tiebreaks by step instead is not planned (owner's decision): raw totals already reach the target's best step, the tiebreak gain is about one step, food shifts every step, and it would need the same engine changes as a target GCD.

**Measured** by an independent dynamic program. The step formulas are the community ones from AkhMorning, matching xivgear (**inferred**).

## 7. Verified and assumed

| Claim | Status | Evidence |
| --- | --- | --- |
| Item level indexes the `ItemLevel` budget table | Verified | Game table; real items |
| Slot shares 140/100/40/85/135/220/67 | Verified | `BaseParam.csv`, all 14 stats |
| Two roundings, half up | Verified | 99.9% exact; 80.0% with one |
| Per-item stat factor | Verified | Game files; real items (1) |
| Item stats: slot value first, then the factor | Verified (real items) | Factor first: 1,199 wrong (2) |
| Sync caps: factor first, floored, rounded once | Verified (three second-hand in-game values); inferred in general | xivgear's test notes (3) |
| Job's factor where no item is involved | Verified (game files) | Every single-main-stat piece |
| Sync cap uses the piece's own factor | Inferred (supported second-hand) | Azeyma's Earrings (4) |
| Substat shares 100% / 70% by rank, equal substats share a rank | Inferred (measured pattern) | 99.7–100.0% per band |
| Direct Hit on Mind-only gear: fixed 20% line | Inferred (measured pattern) | 125 of 133 such pieces |
| That line is 25% on green, HQ-able three-substat pieces | Inferred (fitted to 8 pieces) | All 8, no other |
| Atma weapons carry item level 90 stats | Verified (game data); applied by name | All 11 equal their Zenith step |
| All-jobs earrings and rings carry their own factors | Verified (datamining history); applied by name | All 6 exact |
| Off-hand = two-handed − one-handed value | Inferred (fits data) | 224 of 226 off-hands (5) |
| Sync clamps each stat to its cap at the cap item level | Verified for substats | Wiki caps at 475, 5 of 5 |
| Caps at 123 | Derived | Row 123 × slot share (6) |
| Same clamp for main stat and Vitality | Inferred (supported second-hand) | Three in-game values (7) |
| Lower-ranked substats clamp to the full-share cap | Inferred (strongly supported) | Player report; The Balance (8) |
| Melds ignored on synced pieces | Verified (owner, in game) | Section 5 |
| Level sync: equip level above the synced level | Verified (owner, in game) | Section 5 |
| Level sync item level = `ParamGrow.ItemLevelSync` | Verified (game file) | 50 → 130, ..., 90 → 660 |
| Both triggers: the item level cap wins | Second-hand | xivgear issue #317 |
| Weapons use the same level sync item level | Inferred | One column; same report |
| No scaling up under sync | Assumed | – |
| GCD and tick formulas | Community reference (AkhMorning) | AkhMorning tier tables (9) |
| Rows 796–920 carry no gear | Verified (data) | Highest real item level 795 |

Notes:

1. Vitality × 0.9 on Intelligence/Mind gear, every main stat and Vitality × 0.9 on four-main-stat gear; read from `BaseParam.MeldParam`, column `Item.BaseParamModifier`. Reproduces real items, the 13 four-main-stat pieces included.
2. On the 1,199 Intelligence/Mind pieces where the two orders differ and the item order is right; factor first is right on 18.
3. Three in-game values quoted in xivgear's tests fit factor first and not the item order ([validation.md, section 8](validation.md#8-open-question-in-game-captures)). With a factor of 100 the two orders are the same.
4. Azeyma's Earrings (kind 0) synced to 430 show the 90% main-stat cap of its kind for Ninja in game, not the job's full cap (xivgear's test note; [validation.md, section 8](validation.md#8-open-question-in-game-captures)). xivgear does the same; no capture of this project's own.
5. Against 195 for the 40 ‰ share. xivgear uses the same rule for shield caps. It sets the shield cap at 123 to 13.
6. The table in [Caps at item level 123](#caps-at-item-level-123). No gear exists at item level 123; real pieces at 120 and 125 follow the same rule in every slot ([validation.md, section 3](validation.md#the-caps-at-item-level-123)).
7. The three values in note 3. No capture of this project's own; xivgear clamps them too.
8. A player's in-game report (Determination 129 → 123 at 345, not 86), The Balance's thresholds and the Wiki ([validation.md, section 8](validation.md#8-open-question-in-game-captures)). No capture of this project's own.
9. Level 50, 90 and 100 tier tables, asserted in tests ([validation.md, section 5](validation.md#5-speed-and-gcd)).

## 8. Where this lives

| Concept | File |
| --- | --- |
| Budget table, level data and stat factor table (generated) | `src/data/item-level.json` |
| Highest row, highest real item level | `src/core/tables.js` |
| Slot shares, substat shares, role profiles, the Direct Hit line, Atma and all-jobs accessory rules | `src/core/constants.js` |
| Per-job stat mapping, the job's Vitality factor, weapon mode, level cap (`maxLevel`) | `src/core/job-context.js` |
| Level caps of the limited jobs, with their sources | `src/core/constants.js` (`JOB_LEVEL_CAPS`) |
| Gear above the job's level cap left out | `src/core/items.js` (`browseItems`, `wearable`) |
| An item's stat factors (from its kind) | `src/core/items.js` |
| Rounding, slot budget, piece stats (`buildPiece`), caps (`capValue`, `capsFor`), sync clamp, step-by-step derivation, real-piece prediction (`predictRaw`) | `src/core/formulas.js` |
| Which item level a piece is synced to (item level and level sync) | `src/core/sync-target.js`; for pool items `itemSyncIlvl` in `src/core/optimizer/candidates.js` |
| The cap shown on Piece stats and Sync limits; level sync off at the job's cap | `src/ui/state.js` (`shownSync`, `levelSyncOn`) |
| GCD, tick multiplier, GCD tiers | `src/core/speed.js` |
| Accuracy against real items, Wiki 475 check | `src/core/validation.js` |
| Slot share check against `BaseParam.csv` | `scripts/data/item_format.py` (`check_slot_percents`) |
| Tests for the above | `tests/unit/formulas.test.js`, `sync.test.js`, `sync-cap-order.test.js`, `level-sync.test.js`, `speed.test.js`, `validation.test.js`, `stat-factor.test.js` |
