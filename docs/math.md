# The stat model: from item level to synced stats

This page explains how the stats on a piece of gear follow from its item level, and what item level sync does to them. It covers the formulas the tool uses, a worked example with real game data, and which parts are verified and which are inferred.

Related pages: [optimizer.md](optimizer.md) (how the tool picks the best gear set), [data-pipeline.md](data-pipeline.md) (where the game tables come from and how they are regenerated) and [validation.md](validation.md) (how the model is checked against real items, the Wiki and AkhMorning).

All numbers below come from the game tables in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30) or from running the tool's own code against them.

## 1. Terms

- **Item level**: a number on every piece of gear. It is not a strength rating by itself. It is a row number in a game table that holds a stat budget for each stat.
- **Slot**: where the piece is worn: weapon, off-hand (shield), head, body, hands, legs, feet, earring, necklace, bracelet, and two rings.
- **Item level sync**: some content lowers your gear to a cap. For example, a duty run with the Minimum Item Level option and no Echo uses a fixed cap. Pieces above the cap lose stats; pieces at or below it are unchanged. The owner's main case is cap 123, but every formula here works for any cap.
- **Level sync**: content for a lower character level lowers your level to match, and gear whose equip level is above that level is synced to an item level the game assigns to the level (section 5). Any duty can do both at once: T13 with Minimum Item Level is level 50 and item level 123.
- **Stats.** Each of the 22 combat jobs uses one of five role profiles. The tool uses role-neutral names:

| Neutral name | Meaning | Tank | Healer | Melee (Str) | Dexterity | Caster |
| --- | --- | --- | --- | --- | --- | --- |
| main stat | primary damage/healing stat | Strength | Mind | Strength | Dexterity | Intelligence |
| Vitality | hit points | Vitality | Vitality | Vitality | Vitality | Vitality |
| substats | Critical Hit, Determination, Direct Hit | same | same | same | same | same |
| speed | shortens the global cooldown (GCD) | Skill Speed | Spell Speed | Skill Speed | Skill Speed | Spell Speed |
| special substat | role-only substat | Tenacity | Piety | none | none | none |

The "Dexterity" column covers Ninja, Viper, Bard, Machinist and Dancer. Speed and the special substat also count as substats.

## 2. The budget table

The game's `ItemLevel` sheet has one row per item level (rows 0 to 920). Each row holds a budget for each of the 12 stats. In this data:

- The four main-stat columns (Strength, Dexterity, Intelligence, Mind) are identical in every row.
- Determination, Direct Hit, Skill Speed and Spell Speed are identical to Critical Hit in every row.
- Piety and Tenacity match Critical Hit except in 6 rows (540, 565, 570, 590, 595, 596), where they are 1 to 8 higher. The Sync limits sub-tab's table adds a Piety or Tenacity cap column only when the cap item level is one of these rows and the cap differs in some slot.
- Vitality has its own column.

So in practice there are three curves: main stat, substat and Vitality. We write them as $\text{budget}_s(i)$ for stat $s$ at item level $i$.

![Two line charts of the main-stat and substat budgets by item level. The top chart covers rows 1 to 920 and shades rows 796 to 920 as having no gear. The bottom chart zooms on item levels 100 to 200, marks the cap 123 (main stat 355, substat 346), and shades 135 to 150, where the substat budget rises steeply.](diagrams/math-budget.svg)

What the curve looks like (read from the table):

- **Up to 135**, both curves rise slowly, by 2 or 3 per item level. At 123 the main stat is 355 and the substat is 346.
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
| Earring, necklace, bracelet, ring | 67 |

**Verified**: these are the values in `BaseParam.csv` for all 14 stats the database stores. The sheet's waist column is 0; the game no longer has a belt slot.

Paladin is the only combat job with a one-handed weapon plus a shield (100 + 40). Every other job uses a two-handed weapon (140).

