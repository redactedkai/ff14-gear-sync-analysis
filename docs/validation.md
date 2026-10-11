# Validation: checking the model against external truth

The tool predicts stats from formulas. This page lists every check of those predictions against something the code did not produce: the game's own item data, the FFXIV Wiki, and AkhMorning's speed formulas. It also says which tests assert each check, and what evidence is still missing.

Related pages: [math.md](math.md) (the formulas being checked), [optimizer.md](optimizer.md) (the gear search and its correctness checks), [data-pipeline.md](data-pipeline.md) (where the item data comes from).

All numbers were produced by running the code against the data in this repository (ffxiv-datamining commit `d9582a6`, 2026-09-30).

## 1. Sources of truth

| Source | What it gives | Used for |
| --- | --- | --- |
| Game item data (`Item` sheet) | The final stats on 17,579 real combat pieces | Accuracy of the per-piece formula (section 2) |
| FFXIV Wiki, Item Level Sync page | Published substat caps at item level 475 | The sync clamp rule (section 3) |
| AkhMorning (community reference) | GCD formula and worked examples at level 100 | Speed and GCD (section 5) |

Some expected values in the tests are **regression values**: numbers the code produced once and that are now pinned so they cannot change silently. They protect against regressions but are not evidence that the model is right. Each section below says which kind a check is.

## 2. Every real piece, by item level band

