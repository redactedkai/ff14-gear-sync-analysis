# The stat model: from item level to synced stats

This page explains how the stats on a piece of gear follow from its item level, and what item level sync does to them. It covers the formulas the tool uses, a worked example with real game data, and which parts are verified and which are inferred.

Related pages: [optimizer.md](optimizer.md) (how the tool picks the best gear set), [data-pipeline.md](data-pipeline.md) (where the game tables come from and how they are regenerated) and [validation.md](validation.md) (how the model is checked against real items, the Wiki and AkhMorning).

All numbers below come from the game tables in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30) or from running the tool's own code against them.

## 1. Terms

- **Item level**: a number on every piece of gear. It is not a strength rating by itself. It is a row number in a game table that holds a stat budget for each stat.
- **Slot**: where the piece is worn: weapon, off-hand (shield), head, body, hands, legs, feet, earring, necklace, bracelet, and two rings.
- **Item level sync**: some content lowers your gear to a cap. For example, a duty run with the Minimum Item Level option and no Echo uses a fixed cap. Pieces above the cap lose stats; pieces at or below it are unchanged. The owner's main case is cap 123, but every formula here works for any cap.
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
- Piety and Tenacity match Critical Hit except in 6 rows (540, 565, 570, 590, 595, 596), where they are 1 to 8 higher. The Math tab's Sync caps table adds a Piety or Tenacity cap column only when the cap item level is one of these rows and the cap differs in some slot.
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

**Verified**: these are the values in `BaseParam.csv` for all 12 stats. The sheet's waist column is 0; the game no longer has a belt slot.

Paladin is the only combat job with a one-handed weapon plus a shield (100 + 40). Every other job uses a two-handed weapon (140).

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

For Intelligence and Mind jobs, Vitality gets one more factor:

$$
\text{Vitality} = \operatorname{round}\big(0.9 \times B_{\text{vit}}(i)\big)
$$

For Strength and Dexterity jobs the factor is 1.

**Rounding is half up**: $\operatorname{round}(x) = \lfloor x + 0.5 \rfloor$, so 31.5 becomes 32. The code adds a tiny epsilon so that floating-point noise such as 22.4999999 still rounds as 22.5 would.

**Rounding happens twice**: once for the slot budget, then again after the share. Rounding only once at the end reproduces 13,116 of the 16,584 checked pieces exactly (79.1%). Rounding twice reproduces 16,367 (98.7%). Both figures come from running the model over the item database.

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
| Third (rare; mostly Direct Hit on healer gear) | 20% |