**The off-hand is the two-handed value minus the one-handed value.** Real shields do not follow the 40 ‰ share directly: each stat on an off-hand equals the two-handed weapon's value minus the one-handed weapon's value at the same item level and substat share, each computed with the formula below (140 − 100 = 40, but rounded as two weapons rather than once at 40). This reproduces 224 of 226 real off-hands exactly, against 195 for the 40 ‰ share (for example Vanguard Shield, item level 672: Critical Hit 63 = 218 − 155, where 40 ‰ gives 62; the item level 120 shields' Tenacity 13 = 47 − 34, where 40 ‰ gives 14). **Inferred**: it fits the data, but the game files do not say how shields are built. Sync uses it too, so a shield's caps are the two-handed cap minus the one-handed cap (section 5). xivgear computes shield caps the same way: its source says to ignore the off-hand percentage and take the two-handed cap minus the one-handed cap ([datamanager_new.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/datamanager_new.ts#L118-L240), `substatCap`), so the rule is shared with the most used community gear planner, though still not confirmed in game.

## 4. The stats on a piece

![Flow diagram of the seven steps from item level to synced stat, with Spell Speed and Piety values from an item level 130 healer head piece. Spell Speed goes 363, 30.855, 31, then is clamped from 31 to 29 at cap 123. Piety goes 363, 30.855, 31, times 0.7 is 21.7, rounds to 22, and stays 22.](diagrams/math-pipeline.svg)

### The formula

For a stat $s$ at item level $i$ in a slot with share $p$, the **slot budget** is

$$
B_s(i) = \operatorname{round}\!\left(\frac{\text{budget}_s(i) \times p}{1000}\right)
$$

and the stat on the piece is

$$
\text{stat}_s = \operatorname{round}\big(B_s(i) \times w\big)
$$

where $w$ is the stat's **substat share** (next section). The main stat and Vitality always take $w = 1$.

### The stat factor of an item

Some stats get one more factor $f_s$ between the slot budget and the substat share:

$$
\text{stat}_s = \operatorname{round}\Big(\operatorname{round}\big(B_s(i) \times f_s\big) \times w\Big) \qquad (\text{the inner rounding only when } f_s \ne 1)
$$

The factor belongs to the **item**, not to the job. The game files hold it: `BaseParam` has a table of percentages (`MeldParam`) with one row per stat and 13 columns, and each item names a column with `Item.BaseParamModifier` (its *kind*). The page keeps each item's kind and the table, and reads $f_s = \text{MeldParam}[s][\text{kind}] / 100$.

| Kind of item (examples) | Main stat | Vitality | Pieces |
| --- | --- | --- | --- |
| Strength gear (kinds 1, 2, 3, 10), Dexterity gear (4, 11, 12) | 100% | 100% | 11,389 |
| Intelligence gear (5), Mind gear (6) | 100% | 90% | 5,843 |
| Strength + Dexterity (7) | 100% | 100% | 25 |
| Intelligence + Mind (8) | 100% | 90% | 5 |
| No main stat (9) | – | 100% | 5 |
| All four main stats (0) | 90% | 90% | 19 |

Kind 7 is the Gloam and High Allagan "of Striking" sets and the Occult "of Blood" accessories; kind 8 the Occult "of Magic" accessories; kind 9 is crafter and gatherer gear, which the database leaves out. Kind 0 is the Lieutenant's, Field Commander's and Warlord's sets, Proto Ultima Mesh (13 pieces with all four main stats) and six earrings and rings with Vitality and Determination only (Halone's, Azeyma's, Bozjan, Menphina's, Aetheryte, Neophyte's). Counts are database pieces.

Every substat (Critical Hit, Determination, Direct Hit, both speeds, Tenacity) is 100% in every column. Piety is 70% or 90% in most columns, but no piece carries Piety in such a column, so it never applies to an item's own stats. It does apply to a cap: a Secondary Attribute counts as Piety for a healer ([data-pipeline.md, section 3](data-pipeline.md#3-the-shared-format-definition)), and on a kind 0 earring it is capped at the 90% Piety cap (Azeyma's Earrings at 430: 71 for Sage in game, section 5).

So for a piece with a single main stat the factor is exactly the old job rule: **Vitality × 0.9 on Intelligence and Mind gear, 1 everywhere else**. The difference shows on two kinds of piece. Pieces that carry all four main stats have every main stat and Vitality at 90% (Field Commander's Coat, item level 160 body: $\operatorname{round}(448 \times 135/1000) = 60$, $\times 0.9 = 54$, which is what it carries). And pieces with no main stat at all (the Occult accessories at 745) have the factor of their kind: "of Magic" Vitality 307, "of Blood" 341, from the same budget ($5085 \times 67/1000 = 340.695 \to 341$, $\times 0.9 = 306.9 \to 307$). An Intelligence earring every job can wear (Alexandrian Earrings of Casting) still has Vitality × 0.9, because the factor goes with the item.

**Verified** in the game files: the table and the item column are read from the client data on every regeneration, and the generator stops if an item names a column the table does not have. The order of the rounding (slot share first, then the factor) is read off real items: applying the 90% first, as xivgear does for its sync caps, is right on only 18 Intelligence/Mind pieces where it differs and wrong on 1,199.

**Where no item is involved** (the Sync caps tab and Piece stats, which describe a slot for a job), the page uses the factor the job's own gear carries: main stat 1, Vitality 0.9 for Intelligence and Mind jobs, 1 otherwise. A unit test checks this against the game files: every database piece a job can wear that carries that job's main stat and no other has exactly those factors, for all 22 jobs. Only the 13 four-main-stat pieces differ.

**Rounding is half up**: $\operatorname{round}(x) = \lfloor x + 0.5 \rfloor$, so 31.5 becomes 32. The code adds a tiny epsilon so that floating-point noise such as 22.4999999 still rounds as 22.5 would.

**Rounding happens twice**: once for the slot budget, then again after the share. Rounding only once at the end reproduces 13,280 of the 16,601 checked pieces exactly (80.0%). Rounding twice reproduces 16,573 (99.8%). Both figures come from running the model over the item database.

Example where it matters: Antiquated Atlas, a level 60 healer two-handed weapon at item level 200, has Piety 57. The substat budget at 200 is 587:

$$
587 \times 140/1000 = 82.18 \to 82, \qquad 82 \times 0.7 = 57.4 \to 57
$$

Rounding once gives $587 \times 0.14 \times 0.7 = 57.526 \to 58$, which is wrong.

### Substat shares (empirical)

The game stores only the final numbers on each item. It does not store how a slot budget is split between substats. Real gear follows this pattern, ranked by size on the piece:

| Rank on the piece | Share $w$ |
| --- | --- |
| Largest substat | 100% |
| Second | 70% |

**Direct Hit on healer gear is a fixed 20% line, outside the ranking.** On gear whose only main stat is Mind, Direct Hit sits at 20% of its slot value whatever its size next to the other substats: as the third line (113 pieces), as the second (4), or as the only substat (8 early relic weapons). It is the old Accuracy stat, renamed Direct Hit in patch 4.0 ([validation.md, section 2](validation.md#what-the-misses-look-like)). It is the only third substat in the game: over every combat piece in `Item`, at any item level, the only pieces with three substats, and the only substat lines below half their slot value, are Direct Hit on Mind-only gear at item level 50 to 135. Strength, Dexterity and Intelligence gear never has a third substat, and Direct Hit on any other gear ranks like other substats. On HQ pieces the line gets no HQ bonus while the other substats do (all 16 HQ-able pieces). **Inferred** (measured; not in the game files). It used to be modelled as a general third rank at 20%; that fit the same pieces except the 12 where Direct Hit is not the smallest line.

**On green crafted pieces the line is 25%.** Eight item level 110 crafted healer pieces (Ebony Cane, Kirimu Codex, Platinum Planisphere, Platinum Circlet, the Arachne Robe and Culottes, the Kirimu Gloves and Boots of Healing) carry Direct Hit at exactly 25% of the slot value. Before patch 4.0 they carried it at 20% (the Ebony Cane's Accuracy 9; [validation.md, section 2](validation.md#what-the-misses-look-like)), and 4.0 raised them. In the data they are exactly the Mind-only pieces with Direct Hit that are green (`Item.Rarity` 2), can be HQ and carry three substats; their blue crafted siblings (High Adjudicator's Gavel, Mighty Thunderdome, The Law of Levin First Edition) and green pieces that cannot be HQ stay at 20%. The model applies 25% under exactly that condition. **Inferred**, and fitted to these eight: no other piece matches it, and since gear above item level 135 never carries this line, no new piece will test it. Adopted by the owner because it changes no other piece.

Two refinements, both read off real pieces: substats of **equal size share the higher rank** (the relic weapon steps Hyperconductive, Manderville, Amazing Manderville and Phantom carry two substats at 100%; 141 pieces), and **every main stat on a piece is at full share** (ten item level 110 pieces carry Strength and Dexterity at the same value).

**Inferred**: this is a measured pattern, not a game rule. Predicting every combat piece at item level 110 or above that has at least two substats this way (main stats and Vitality at full share times the item's stat factor, substats by rank, off-hands as in section 3) reproduces 99.8% of them exactly (16,573 of 16,601), and 99.7% to 100.0% per item level band. The per-band table, and what the misses look like, are in [validation.md, section 2](validation.md#2-every-real-piece-by-item-level-band).

Where the shares matter: the Piece stats uses them, and so does the "generic maximum" below, which is built from formula pieces. The item pool and the optimizer read each real item's own stats, so they do not depend on the shares.

### Worked example: a healer head piece at item level 130

Take a healer head piece at item level 130 with Spell Speed and Piety, plus the fixed Direct Hit line of older healer gear. A real piece like this is in the game files with Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6 (**verified**: exactly one database row has all five values; two other item level 130 head pieces carry the same numbers on different substats). Head share $p = 85$. Table values at row 130: main stat 385, Vitality 414, substats 363.

| Stat | Budget | $\times\,85/1000$ | Round | Share | Round | Game file |
| --- | --- | --- | --- | --- | --- | --- |
| Mind | 385 | 32.725 | 33 | 100% | 33 | 33 |
| Vitality | 414 | 35.19 | 35 | ×0.9 = 31.5 | 32 | 32 |
| Spell Speed (rank 1) | 363 | 30.855 | 31 | 100% | 31 | 31 |
| Piety (rank 2) | 363 | 30.855 | 31 | 70% = 21.7 | 22 | 22 |
| Direct Hit (fixed line) | 363 | 30.855 | 31 | 20% = 6.2 | 6 | 6 |

Every value matches the real piece. The Vitality line also shows the half-up rule at work: 31.5 rounds to 32.

## 5. Item level sync

### Which pieces are synced

A piece is synced in two cases (**verified** by the owner in game):

1. **Item level sync**: the duty has an item level cap $C$ (item level sync on) and the piece's item level is above $C$. The piece is synced to $C$.
2. **Level sync**: the piece's equip level is above the synced character level $L$. The piece is synced to the item level the game assigns to $L$, $\text{sync}(L)$.

$\text{sync}(L)$ is the `ItemLevelSync` column of the game's `ParamGrow` sheet (**verified**: read from the game file):

| Synced level $L$ | 1 to 49 | 50 | 60 | 70 | 80 | 90 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| $\text{sync}(L)$ | $L$ | 130 | 270 | 400 | 530 | 660 | 690 |

Between the level caps it rises in steps of 3 (54 → 133, ..., 59 → 148). No real piece has an equip level above 100, so at level 100 level sync never applies.

When both apply, the **item level cap wins**, even where it is the higher of the two. In Aloalo Island (level 90, item level 665) a player saw level 95 and 96 gear at item level 666 and 669 with item level 665 stats, not 660; level 94 gear at item level 663 (below the cap) was synced to 660 by its level ([xivgear issue #317](https://github.com/xiv-gear-planner/gear-planner/issues/317)). *Second-hand*: a player's report quoted by xivgear, which applies the same order; not captured by this project. In the owner's case the order does not matter: at T13 the cap 123 is below $\text{sync}(50) = 130$.

The synced item level $t$ of a piece at item level $i$ with equip level $e$ is therefore

$$
t =
\begin{cases}
C & \text{if item level sync is on and } i > C \\
\text{sync}(L) & \text{else if } e > L \\
\text{none (untouched)} & \text{otherwise}
\end{cases}
$$

and the clamp below is applied with $t$ in place of $C$. A piece synced to an item level at or above its own keeps its stats; only its materia stops counting.

- **Weapons.** The game file has one `ItemLevelSync` column for every slot. xivgear's sheet code uses a separate weapon table from its own data service for the sheet-wide target, but syncs each item with the one table. That weapons use the same value is *inferred*; the player report above saw level 100 weapons synced to item level 660 in a level 90 duty (P12S), which fits it at level 90.
- **Pieces with no equip level.** Generated and hand-made pieces, and the Piece stats and Sync limits tabs (which have no item behind them), know only an item level. A generated or hand-made pool piece is synced only by the item level cap. Piece stats and Sync limits use the item level cap when item level sync is on; with it off and a synced level below 100, they show $\text{sync}(L)$, the cap a piece with a higher equip level gets.

What changes at T13 (level 50, cap 123), measured on the current data: 71 pieces (all equip level 51, item level 120) are synced by their level alone, to 130. That is above their item level, and a direct clamp to the item level 130 caps lowers none of their stats for any job that can wear them, so no stat changes; every other piece is synced exactly as by the cap alone. With item level sync off, level sync alone syncs these many of the 17,281 database pieces (a stat is lowered on every one above $\text{sync}(L)$ except 21 at level 50: item level 133 pieces whose stats equal the item level 130 caps):

| Synced level | $\text{sync}(L)$ | Pieces synced | Above $\text{sync}(L)$ | With a stat lowered |
| --- | --- | --- | --- | --- |
| 50 | 130 | 16,183 | 15,970 | 15,949 |
| 60 | 270 | 13,010 | 12,791 | 12,791 |
| 70 | 400 | 9,500 | 9,275 | 9,275 |
| 80 | 530 | 6,245 | 6,014 | 6,014 |
| 90 | 660 | 3,265 | 3,034 | 3,034 |

### The clamp rule

Let $C$ be the sync cap. Each piece has a **cap value** for each stat, computed from budget row $C$, the piece's slot share $p$ (‰) and its stat factor $F_s$ in percent (section 4; $F_s = 100 f_s$). The factor comes first and each step is floored; only the last step rounds:

$$
\text{cap}_s(C) = \operatorname{round}\!\left(\frac{1}{10}\left\lfloor \frac{\lfloor \text{budget}_s(C) \times F_s / 100 \rfloor \times p}{100} \right\rfloor\right)
$$

**This is not the order of an item's own stats.** A piece's stats round the slot budget first and apply the factor after (section 4), and that order is the right one for items: it fits 5,820 of 5,842 Intelligence and Mind pieces on Vitality, the factor-first order 4,639. Caps follow the factor-first order because the game's sync values do (below).

**With $F_s = 100$ the two orders give the same number**, so every cap of a stat without a factor (all substats, the main stat on single-main-stat gear, Vitality on Strength and Dexterity gear) is the full-share value of a piece of the same slot at item level $C$, $B_s(C)$. Write $x = \text{budget}_s(C) \times p / 100$. Then $\lfloor x \rfloor / 10$ is a multiple of 0.1 at most 0.1 below $x / 10$, so no rounding threshold ($k + 0.5$) lies between them, and $\operatorname{round}(\lfloor x \rfloor / 10) = \operatorname{round}(x / 10) = B_s(C)$. A unit test checks this at every item level 1 to 795 for every slot share and the off-hand.

**With a factor below 100 the orders differ**, and the cap can be 1 above or 1 below what a same-slot piece of the same kind carries at $C$. For Intelligence and Mind Vitality (factor 90) that happens in 1,159 of 4,770 item level and slot combinations (item levels 1 to 795; head, body, accessory, two-handed and one-handed weapon, off-hand): 405 times 1 higher, 754 times 1 lower. The same holds for the main stat, Vitality and Piety (factor 90) of the kind 0 pieces (all four main stats, and the pre-order earrings): about one item level in four per slot changes.

For a real piece $F_s$ is the piece's own factor. For the Sync caps table and Piece stats, which have no item behind them, it is the job's (Vitality 90 for Intelligence/Mind jobs). The two differ only for the kind 0 pieces: synced to 123, Field Commander's Coat (item level 160, body) is capped at main stat 43 and Vitality 45 ($\lfloor 355 \times 0.9 \rfloor = 319$, $\lfloor 319 \times 1.35 \rfloor = 430$, $43.0 \to 43$; $\lfloor 375 \times 0.9 \rfloor = 337$, $\lfloor 337 \times 1.35 \rfloor = 454$, $45.4 \to 45$) for every job, where the job rule gives a Warrior 48 and 51.

**Evidence for the cap order: three in-game values, second-hand.** xivgear computes caps this way (`statCapWithJob`, [xivmath.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/xivmath/src/xivmath.ts#L647-L649)), and its tests quote values seen in game. This project has not captured them itself:

| In-game value (xivgear test note) | Budget | Factor-first cap | Item-stat order |
| --- | --- | --- | --- |
| Blue Mage head at 270, Vitality 56 ("Verified in-game by Xi") | 736 | $\lfloor 662 \times 0.85 \rfloor = 562 \to$ **56** | $\operatorname{round}(62.56) = 63$, $\times 0.9 \to 57$ |
| Red Mage head at 530, Vitality 123 ("tested in game") | 1,603 | $\lfloor 1442 \times 0.85 \rfloor = 1225 \to$ **123** | $\operatorname{round}(136.26) = 136$, $\times 0.9 \to 122$ |
| Azeyma's Earrings at 430, main stat 71 (Ninja and Sage) | 1,170 | $\lfloor 1053 \times 0.67 \rfloor = 705 \to$ **71** | $\operatorname{round}(78.39) = 78$, $\times 0.9 \to 70$ |

The same notes give the rest of the Azeyma's sheet (Vitality 72, Determination 79, Direct Hit 79 for Ninja, Piety 71 for Sage) and Menphina's Earring at 425 for Sage (Vitality 72, Mind 69, Determination 78, Piety 70); both orders give all of those. The Red Mage value is the clearest: a piece synced to 530 keeps Vitality 123, one more than the native item level 530 head carries (Edenmorn Hat of Casting, 122), so a cap is not always what a same-slot piece at the cap carries. **Verified** by three second-hand in-game values; for the other factor-below-100 caps the order is **inferred** from them.

Then, for a piece at item level $i$:

$$
\text{synced}_s =
\begin{cases}
\text{stat}_s & \text{if } i \le C \\
\min\big(\text{stat}_s,\ \text{cap}_s(C)\big) & \text{if } i > C
\end{cases}
$$

Pieces at or below the cap are untouched. Above the cap, each stat is cut down to the cap value. Stats that are already below the cap stay as they are.

![Bar chart of the item level 130 healer head piece from the worked example synced to item level 123. Mind is clamped from 33 to 30, Vitality from 32 to 29 and Spell Speed from 31 to 29. Piety 22 and Direct Hit 6 are below the cap of 29 and are kept.](diagrams/math-clamp.svg)

### Caps at item level 123

Cap 123 uses budget row 123: main stat 355, substat 346, Vitality 375. The Intelligence/Mind Vitality column takes the 90% factor first (the clamp rule above): $\lfloor 375 \times 0.9 \rfloor = 337$, then body $\lfloor 337 \times 1.35 \rfloor = 454 \to 45$ and two-handed weapon $\lfloor 337 \times 1.40 \rfloor = 471 \to 47$, one below what a native piece of the slot carries ($\operatorname{round}(51 \times 0.9) = 46$, $\operatorname{round}(53 \times 0.9) = 48$). Head and accessories come out the same either way.

| Slot | Substat cap | Main-stat cap | Vitality cap (Str/Dex) | Vitality cap (Int/Mind) |
| --- | --- | --- | --- | --- |
| Head, hands, feet | 29 | 30 | 32 | 29 |
| Body, legs | 47 | 48 | 51 | 45 |
| Earring, necklace, bracelet, ring | 23 | 24 | 25 | 23 |
| Two-handed weapon | 48 | 50 | 53 | 47 |
| One-handed weapon (Paladin) | 35 | 36 | 38 | – |
| Shield (Paladin) | 13 | 14 | 15 | – |

On the worked example piece, cap 123 changes Mind from 33 to 30, Vitality from 32 to 29 and Spell Speed from 31 to 29. Piety (22) and Direct Hit (6) stay as they are.

For jobs with no special substat (melee, Dexterity and caster DPS), Piety or Tenacity on a piece is ignored, so its cap is 0.

These caps are computed, not read off real gear: the game has no gear at item level 123 (the items jump from 120 to 125). A unit test derives every slot's cap from budget row 123 and the slot shares without calling the code, and checks the same rule against every real piece at item level 120 and 125 ([validation.md, section 3](validation.md#the-caps-at-item-level-123)).

### Check against published caps

The FFXIV Wiki's Item Level Sync page lists substat caps at item level 475. The clamp rule above reproduces all five published values (accessory 88, head 112, body 177, one-handed weapon 131, shield 53). **Verified**; the table and what it does not cover are in [validation.md, section 3](validation.md#3-published-sync-caps-at-item-level-475).

### What is assumed

- **Main stat and Vitality** are clamped the same way as substats, with the piece's own stat factor. The Wiki table covers substats only. The three second-hand in-game values above (Vitality 56 and 123, main stat 71 on a kind 0 earring, with its kind's 90%) support it; this project has no capture of its own, so it stays *inferred* in general, and so does using the piece's factor rather than the job's (xivgear also takes the factor from the item: its caps use the item's `BaseParamModifier`). xivgear clamps the same way: its `applyStatCaps` ([gear.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/core/src/gear.ts)) clamps every stat on a synced piece to its cap, main stats and Vitality included, and exempts only weapon delay (`NO_SYNC_STATS`, [geartypes.ts](https://github.com/xiv-gear-planner/gear-planner/blob/6c3c878e708b9d98f1c4cb091723a2a0a6343603/packages/xivmath/src/geartypes.ts)). With the factor-first order, its cap formula (`statCapWithJob`) and this page's are the same.
- **Lower-ranked substats** are clamped against the full-share cap. The alternative would clamp them against their own share at the cap (for example $\operatorname{round}(29 \times 0.7) = 20$ for a 70% Piety on a head piece at 123, instead of 29). *Inferred, strongly supported.* A player's in-game report shows a lower substat clamped to the full cap. The Balance's item level thresholds for "both substats capped" only make sense under this rule. Nothing contradicts it, but this project has no capture of its own. The evidence is in [validation.md, section 8](validation.md#8-open-question-in-game-captures).
- **Melds** (materia added to gear) are ignored on synced-down pieces: a piece is synced, and its materia stops counting, when its item level is above the duty's item level cap (with item level sync on) or its equip level is above the duty's level. **Verified** by the owner in game. The page models no melds at all, so this only matters for a future materia tab.
- **No scaling up**: sync never raises a stat. *Assumed.*

In-game captures under a known sync would settle the first two points; what to capture is in [validation.md, section 8](validation.md#8-open-question-in-game-captures).

## 6. Speed: GCD and DoT/HoT ticks

Speed shortens the **global cooldown (GCD)**, the shared recast timer of most actions, normally 2.5 s. It also makes damage-over-time (DoT) and heal-over-time (HoT) effects tick harder. The tool uses AkhMorning's community formulas with two per-level values from the game's `ParamGrow` sheet:

- $\text{sub}$ (`BaseSpeed`): the character's own speed at that level
- $\text{div}$ (`LevelModifier`): the level's scaling divisor

| Level | sub | div | Level sync item level (section 5) |
| --- | --- | --- | --- |
| 50 | 341 | 341 | 130 |
| 60 | 354 | 600 | 270 |
| 70 | 364 | 900 | 400 |
| 80 | 380 | 1300 | 530 |
| 90 | 400 | 1900 | 660 |
| 100 | 420 | 2780 | 690 |

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

Verification status: the formulas are a community reference, not game files. Which GCD values are asserted in tests, and which have a recorded source, is in [validation.md, section 5](validation.md#5-speed-and-gcd). Whether a particular action's recast is reduced by speed depends on the job, so the tool reports only the 2.5 s base GCD and the tick multiplier.

## 7. Verified and assumed

| Claim | Status | Evidence |
| --- | --- | --- |
| Item level indexes the `ItemLevel` budget table | Verified | Game table; reproduces real items |
| Slot shares 140/100/40/85/135/67 | Verified | `BaseParam.csv`, all 12 stats |
| Two roundings, half up | Verified | 99.8% exact vs 80.0% with one rounding |
| Per-item stat factor (Vitality × 0.9 on Int/Mind gear, every main stat × 0.9 on four-main-stat gear) | Verified | Read from the game files (`BaseParam.MeldParam`, column `Item.BaseParamModifier`); reproduces real items, the 13 four-main-stat pieces included |
| Rounding order of item stats: slot value first, then the factor | Verified (real items) | Factor first is wrong on 1,199 Int/Mind pieces |
| Rounding order of sync caps: factor first, floored, rounded once | Verified (three second-hand in-game values); inferred in general | Vitality 56 (Blue Mage head, 270), 123 (Red Mage head, 530), main stat 71 (Azeyma's Earrings, 430), from xivgear's tests; the item order gives 57, 122, 70. Same as the item order when the factor is 100 |
| Job's factor where no item is involved | Verified (game files) | Equals the item factor on every single-main-stat piece of each job |
| Sync cap uses the piece's own factor | Inferred (supported second-hand) | Azeyma's Earrings (kind 0) synced to 430 show main stat 71 for Ninja in game (xivgear's test note), the 90% cap of its kind, not the job's 78; xivgear does the same; no capture of this project's own |
| Substat shares 100% / 70% by rank (equal substats share a rank) | Inferred (measured pattern) | 99.7–100.0% exact per item level band ([validation.md](validation.md)); not in game files |
| Direct Hit on Mind-only gear is a fixed 20% line | Inferred (measured pattern) | 125 of 133 such pieces; the only third substat in the game |
| That line is 25% on green, HQ-able pieces with three substats | Inferred (fitted to 8 pieces) | All 8 such pieces, no other; they were 20% before patch 4.0 raised them |
| Off-hand = two-handed value − one-handed value | Inferred (fits data) | 224 of 226 real off-hands, against 195 for the 40 ‰ share; xivgear uses the same rule for shield caps; sets the shield cap at 123 to 13 |
| Sync clamps each stat to its cap at the cap item level (for a factor of 100, the full-share same-slot value) | Verified for substats | Wiki caps at 475, 5 of 5 |
| Caps at 123 (29 / 47 / 23 / 48; main stat 30 / 48 / 24 / 50; Int/Mind Vitality 29 / 45 / 23 / 47) | Derived | No gear exists at item level 123; row 123 × slot share, the same rule real pieces at 120 and 125 follow in every slot |
| Same clamp applies to main stat and Vitality | Inferred (supported second-hand) | The three in-game values above; no capture of this project's own; xivgear clamps them too |
| Lower-ranked substats clamp against the full-share cap | Inferred (strongly supported) | A player's in-game report (Det 129 → 123 at 345, not 86); The Balance's thresholds; the Wiki; no capture of this project's own |
| Melds ignored on synced-down pieces | Verified (owner, in game) | Item level above the duty's cap, or equip level above the duty's level |
| Level sync: equip level above the synced level syncs the piece | Verified (owner, in game) | The same observation |
| Level sync item level = `ParamGrow.ItemLevelSync` | Verified (game file) | 50 → 130, ..., 90 → 660 (xivgear's tests use 660 at level 90 too) |
| Both triggers: the item level cap wins | Second-hand | A player's report in xivgear issue #317 (Aloalo Island, item level 665 at level 90); xivgear applies the same order |
| Weapons use the same level sync item level | Inferred | One column in the game file; the same report fits it at level 90 |
| No scaling up under sync | Assumed | – |
| GCD and tick formulas | Community reference (AkhMorning) | Level-100 examples in tests; level-50 tiers in tests without a recorded source |
| Rows 796–920 carry no gear | Verified (data) | Highest real item level is 795 |

## 8. Where this lives

| Concept | File |
| --- | --- |
| Budget table, level data and stat factor table (generated) | `src/data/item-level.json` |
| Highest row, highest real item level | `src/core/tables.js` |
| Slot shares, substat shares, role profiles | `src/core/constants.js` |
| Per-job stat mapping, the job's Vitality factor, weapon mode | `src/core/job-context.js` |
| An item's stat factors (from its kind) | `src/core/items.js` |
| Rounding, slot budget, piece stats, caps (`capValue`, `capsFor`), sync clamp, step-by-step derivation | `src/core/formulas.js` |
| Which item level a piece is synced to (item level and level sync) | `src/core/sync-target.js`; for pool items `itemSyncIlvl` in `src/core/optimizer/candidates.js` |
| The cap shown on Piece stats and Sync limits | `src/ui/state.js` (`shownSync`) |
| GCD, tick multiplier, GCD tiers | `src/core/speed.js` |
| Accuracy against real items, Wiki 475 check | `src/core/validation.js` |
| Tests for the above | `tests/unit/formulas.test.js`, `sync.test.js`, `sync-cap-order.test.js`, `level-sync.test.js`, `speed.test.js`, `validation.test.js`, `stat-factor.test.js` |
