# Glossary

Final Fantasy XIV (FFXIV) terms, project terms and outside sources, for readers who do not play the game. Each term is defined once, in plain words, and links to the page that explains it. Game terms describe the game as this project models it; where the model rests on an inference rather than game data, the entry and the linked page say so. A term that only one page uses, and that page defines where it first appears, stays on that page.

## Game terms

**Accuracy.** An old substat, renamed Direct Hit in patch 4.0 (**verified**: the official patch notes). Older healer gear still carries it as a small Direct Hit line. See [validation.md, section 2](mechanics/validation.md#what-the-misses-look-like).

**Atma weapons.** One step of the Zodiac relic weapons, at item level 100. The 11 Atma weapons carry exactly the stats of the step before, Zenith, at item level 90 (**verified**, game data), so the model predicts them at 90. See [math.md, section 4](mechanics/math.md#substat-shares-empirical).

**Base class.** The starting class a job grows out of, such as Gladiator for Paladin. Gear only a base class can wear is left out of the database. See [data-pipeline.md, section 4](engineering/data-pipeline.md#job-mask).

**Crafter and gatherer gear.** Gear for the non-combat jobs, with stats such as GP, CP, Craftsmanship, Control, Gathering and Perception. The database leaves out any piece that carries one of them, even when every class can wear it. See [data-pipeline.md, section 4](engineering/data-pipeline.md#selection).

**Critical Hit.** A substat that raises the chance and the size of critical hits (attacks or heals that land for extra). Every job uses it.

**Defense, Magic Defense.** Numbers on armor and shields that reduce physical and magic damage taken by a percentage that depends on the level. The page shows a set's totals; the optimizer does not rank them. See [math.md, section 4](mechanics/math.md#weapon-damage-and-defense).

**Determination.** A substat that raises all damage and healing by a small flat percentage. Every job uses it.

**Diadem gear.** Heavensward gear from the Diadem, with random substats, that can no longer be obtained (**verified**, Console Games Wiki). The database leaves its 293 pieces out. See [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md).

**Direct Hit.** A substat that raises the chance of a "direct hit", which adds damage. Every job has it on gear; it does nothing for healing.

**DoT / HoT ticks.** Damage over time and heal over time: effects that deal damage or heal every 3 seconds for a while. The speed stat makes each tick stronger by a small multiplier. See [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers).

**Duty.** One piece of instanced content: a dungeon, trial or raid. A duty can sync the character's level, the gear's item level, or both. See [math.md, section 1](mechanics/math.md#1-terms).

**Equip level.** The character level a piece needs before it can be worn. Level sync compares it with the synced level. See [math.md, section 5](mechanics/math.md#which-pieces-are-synced).

**Expansion, level cap.** The game's major releases. Each raised the **level cap**, the highest character level: A Realm Reborn (ARR, 50), Heavensward (60), Stormblood (SB, 70), Shadowbringers (ShB, 80), Endwalker (EW, 90), Dawntrail (100). The Gear browser's Expansion dropdown has a checkbox per expansion, all ticked by default; unticking one hides its gear. A piece belongs to the expansion whose level band its equip level falls in; the five level-1 gift accessories go by their item level instead. **Inferred**: the game files have no expansion or patch field for items; checked against item ids, which run roughly in release order (the late ids in an old band are new jobs' weapons added to old content).

**Field operations (Field Op).** Large open zones with their own gear and relic grind: Eureka (Stormblood), Bozja (Shadowbringers) and the Occult Crescent (Dawntrail). See [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md#field-op-gear).

**Food.** A meal that raises one or two substats (and Vitality) for 30 minutes, by a percentage of the stat up to a maximum. The tool counts HQ meals only and picks the one that best serves the goal; the result's Food menu lists every meal the job can use, to pick another. Without a target GCD, food never changes which gear the optimizer picks; with one, the meal's speed counts toward the GCD, so meal and gear are chosen together. See [math.md, section 6](mechanics/math.md#food).

**GCD (global cooldown).** The shared recast timer of most combat actions, 2.5 seconds by default. Every point of speed shortens it slightly. See [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers).

**Haste.** A percentage that shortens the GCD on top of speed. The target GCD counts only haste that is up all fight: Monk, Ninja, Samurai and Viper, by level. Short buffs are not counted. See [math.md, section 6](mechanics/math.md#haste).

**GCD tier.** Because the GCD is rounded down to hundredths of a second, it changes in steps: a range of speed values all give the same GCD, and the next step starts at a specific threshold. At level 50 a new tier starts about every 10.5 points of gear speed. See [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers).

**HQ / NQ.** High quality and normal quality. A crafted item can come out HQ, with bonus stats on top of the NQ version. The item database stores the HQ stats for every item that can be HQ and the only version of everything else. See [data-pipeline.md, section 4](engineering/data-pipeline.md#stats-and-the-hq-bonus).

**Item level.** A number on every piece of gear. It is not a strength rating in itself: it is a row number in the budget table, and the piece's stats follow from that row and its slot. Real gear goes from 1 to 795 (the project's data starts at 100). See [math.md, section 2](mechanics/math.md#2-the-budget-table).

**Item level sync, sync cap.** Some content lowers gear to a fixed item level, the **sync cap**. Each stat on a piece above the cap is cut to that stat's cap; pieces at or below the cap are unchanged. For substats the cap is what a full-share piece of the same slot at the cap carries (**verified**: the Wiki's caps at item level 475); for a stat with a factor below 100% it can differ by 1 (**verified** by three second-hand in-game values; **inferred** in general). That the main stat and Vitality are clamped the same way is **inferred**. The owner's main case is cap 123. See [math.md, section 5](mechanics/math.md#5-item-level-sync); the evidence is in [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures).

**Job.** A character's combat class, such as Sage, Warrior or Black Mage. The project supports all 23 combat jobs. A job decides the main stat, the speed stat, the special substat and the weapon type. See [math.md, section 1](mechanics/math.md#1-terms).

**Level sync.** Content designed for a lower character level lowers the character's level to match (the page's "Synced level"). Gear whose equip level is above it is synced to the item level the game assigns to that level (for example 130 at level 50), whether or not item level sync is on (**verified**). When a piece is also above the item level cap, the cap is used (**second-hand**). The level also sets the speed formulas' per-level constants. See [math.md, section 5](mechanics/math.md#which-pieces-are-synced) and [section 6](mechanics/math.md#6-speed-and-substat-tiers).

**Limited job.** A job with its own level cap below the game's 100: Blue Mage (80) and Beastmaster (50) (**verified**, Lodestone patch notes). It cannot wear gear with a higher equip level, so the page hides that gear and caps the synced level there. See [math.md, section 1](mechanics/math.md#1-terms).

**Main Attribute, Secondary Attribute.** Generic stats that 16 pieces carry instead of a named main stat (the pre-order earrings, the Occult accessories, Neophyte's Ring). The wearer gets Main Attribute as its own main stat, and Secondary Attribute as Piety (healers), Tenacity (tanks) or Direct Hit (everyone else). That mapping is xivgear's, backed by in-game values for a healer and a Ninja. For tanks, Main Attribute → Strength is **verified** (the patch 5.0 notes changed it from Vitality, and `ClassJob.PrimaryStat` agrees; [validation.md, section 9](mechanics/validation.md#9-against-another-tool-ffxiv-gearing)); Secondary Attribute → Tenacity is **inferred**. See [data-pipeline.md, section 3](engineering/data-pipeline.md#3-the-shared-format-definition).

**Main stat.** A job's primary damage or healing stat: Strength (tanks and Strength melee), Dexterity (Ninja, Viper, ranged physical), Intelligence (casters) or Mind (healers). Gear for one main stat is useless to jobs that use another. See [math.md, section 1](mechanics/math.md#1-terms).

**Materia, melds.** Materia are stones that can be attached ("melded") to gear to add one combat substat each, in grades I to XII. A piece has up to 5 slots; crafted gear and the old PvP sets can be **overmelded** past their guaranteed slots, and the high grades (VI, VIII, X, XII) never go past the first overmeld slot. Each substat on a piece is capped at the piece's own cap. On synced-down gear melds do not count (**verified** by the owner in game). The gear optimizer gives each piece that is not synced its best melds (the "Materia" switch, on by default). See [materia.md](mechanics/materia.md).

**Minimum Item Level, Echo.** Party options for older content. "Minimum IL" runs a duty with everyone's gear synced to the duty's minimum item level, and their level synced too, even in an unrestricted party (**verified**: patch 3.0 notes); the Echo is a buff the game normally grants in older content, which the owner's group turns off. Together they are why the owner cares about the cap of 123. See [math.md, section 1](mechanics/math.md#1-terms).

**Patch.** A game update, numbered like 4.0 or 7.56; the first digit is the expansion. The game data is tied to a patch through its datamining commit. See [data-pipeline.md, section 6](engineering/data-pipeline.md#6-provenance).

**Piety.** The healers' special substat: faster mana regeneration. Healers only.

**PvP gear.** Player-versus-player sets, item level 100 to 205, sold for Wolf Marks (PvP's currency). Outside PvP they have normal stats (**verified** on the Lodestone at patch 7.56). See [data-pipeline.md, section 4](engineering/data-pipeline.md#sources).

**Rarity.** An item's colour in game: white, green, blue or purple (`Item.Rarity` 1 to 4). Only the accuracy check uses it, for one group of green healer pieces. See [data-pipeline.md, section 4](engineering/data-pipeline.md#rarity).

**Relic weapon.** A weapon upgraded in steps through a long grind, one line per expansion (Zodiac, Anima, Eureka, Resistance, Manderville, Phantom). Some steps carry two full substats. See [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md#relic-weapon-steps-by-code).

**Role.** A group of jobs that share a stat profile. The project uses five: tank, healer, Strength melee, Dexterity, caster. See [math.md, section 1](mechanics/math.md#1-terms).

**Roulette.** A queue that picks a random duty of one type. These pages use it as the example of a level-synced duty with no item level cap. See [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures).

**Savage.** The hard version of an eight-player raid tier, with its own gear. Normal and Savage gear share one source code in the game files; the generator tells them apart by dye slots and shop currency. See [subcategory-sort-codes.md](engineering/subcategory-sort-codes.md#savage-versus-normal-code-20).

**Skill Speed, Spell Speed.** The speed substat: Skill Speed for physical jobs (weaponskills), Spell Speed for casters and healers (spells). It shortens the GCD and strengthens DoT and HoT ticks. The project calls both "speed". See [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers).

**Slot.** Where a piece is worn: weapon, off-hand (shield: Paladin and Beastmaster, plus one White Mage shield at item level 100), head, body, hands, legs, feet, earring, necklace, bracelet, and two rings. There is no belt slot in the current game. A few pieces take two slots: a two-handed weapon leaves the off-hand empty, and the two Vermilion Cloaks (body) leave the head empty. See [math.md, section 3](mechanics/math.md#3-slot-shares).

**Substat.** Any stat other than the main stat and Vitality: Critical Hit, Determination, Direct Hit, the speed stat, and for tanks and healers Tenacity or Piety. Most pieces carry two. Old Mind-only healer gear can carry a third (Direct Hit), and eight early relic healer weapons carry only one. See [math.md, section 4](mechanics/math.md#substat-shares-empirical).

**T13.** The Final Coil of Bahamut – Turn 4, a level 50 raid with a minimum item level of 123 ([Console Games Wiki](https://ffxiv.consolegameswiki.com/wiki/The_Final_Coil_of_Bahamut)). With Minimum Item Level it runs at level 50 and cap 123, the owner's main case. See [math.md, section 1](mechanics/math.md#1-terms).

**Tenacity.** The tanks' special substat: more damage dealt and less damage taken. Tanks only.

**Tomestones.** Allagan Tomestones: currencies (Poetics and others) that exchange shops take for gear. Which tomestones are current changes with patches, and retired shops can stay in the game files. See [data-pipeline.md, section 4](engineering/data-pipeline.md#sources).

**Ultimate.** The hardest raid duties. Their weapons are bought with a totem from the duty; the generator finds them by the seven totems (136 weapons). See [data-pipeline.md, section 4](engineering/data-pipeline.md#sources).

**Unique.** An item that can be equipped only once at a time. It matters for rings: two copies of the same Unique ring cannot be worn together, while any other ring can fill both ring slots. See [optimizer.md, section 1](engineering/optimizer.md#1-the-problem).

**Vitality.** The stat that sets maximum hit points. Every piece has it. On Intelligence and Mind gear it is 90% of the slot value (rounded again), on Strength and Dexterity gear 100%; pieces with all four main stats also have 90%. This is the piece's stat factor. See [math.md, section 4](mechanics/math.md#the-stat-factor-of-an-item).

**Weapon damage.** A number on every main-hand weapon, physical for Strength and Dexterity jobs and magic for Intelligence and Mind jobs, that multiplies nearly all of the job's damage (Blue Mage's spells use Intelligence instead). It follows the weapon's item level. The optimizer ranks it before the goal. See [math.md, section 4](mechanics/math.md#weapon-damage-and-defense).

## Project terms

**Band reach.** Under a speed band with other minimums: a table of the most of a held stat the remaining slots can add while speed still lands in the band. A partial gear set that cannot reach the minimum even so is dropped. Exact. See [optimizer.md, section 5](engineering/optimizer.md#with-minimums-on-other-stats).

**Branch and bound.** The search method the optimizer uses: fill one slot at a time (shortest candidate list first, slots a piece can leave empty last), trying the best candidates first, and abandon a partial gear set as soon as an upper bound shows it cannot beat the best complete set found so far. The answer is exact unless the search hits its node limit. See [optimizer.md, section 5](engineering/optimizer.md#5-the-search-depth-first-branch-and-bound).

**Brute-force reference.** The tests' independent check of the optimizer: it tries every legal loadout of a small pool and keeps the best. It uses the optimizer's own synced stats, so it checks the search, not the sync clamp. See [testing.md, section 2.1](engineering/testing.md#21-the-brute-force-reference-and-the-real-gear-pools).

**Budget table.** The game's `ItemLevel` sheet: one row per item level (0 to 920), holding a stat budget for each of 12 stats. A piece's stats are fractions of the budget at its item level. In practice it holds three curves: main stat, substats and Vitality. See [math.md, section 2](mechanics/math.md#2-the-budget-table).

**Candidate.** A pool item that is still in its slot's list after dominance pruning, and so enters the search. With a speed range or a stat minimum (Target GCD, tier ranking) and melds on, a piece can enter as several candidates, one per kept meld version. See [optimizer.md, sections 4 and 6](engineering/optimizer.md#4-fewer-candidates-dominance-pruning).

**Dominance.** Within one slot, item A beats item B when A has at least as much of every stat of the job (not only the target and tiebreaks) and leaves no slot empty that B does not. B is removed before the search only when the items beating it have enough copies to fill every slot of its kind (two for rings). See [optimizer.md, section 4](engineering/optimizer.md#4-fewer-candidates-dominance-pruning).

**Double rounding.** A stat on a piece is rounded twice: first the slot's share of the budget, then the substat's share of that. Rounding once gives the wrong value on about a fifth of real pieces. See [math.md, section 4](mechanics/math.md#the-formula) and [validation.md](mechanics/validation.md).

**Effective stats.** The stats the optimizer uses for a piece: synced when sync applies to it, its own otherwise. See [optimizer.md, section 1](engineering/optimizer.md#1-the-problem).

**Evidence labels.** The words every page uses for the status of a claim: **verified**, **inferred**, **assumed**, **second-hand**, plus **owner's decision** for a modelling choice. Their meanings are in [STYLE.md](diagrams/STYLE.md#status-words).

**External truth, independent derivation, regression value.** The kinds of expected value in the tests: a number from outside the code (game data, the Wiki, AkhMorning); a number the test computes itself from raw game data; a number the code once produced, pinned so it cannot change silently. See [validation.md, section 1](mechanics/validation.md#1-sources-of-truth).

**F1, F3.** Labels from an engineering audit for two optimizer bugs, both fixed and covered by regression tests. F1: dominance pruning could drop the second-best ring. F3: fixed score weights let a large tiebreak outrank the target. See [history.md](history.md#results-of-the-tool).

**Gear from, route, market board switch.** The filter in Gear to search and the Gear browser that leaves gear out by what a player does to get it: 20 boxes (Quests & story, Crafted, Normal duties, Hunts, Savage (Current) ...) and a market board switch. A piece's **routes** are its ways to get it, each needing every box in it; a piece is listed when one route needs only ticked boxes, or, with the switch on, when it is tradeable. See [data-pipeline.md, section 4](engineering/data-pipeline.md#sources) and [optimizer.md, section 7](engineering/optimizer.md#7-the-pages-pool-and-its-filters).

**Generated piece, hand-made piece.** A pool piece built by the formula rather than read from the database. It has no equip level, so only the item level cap syncs it. Old saves drop the hypothetical and hand-entered pieces of the removed Advanced section ([testing.md, section 2](engineering/testing.md#2-what-each-file-covers)). See [math.md, section 5](mechanics/math.md#which-pieces-are-synced).

**Generic maximum.** The most speed gear can give under cap 123 with full-share speed in every armor and accessory slot: 296, a 2.22 s GCD at level 50 (344 and 2.17 s with the weapon). It is derived from budget row 123, since no gear exists at item level 123. See [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers).

**Job context.** Everything job-dependent (stat mapping, weapon mode, active slots, the job's Vitality factor), computed once per job into a frozen object that every core function takes as its first argument. See [architecture.md, section 2](engineering/architecture.md#2-the-job-context).

**Job mask.** A number in each database row with one bit per combat job that can wear the piece. See [data-pipeline.md, section 4](engineering/data-pipeline.md#job-mask).

**Lexicographic order.** Ranking by the target first, then tiebreak 1, then tiebreak 2: a lower key only decides between loadouts that are equal on every higher one. The optimizer packs it into one integer score per item. See [optimizer.md, section 3](engineering/optimizer.md#3-turning-the-lexicographic-order-into-one-number).

**Loadout.** One item per gear slot (two rings), the optimizer's answer. See [optimizer.md, section 2](engineering/optimizer.md#2-formal-statement).

**Node limit, truncated.** The search counts the nodes it visits and stops at a limit (700,000 for the page's main result). A result cut off there is marked truncated and may not be the best. See [optimizer.md, section 5](engineering/optimizer.md#5-the-search-depth-first-branch-and-bound).

**Owner.** The repository's owner. "Verified by the owner in game" means the owner checked it in game; it counts as verified.

**Pareto front.** In tier ranking's searches: the partial gear sets, built from the last slot back, that no other partial set beats on score and every held stat. The best full set meeting every limit is always in the last front, so no search tree is needed. See [tier-ranking.md, section 5](engineering/tier-ranking.md#5-pareto-fronts).

**Pool.** The items the optimizer chooses from. On the page it is every piece the job can wear from the item database, that passes the filters under Gear to search (expansions, equip level, item level range, Gear from); the user no longer picks it (a Gear pool tab did that until 2026-10-15). See [optimizer.md, section 1](engineering/optimizer.md#1-the-problem) and [architecture.md, section 3](engineering/architecture.md#3-the-ui-pattern).

**Probe.** A one-off measurement run for the docs, not a committed test (for example the 9,800-run real-gear probe). `npm test` does not re-check its numbers. See [optimizer.md, section 8](engineering/optimizer.md#8-correctness-and-performance).

**Provenance.** The record of which commit of the datamining repository the game data was generated from. It is written into both generated data files and shown in the page footer. See [data-pipeline.md, section 6](engineering/data-pipeline.md#6-provenance).

**Regain cut.** In tier ranking: a limit an earlier stage's proven most of its key puts on a later search. Each piece's regain is how much of that key a swap for a comparable piece could add; their sum may not pass the most minus the key's hold, which every gear set the later search can return meets. Exact. See [tier-ranking.md, section 4.4](engineering/tier-ranking.md#44-regain-cuts-from-the-stages-before).

**Reduced-cost fixing.** Dropping a candidate before the search because no gear set holding it can beat a set already in hand, shown with a bound that prices every limit (a Lagrangian bound). Exact. See [tier-ranking.md, section 4.2](engineering/tier-ranking.md#42-pruning-against-the-set-in-hand).

**Seed.** A gear set that already meets every limit of a search, given to it as a start: the search then only looks for a better one. Tier ranking passes each stage the stage before's set. See [tier-ranking.md, section 2](engineering/tier-ranking.md#2-the-stages).

**Shortfall filter (deficit budget).** Dropping every candidate that falls so far below its slot's best of a held stat that no set holding it can reach the minimum. The budget is how far a whole set may fall short of the best in every slot. See [tier-ranking.md, section 4.1](engineering/tier-ranking.md#41-the-shortfall-filter).

**Sheet.** One of the game's internal data tables, exported as one CSV file: for example `Item` (one row per item), `ItemLevel` (the budget table), `BaseParam` (slot shares and stat factors) and `ParamGrow` (per-level data). See [data-pipeline.md, section 1](engineering/data-pipeline.md#1-source).

**Slot code.** The number, 0 to 14, that names a piece's slot type in the database; 12 is a body piece that also covers the head, 13 legs that also cover the feet, 14 a body that covers the hands, legs and feet. See [data-pipeline.md, section 4](engineering/data-pipeline.md#slot).

**Slot share.** The fraction of the budget a slot gets, in thousandths, for example 135 for body and legs. Read from the game's `BaseParam` sheet (**verified**). A shield's stats are not computed from its own share: they are the two-handed value minus the one-handed value (**inferred**). See [math.md, section 3](mechanics/math.md#3-slot-shares).

**Smoke test.** The browser test of the built page (`npm run smoke`): known numbers on screen, no JavaScript errors, no stray "undefined", "NaN" or "null" text, no sideways scroll at 960 px. See [testing.md, section 2](engineering/testing.md#smoke-test).

**Speed range.** An optional minimum and maximum for the speed stat in the optimizer engine, set from a target GCD. See [optimizer.md, section 2](engineering/optimizer.md#2-formal-statement).

**Stat factor.** A percentage the game files attach to each stat of an item, chosen by the item's **kind** (`Item.BaseParamModifier`, 0 to 12, a column of `BaseParam.MeldParam`). An item's own stat is its slot value times the factor, rounded. It is 100% for nearly everything; 90% for Vitality on Intelligence and Mind gear, and for every main stat and Vitality on pieces with all four main stats (**verified**, game files). Sync caps apply the factor in the other order, before the slot share (**verified** by three second-hand in-game values; **inferred** in general), and use the piece's own factor (**inferred**). Where no item is involved, the page uses the job's factor. See [math.md, section 4](mechanics/math.md#the-stat-factor-of-an-item) and [section 5](mechanics/math.md#the-clamp-rule).

**Store, view.** The page's UI pattern: one shared store holds the settings and the current job context; each page area derives a frozen view from it, and the template only displays the view. See [architecture.md, section 3](engineering/architecture.md#3-the-ui-pattern).

**Substat share.** The fraction of the slot budget each substat on a piece gets, by rank: 100% for the highest, 70% for the second. Older healer gear also carries Direct Hit as a fixed 20% line outside this ranking. This is a pattern measured on real items, not a value stored in the game files (**inferred**); it reproduces 99.9% of real pieces exactly. Only Piece stats depends on it; the optimizer uses each real item's own stats. See [math.md, section 4](mechanics/math.md#substat-shares-empirical) and [validation.md](mechanics/validation.md).

**Stat minimum.** A lower limit on a stat's total that the optimizer must meet, on any stat (the speed range is the speed case). Tier ranking holds each ranked stat with one. See [optimizer.md, section 5](engineering/optimizer.md#with-minimums-on-other-stats).

**Tabs.** The page has two working tabs, **Gear optimizer** (opened by default) and **Gear browser** (looking gear up), and a reference tab, **How the math works**, with three sub-tabs: **Piece stats** (one piece before and after sync, and the same slot at every item level against a melded piece at the cap; under "Each stat, step by step", each stat as the lower of the piece's own value and its ceiling, the same slot at the synced item level, with the slot shares of the budget) **GCD** (a full set's GCD by item level against the melded set at the cap) and **Substat tiers** (every substat's tiers around a value, as on the character panel: From, the effects, spare and to next; values from the optimizer result or typed). On Piece stats and GCD a "?" button opens "How sync works"; on Substat tiers each substat has its own "?". The Sync limits sub-tab was removed on 2026-10-16. See the [root README](../README.md).

**Target GCD.** A GCD the optimizer must reach, "exactly" or "or faster", counted with food and haste. It becomes a speed range, and the best set by the goal within it wins. On the page it is a box under the Goal grid, empty by default. See [math.md, section 6](mechanics/math.md#target-gcd) and [optimizer.md, section 2](engineering/optimizer.md#2-formal-statement).

**Target, tiebreak.** The optimizer's objective: the stat to maximize (the target), then up to two stats that decide between loadouts with the same target total. See [optimizer.md, section 1](engineering/optimizer.md#1-the-problem).

**Tier ranking.** Ranking gear sets by the tiers of the target and tiebreaks, in order, then by their raw totals, with each ranked stat held one point above the start of its best tier (roadmap A7; the page's Rank by tier switch, on by default). See [tier-ranking.md](engineering/tier-ranking.md).

**Tier (breakpoint).** A substat's effect (critical hit rate, Determination bonus, GCD, ...) moves in steps, so points between two steps do nothing. The optimizer result shows each substat's effect from gear, the points above the start of its step (spare) and the points to the next. See [math.md, section 6](mechanics/math.md#substat-tiers-breakpoints).

**Trial search.** In a search with a seed: the branch and bound run first for at most 20,000 nodes. Most tier ranking searches end there; only the others build Pareto fronts. Not the same as a probe (a measurement). See [tier-ranking.md, section 5](engineering/tier-ranking.md#5-pareto-fronts).

## Outside sources

**AkhMorning.** A community site on FFXIV stat math. The tool's GCD and DoT/HoT formulas are AkhMorning's, and its published tier tables supply test values: a community reference, not game files. See [validation.md, section 5](mechanics/validation.md#5-speed-and-gcd).

**FFXIV Wiki, Console Games Wiki.** Community wikis. "The Wiki" in these pages means the FFXIV Wiki's Item Level Sync page, whose substat caps at item level 475 the model reproduces ([validation.md, section 3](mechanics/validation.md#3-published-sync-caps-at-item-level-475)). The Console Games Wiki is also used to check gear sources and retired gear.

**Garland Tools, Gamer Escape, Teamcraft.** Community item databases and wikis, used for spot checks (dungeon loot, old item stats, ultimate totems). See [data-pipeline.md, section 4](engineering/data-pipeline.md#sources).

**Lodestone.** Square Enix's official site. Its item pages list shops and recipes, so it is used to spot-check gear sources and materia gates; it shows only the shops active today. See [data-pipeline.md, section 10](engineering/data-pipeline.md#10-how-the-pipeline-is-tested).

**The Balance.** A community job-guide site. Its gearing thresholds support the lower-substat clamp. See [validation.md, section 8](mechanics/validation.md#8-open-question-in-game-captures).

**xivapi/ffxiv-datamining.** The public repository of the game client's data sheets as CSV files, the project's only data source. See [data-pipeline.md, section 1](engineering/data-pipeline.md#1-source).

**xivgear.** A community gear planner with public source code. These pages compare its rules with the model (shield caps, cap order, melds) and quote in-game values from its tests, which makes them second-hand. Agreement with xivgear is not in-game evidence. See [validation.md, section 1](mechanics/validation.md#1-sources-of-truth).