**Inferred**: this is a measured pattern, not a game rule. Predicting every combat piece at item level 110 or above that has at least two substats this way (main stat and Vitality at full share, substats by rank) reproduces 98.7% of them exactly (16,367 of 16,584), and 97.1% to 99.6% per item level band. The per-band table, and what the misses look like, are in [validation.md, section 2](validation.md#2-every-real-piece-by-item-level-band).

Where the shares matter: the Piece lab uses them, and so does the "generic maximum" below, which is built from formula pieces. The item pool and the optimizer read each real item's own stats, so they do not depend on the shares.

### Worked example: a healer head piece at item level 130

Take a healer head piece at item level 130 with Spell Speed, Piety and Direct Hit, in that order. A real piece like this is in the game files with Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6 (**verified**: exactly one database row has all five values; two other item level 130 head pieces carry the same numbers on different substats). Head share $p = 85$. Table values at row 130: main stat 385, Vitality 414, substats 363.

| Stat | Budget | $\times\,85/1000$ | Round | Share | Round | Game file |
| --- | --- | --- | --- | --- | --- | --- |
| Mind | 385 | 32.725 | 33 | 100% | 33 | 33 |
| Vitality | 414 | 35.19 | 35 | ×0.9 = 31.5 | 32 | 32 |
| Spell Speed (rank 1) | 363 | 30.855 | 31 | 100% | 31 | 31 |
| Piety (rank 2) | 363 | 30.855 | 31 | 70% = 21.7 | 22 | 22 |
| Direct Hit (rank 3) | 363 | 30.855 | 31 | 20% = 6.2 | 6 | 6 |

Every value matches the real piece. The Vitality line also shows the half-up rule at work: 31.5 rounds to 32.

## 5. Item level sync

### The clamp rule

Let $C$ be the sync cap. Each slot type has a **cap value** for each stat: the full-share value that stat would have on a piece in the same slot at item level $C$:

$$
\text{cap}_s(C) = B_s(C) \quad\text{(with the 0.9 Vitality factor for Intelligence/Mind jobs)}
$$

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

Cap 123 uses budget row 123: main stat 355, substat 346, Vitality 375.

| Slot | Substat cap | Main-stat cap | Vitality cap (Str/Dex) | Vitality cap (Int/Mind) |
| --- | --- | --- | --- | --- |
| Head, hands, feet | 29 | 30 | 32 | 29 |
| Body, legs | 47 | 48 | 51 | 46 |
| Earring, necklace, bracelet, ring | 23 | 24 | 25 | 23 |
| Two-handed weapon | 48 | 50 | 53 | 48 |
| One-handed weapon (Paladin) | 35 | 36 | 38 | – |
| Shield (Paladin) | 14 | 14 | 15 | – |

On the worked example piece, cap 123 changes Mind from 33 to 30, Vitality from 32 to 29 and Spell Speed from 31 to 29. Piety (22) and Direct Hit (6) stay as they are.

For jobs with no special substat (melee, Dexterity and caster DPS), Piety or Tenacity on a piece is ignored, so its cap is 0.

These caps are computed, not read off real gear: the game has no gear at item level 123 (the items jump from 120 to 125). A unit test derives every slot's cap from budget row 123 and the slot shares without calling the code, and checks the same rule against every real piece at item level 120 and 125 ([validation.md, section 3](validation.md#the-caps-at-item-level-123)).

### Check against published caps

The FFXIV Wiki's Item Level Sync page lists substat caps at item level 475. The clamp rule above reproduces all five published values (accessory 88, head 112, body 177, one-handed weapon 131, shield 53). **Verified**; the table and what it does not cover are in [validation.md, section 3](validation.md#3-published-sync-caps-at-item-level-475).

### What is assumed

- **Main stat and Vitality** are clamped the same way as substats, with the 0.9 Vitality factor for Intelligence/Mind jobs. *Inferred.* The Wiki table covers substats only, and this has not been confirmed in game.
- **Lower-ranked substats** are clamped against the full-share cap. The alternative would clamp them against their own share at the cap (for example $\operatorname{round}(29 \times 0.7) = 20$ for a 70% Piety on a head piece at 123, instead of 29). *Inferred.* The model uses the full-share cap because the Wiki table lists a single cap per slot. No in-game capture confirms it for lower shares.
- **Melds** (materia added to gear) are ignored on synced-down pieces. *Assumed.*
- **No scaling up**: sync never raises a stat. *Assumed.*

In-game captures under a known sync would settle the first two points; what to capture is in [validation.md, section 8](validation.md#8-open-question-in-game-captures).

## 6. Speed: GCD and DoT/HoT ticks

Speed shortens the **global cooldown (GCD)**, the shared recast timer of most actions, normally 2.5 s. It also makes damage-over-time (DoT) and heal-over-time (HoT) effects tick harder. The tool uses AkhMorning's community formulas with two per-level values from the game's `ParamGrow` sheet:

- $\text{sub}$ (`BaseSpeed`): the character's own speed at that level
- $\text{div}$ (`LevelModifier`): the level's scaling divisor

| Level | sub | div | Default sync item level |
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
| Two roundings, half up | Verified | 98.7% exact vs 79.1% with one rounding |
| Vitality × 0.9 for Intelligence/Mind jobs | Verified | Reproduces real items (e.g. the worked example piece, Antiquated Atlas) |
| Substat shares 100% / 70% / 20% by rank | Inferred (measured pattern) | 97.1–99.6% exact per item level band ([validation.md](validation.md)); not in game files |
| Sync clamps each stat to the full-share same-slot value at the cap | Verified for substats | Wiki caps at 475, 5 of 5 |
| Caps at 123 (29 / 47 / 23 / 48; main stat 30 / 48 / 24 / 50) | Derived | No gear exists at item level 123; row 123 × slot share, the same rule real pieces at 120 and 125 follow in every slot |
| Same clamp applies to main stat and Vitality | Inferred | No in-game capture |
| Lower-ranked substats clamp against the full-share cap | Inferred | Consistent with Wiki's single cap per slot; no capture |
| Melds ignored, no scaling up under sync | Assumed | – |
| GCD and tick formulas | Community reference (AkhMorning) | Level-100 examples in tests; level-50 tiers in tests without a recorded source |
| Rows 796–920 carry no gear | Verified (data) | Highest real item level is 795 |

## 8. Where this lives

| Concept | File |
| --- | --- |
| Budget table and level data (generated) | `src/data/item-level.json` |
| Highest row, highest real item level | `src/core/tables.js` |
| Slot shares, substat shares, role profiles | `src/core/constants.js` |
| Per-job stat mapping, Vitality factor, weapon mode | `src/core/job-context.js` |
| Rounding, slot budget, piece stats, caps, sync clamp, step-by-step derivation | `src/core/formulas.js` |
| GCD, tick multiplier, GCD tiers | `src/core/speed.js` |
| Accuracy against real items, Wiki 475 check | `src/core/validation.js` |
| Tests for the above | `tests/unit/formulas.test.js`, `sync.test.js`, `speed.test.js`, `validation.test.js` |
