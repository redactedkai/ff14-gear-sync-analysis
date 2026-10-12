# Glossary

Final Fantasy XIV (FFXIV) terms and project terms, for readers who do not play the game. Each entry is short and links to the page that explains it in depth. Game terms describe the game as this project models it; where the model rests on an inference rather than game data, the linked page says so.

**Average item level.** The mean item level of everything a character wears, over 12 positions. A two-handed weapon counts twice (it fills the main-hand and off-hand positions); a one-handed weapon and a shield count once each. The page does not use it: Minimum IL syncs everyone to the duty's level anyway. See [math.md, section 3](mechanics/math.md#3-slot-shares).

**Branch and bound.** The search method the optimizer uses: fill one slot at a time, trying the best candidates first, and abandon a partial gear set as soon as an upper bound shows it cannot beat the best complete set found so far. The answer is exact unless the search hits its node limit. See [optimizer.md, section 5](engineering/optimizer.md#5-the-search-depth-first-branch-and-bound).

**Budget table.** The game's `ItemLevel` table: one row per item level (0 to 920), holding a stat budget for each of 12 stats. A piece's stats are fractions of the budget at its item level. In practice it holds three curves: main stat, substats and Vitality. See [math.md, section 2](mechanics/math.md#2-the-budget-table).

**Critical Hit.** A substat that raises the chance and the size of critical hits (attacks or heals that land for extra). Every job uses it.

**Determination.** A substat that raises all damage and healing by a small flat percentage. Every job uses it.

**Direct Hit.** A substat that raises the chance of a "direct hit", which adds damage. Every job has it on gear; it does nothing for healing.

**Dominance.** Within one slot, item A dominates item B when A is at least as good as B in every stat the optimizer tracks and in item level. A dominated item is removed before the search only when enough copies of better items exist to fill every slot of its kind (two for rings). See [optimizer.md, section 4](engineering/optimizer.md#4-fewer-candidates-dominance-pruning).

**DoT / HoT ticks.** Damage over time and heal over time: effects that deal damage or heal every 3 seconds for a while. The speed stat makes each tick stronger by a small multiplier. See [math.md, section 6](mechanics/math.md#6-speed-gcd-and-dothot-ticks).

**Double rounding.** A stat on a piece is rounded twice: first the slot's share of the budget, then the substat's share of that. Rounding once gives the wrong value on about a fifth of real pieces. See [math.md, section 4](mechanics/math.md#4-the-stats-on-a-piece) and [validation.md](mechanics/validation.md).

**Expansion (gear filter).** The Gear pool tab's Expansion dropdown has a checkbox per expansion (A Realm Reborn to Dawntrail, all ticked by default); unticking one hides its gear. A piece's expansion is the band its equip level falls in, since each expansion raised the level cap (50, 60, 70, 80, 90, 100); the five level-1 gift accessories go by their item level instead. **Inferred**: the game files have no expansion or patch field for items; checked against item ids, which run roughly in release order (the late ids in an old band are new jobs' weapons added to old content).

**GCD (global cooldown).** The shared recast timer of most combat actions, 2.5 seconds by default. Every point of speed shortens it slightly. See [math.md, section 6](mechanics/math.md#6-speed-gcd-and-dothot-ticks).

**GCD tier.** Because the GCD is rounded down to hundredths of a second, it changes in steps: a range of speed values all give the same GCD, and the next step starts at a specific threshold. At level 50 a new tier starts about every 10.5 points of gear speed. See [math.md, section 6](mechanics/math.md#6-speed-gcd-and-dothot-ticks).

**HQ / NQ.** High quality and normal quality. A crafted item can come out HQ, with bonus stats on top of the NQ version. The item database stores the HQ stats for every item that can be HQ and the only version of everything else. See [data-pipeline.md, section 4](engineering/data-pipeline.md#stats-and-the-hq-bonus).

**Item level.** A number on every piece of gear. It is not a strength rating in itself: it is a row number in the budget table, and the piece's stats follow from that row and its slot. Real gear goes from 1 to 795 (the project's data starts at 100). See [math.md, section 2](mechanics/math.md#2-the-budget-table).

**Item level sync, sync cap.** Some content lowers gear to a fixed item level, the sync cap. Each stat on a piece above the cap is limited to its cap: what a full-share piece of the same slot at the cap would have, except that for a stat with a factor below 100% the cap applies the factor first and can differ from such a piece by 1; pieces at or below the cap are unchanged. The owner's main case is cap 123. See [math.md, section 5](mechanics/math.md#5-item-level-sync).

**Job.** A character's combat class, such as Sage, Warrior or Black Mage. The project supports all 22 combat jobs. A job decides the main stat, the speed stat, the special substat and the weapon type. In the code, everything job-dependent is computed once per job into a *job context*. See [architecture.md, section 2](engineering/architecture.md#2-the-job-context).

**Level sync.** Content designed for a lower character level lowers the character's level to match (the page's "Synced level"). Gear whose equip level is above it is synced to the item level the game assigns to that level (`ParamGrow.ItemLevelSync`: 130 at level 50, 660 at level 90), whether or not item level sync is on; when a piece is also above the item level cap, the cap is used. The level also sets the speed formulas' per-level constants. See [math.md, section 5](mechanics/math.md#which-pieces-are-synced) and [section 6](mechanics/math.md#6-speed-gcd-and-dothot-ticks).

**Loadout.** One item per gear slot (two rings), the optimizer's answer. See [optimizer.md, section 2](engineering/optimizer.md#2-formal-statement).

**Main stat.** A job's primary damage or healing stat: Strength (tanks and Strength melee), Dexterity (Ninja, Viper, ranged physical), Intelligence (casters) or Mind (healers). Gear for one main stat is useless to jobs that use another. See [math.md, section 1](mechanics/math.md#1-terms).

**Tier (breakpoint).** A substat's effect (critical hit rate, Determination bonus, GCD, ...) moves in steps, so points between two steps do nothing. The optimizer result shows each substat's effect from gear, the points above the start of its step (spare) and the points to the next. See [materia.md, section 5](mechanics/materia.md#5-breakpoints).

**Materia, melds.** Materia are stones that can be attached ("melded") to gear to add one combat substat each, in grades I to XII. A piece has up to 5 slots; crafted gear and the old PvP sets can be **overmelded** past their guaranteed slots, and the high grades (VI, VIII, X, XII) never go past the first overmeld slot. Each substat on a piece is capped at the piece's own cap. On synced-down gear melds do not count (verified by the owner in game): a piece is synced when its item level is above the duty's cap or its equip level is above the duty's level. The gear optimizer gives each piece that is not synced its best melds (the "Melds" switch, on by default). See [materia.md](mechanics/materia.md).

**Minimum Item Level, Echo.** Party options for older content. "Minimum IL" runs a duty with everyone's gear synced to the duty's minimum item level; the Echo is a buff the game normally grants in older content, which the owner's group turns off. Together they are why the owner cares about the cap of 123.

**Piety.** The healers' special substat: faster mana regeneration. Healers only.

**Pool.** The set of items the user has chosen as candidates for the optimizer: real gear from the item database.

**Provenance.** The record of which commit of the datamining repository the game data was generated from. It is written into both generated data files and shown in the page footer. See [data-pipeline.md, section 6](engineering/data-pipeline.md#6-provenance).

**Role.** A group of jobs that share a stat profile. The project uses five: tank, healer, Strength melee, Dexterity, caster. Changing to a job in another role resets role-dependent settings and empties the pool. See [math.md, section 1](mechanics/math.md#1-terms).

**Skill Speed, Spell Speed.** The speed substat: Skill Speed for physical jobs (weaponskills), Spell Speed for casters and healers (spells). It shortens the GCD and strengthens DoT and HoT ticks. The project calls both "speed". See [math.md, section 6](mechanics/math.md#6-speed-gcd-and-dothot-ticks).

**Slot.** Where a piece is worn: weapon, off-hand (shield: Paladin, plus one White Mage shield at item level 100), head, body, hands, legs, feet, earring, necklace, bracelet, and two rings. There is no belt slot in the current game. A few pieces take two slots: a two-handed weapon leaves the off-hand empty, and the Vermilion Cloaks (body) leave the head empty.

**Slot share.** The fraction of the budget a slot gets, in thousandths: two-handed weapon 140, one-handed weapon 100, shield 40 (its stats are the two-handed value minus the one-handed value), head, hands and feet 85, body and legs 135, accessories 67. Read from the game's `BaseParam` table. See [math.md, section 3](mechanics/math.md#3-slot-shares).

**Stat factor.** A percentage the game files attach to each stat of an item, by the item's kind (`BaseParam.MeldParam`, column `Item.BaseParamModifier`): the slot value is multiplied by it, then rounded. 100% for nearly everything; 90% for Vitality on Intelligence and Mind gear, and for every main stat and Vitality on pieces that carry all four main stats. A real piece's sync cap uses its own factor, applied before the slot share (the reverse of the item's own stats; see [math.md, section 5](mechanics/math.md#the-clamp-rule)); where no item is involved the page uses the job's (Vitality 0.9 for Intelligence and Mind jobs). See [math.md, section 4](mechanics/math.md#the-stat-factor-of-an-item).

**Substat.** Any stat other than the main stat and Vitality: Critical Hit, Determination, Direct Hit, the speed stat, and for tanks and healers Tenacity or Piety. A piece carries two or three substats.

**Substat share.** The fraction of the slot budget each substat on a piece gets, by rank: 100% for the highest, 70% for the second. Older healer gear also carries Direct Hit as a fixed 20% line outside this ranking. This is a pattern measured on real items, not a value stored in the game files; with equal substats sharing a rank, it reproduces 99.9% of real pieces exactly (99.7% to 100.0% per item level band). Only the Piece stats depends on it; the optimizer uses each real item's own stats. See [math.md, section 4](mechanics/math.md#substat-shares-empirical) and [validation.md](mechanics/validation.md).

**Tenacity.** The tanks' special substat: more damage dealt and less damage taken. Tanks only.

**Unique.** An item that can be equipped only once at a time. It matters for rings: two copies of the same Unique ring cannot be worn together, while any other ring can fill both ring slots. See [optimizer.md, section 1](engineering/optimizer.md#1-the-problem).

**Vitality.** The stat that sets maximum hit points. Every piece has it. On Intelligence and Mind gear it is 90% of the slot value (rounded again), on Strength and Dexterity gear 100%: the piece's stat factor. See [math.md, section 4](mechanics/math.md#the-stat-factor-of-an-item).