**What is compared.** For every database piece at item level 110 or above with at least two substats, the model predicts all its stats from its item level and slot alone: main stat and Vitality at full share, substats at 100% / 70% / 20% by their rank on the piece (see [math.md, section 4](math.md#4-the-stats-on-a-piece)). For predicted stats $\hat s_k$ and real stats $s_k$, a piece counts as

$$
\text{exact if } \max_k |\hat s_k - s_k| = 0, \qquad \text{within 1 if } \max_k |\hat s_k - s_k| \le 1 .
$$

Every stat on the piece has to match, not just one.

| Item level | Pieces | Exact | Within ±1 on every stat |
| --- | ---: | ---: | ---: |
| 110–135 | 956 | 930 (97.3%) | 934 (97.7%) |
| 136–300 | 3,773 | 3,748 (99.3%) | 3,756 (99.5%) |
| 301–600 | 7,184 | 7,153 (99.6%) | 7,184 (100.0%) |
| 601+ | 4,673 | 4,536 (97.1%) | 4,545 (97.3%) |
| All | 16,586 | 16,367 (98.7%) | 16,419 (99.0%) |

**Verified** (game data). What this does and does not show:

- The budget table, the slot shares, the double rounding and the 0.9 Vitality factor are confirmed by these matches. With a single rounding the same check gives 79.1% exact (see [math.md, section 4](math.md#the-formula)).
- The 100 / 70 / 20 substat shares remain an **inferred** pattern. They fit almost every piece, but the game files do not store them.
- Only 301–600 reaches 100.0%, and only for "within 1". No band is 100% exact.

### What the misses look like

There are 219 misses in total (26, 25, 31 and 137 per band). Grouping them (a probe run for this page, not a committed test):

- **142 of the 219 are weapons whose two largest substats are equal**: both are at the full slot budget, where the rank rule expects the second at 70%. They all belong to five weapon lines: Hyperconductive (item level 230, 14 items), Manderville (615, 20), Amazing Manderville (630, 20) and four Phantom stages (745, 760, 775, 790; 22 each). The 601+ band's 137 misses are all weapons or off-hands, 128 of them from this group.
- Of the other 77, 52 are off by exactly 1, and 31 are shields or other off-hands (for example Vanguard Shield, item level 672: Critical Hit 63, predicted 62).
- The rest are small groups: item level 110 pieces that carry both Strength and Dexterity (the model predicts a single main stat), item level 110 pieces whose third substat is 2 or 3 above the 20% value, and two Vermilion Cloaks (item level 300) whose stats are far above the body budget.

So the largest single group follows a different, simple pattern (two substats at 100%). Why those lines are built that way is **not known**; the data only shows the pattern. The off-by-one cases are not explained. Possible causes, neither confirmed, are hand-tuned values and a different rounding for off-hands. A diagnostics view for these pieces is on the [roadmap](roadmap.md).

**Tests.** `tests/unit/validation.test.js` requires, in every band, at least 95% exact and at least 96% within 1, and prints each band's figures as a test diagnostic. The page's "Checked against real gear" panel shows the same table, because the page and the test call the same function. The thresholds are lower than today's figures on purpose, so new gear after a patch can move them; a band below the threshold means the model needs a look ([data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch)).

## 3. Published sync caps at item level 475

The FFXIV Wiki's Item Level Sync page lists the substat caps at item level 475. The model's cap for a slot with share $p$ is $\operatorname{round}(\text{budget}_{\text{sub}}(475) \times p / 1000)$, with $\text{budget}_{\text{sub}}(475) = 1314$:

| Slot | Share $p$ (‰) | $1314 \times p / 1000$ | Model | Wiki |
| --- | ---: | ---: | ---: | ---: |
| Accessory | 67 | 88.04 | 88 | 88 |
| Head, hands, feet | 85 | 111.69 | 112 | 112 |
| Body, legs | 135 | 177.39 | 177 | 177 |
| One-handed weapon | 100 | 131.4 | 131 | 131 |
| Shield | 40 | 52.56 | 53 | 53 |

**Verified**: 5 of 5 match.

What this confirms: the clamp rule (each stat on a piece above the cap is limited to the full-share value of a same-slot piece at the cap) for **substats**. What it does not cover: the main stat, Vitality, and whether lower-ranked substats clamp against the full-share value or their own share. The Wiki lists one cap per slot and only for substats ([math.md, section 5](math.md#what-is-assumed)).

**Tests.** `validation.test.js` checks all five rows; `sync.test.js` checks the one-handed weapon and shield rows through a Paladin's caps (so the job-dependent weapon path is covered too); the smoke test checks that the page's Wiki table says "match" on every row.

### The caps at item level 123

The caps at 123 (head, hands, feet 29; body, legs 47; accessories 23; two-handed weapon 48; main stat 30 / 48 / 24 / 50) are **model output**, from the same rule that reproduces the Wiki at 475. No published source lists them. `formulas.test.js` and the smoke test (six jobs: SGE, WAR, PLD, BLM, NIN, DRG) assert them, which guards against regressions but is not independent evidence.

## 4. The worked piece: Dreadwyrm Hood of Healing

The item level 130 healer head piece has, in the game data, Mind 33, Vitality 32, Spell Speed 31, Piety 22 and Direct Hit 6. Building a head piece at 130 with Spell Speed, Piety and Direct Hit in that order reproduces all five values ([math.md, worked example](math.md#worked-example-dreadwyrm-hood-of-healing)). **Verified** (game data). Asserted in `formulas.test.js` and, through the Piece lab, in the smoke test, which also checks the synced values at cap 123 (Mind 30, Spell Speed 29).

## 5. Speed and GCD

The GCD and DoT/HoT formulas are AkhMorning's community formulas, not game files ([math.md, section 6](math.md#6-speed-gcd-and-dothot-ticks)). Their inputs, $\text{sub}$ and $\text{div}$ per level, come from the game's `ParamGrow` sheet.

| Check | Values | Source | Asserted in a test? |
| --- | --- | --- | --- |
| Level 100 examples | gear speed 22 → 2.49 s, 80 → 2.49 s | AkhMorning | Yes, `speed.test.js` |
| Level 50 tiers | 150 → 2.35 s, 202 → 2.30 s, 307 → 2.20 s, 349 → 2.16 s | **not recorded** | Yes, `speed.test.js` |
| Level 50 tiers | 0 → 2.50 s, 3 → 2.49 s | **not recorded** | No (shown by the page's tier scan only) |
| Generic maximum at cap 123 | 296 gear speed → 2.22 s at level 50 | model output | Yes, `optimizer.test.js` |

The level-50 thresholds were added to the tests without a note of where they came from, so they are regression values until someone matches them against a published tier table. The thresholds 0 and 3 follow directly from the formula (at 0 gear speed nothing is subtracted; 3 is the first value where $\lfloor 130\,g/341 \rfloor \ge 1$) but no test pins them. The 296 / 2.22 s figure is the tool's own result for full-share speed in every armor and accessory slot; it depends only on `ItemLevel` rows 123 and 475.

## 6. The optimizer against the true best

The optimizer works on real item stats, so it does not depend on the substat shares. Its checks compare it with an exhaustive search, not with outside data. In short (details and numbers in [optimizer.md, section 7](optimizer.md#7-correctness-and-performance)):

- **Tests**: 400 seeded random pools (rings with 1 and 2 copies, Unique items, tiebreaks, average item level, minimums) and 200 pools with very large tiebreak values, each compared with trying every legal loadout; constraint cases on the Warrior Dreadwyrm set against an independent brute force; regressions for the ring pruning bug and the score weights ([history.md](history.md)).
- **Real-gear probe** (run for the docs, not a committed test): 22 jobs × 35 item level windows × sync on and off × every stat as target = 9,800 runs, each against the exact optimum. The current code misses 0. The old ring rule missed 360.

**Regression values, not external truth.** The Sage Dreadwyrm "of Healing" set gives 171 Spell Speed synced to 123 and 176 unsynced (`optimizer.test.js` and the smoke test). The item stats are real, but the two totals came from the code and have not been checked in game.

## 7. Which tests assert what

| Test | Checks | Kind of expected value |
| --- | --- | --- |
| `tests/unit/validation.test.js` | Band accuracy thresholds; Wiki 475 caps; highest real item level inside the budget table | External (game data, Wiki) |
| `tests/unit/formulas.test.js` | Caps at 123 per slot; the Dreadwyrm hood from the formula; Paladin weapon mode | Hood: external (game data). Caps at 123: model output |
| `tests/unit/sync.test.js` | Clamp edge cases (at, below, one above the cap; unknown item level; no special substat; missing stats); Paladin Wiki 475 caps | Wiki rows external; edge cases are rules of the model |
| `tests/unit/speed.test.js` | AkhMorning level 100 examples; four level 50 tiers | Level 100: external. Level 50: source not recorded |
| `tests/unit/optimizer.test.js` | Dreadwyrm set 171 / 176; generic maximum 296 / 2.22 s | Regression values |
| `tests/unit/optimizer-exhaustive.test.js` | Optimizer equals exhaustive search on random pools; ring and score-weight regressions; too-large scores throw | Exhaustive search reference |
| `tests/unit/optimizer-constraints.test.js` | Minimums, maximums, average item level, truncation, empty pool, against brute force | Brute-force reference |
| `tests/unit/items.test.js` | Item browser filters, pool item mapping, copies of Unique rings | Real rows from the database |
| `tests/unit/data-format.test.js`, `provenance.test.js` | Shape of the generated data; recorded data source | Format definition |
| `tests/unit/state.test.js` | Saved page state is repaired field by field | Rules of the page |
| `tests/data/test_generators.py` | 17 generator tests on small CSV fixtures (slots, exclusions, stat placement, HQ rule, job mask, Unique flag, sort order, budget columns, level data) | Hand-built fixtures |
| `tests/e2e/smoke.py` | In the built page: caps at 123 for six jobs, Wiki 475 table, Piece lab hood values, Dreadwyrm optimizer 171 / 176, Paladin off-hand; no `undefined`/`NaN`/`null` text, no JavaScript errors, no horizontal scroll at 400 px | Same values as the unit tests |

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
| GCD and tier scan | `src/core/speed.js` (`gcdFor`, `gcdTiers`) |
| "Checked against real gear" panel | `src/ui/components/validation-panel.js` |
| Tests | `tests/unit/*.test.js`, `tests/data/test_generators.py`, `tests/e2e/smoke.py` |
