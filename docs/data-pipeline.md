# Data pipeline

How game data gets from the game client into the page. This page covers where the data comes from, which rules turn it into the two data tables the page uses, and how to refresh it after a game patch. How the numbers are then used is in [math.md](math.md) (stat budgets, sync caps, speed) and [optimizer.md](optimizer.md) (gear search).

![Flow from the game client through the datamining repository, a sparse clone of seven CSV files plus the job icons, two generators that share one format definition, the item level data and item database, the esbuild page bundle, and finally the browser](diagrams/data-flow.svg)

Every count on this page was produced by running the generators' rules over the CSVs in the local clone, or by importing the generated tables in Node. They describe datamining commit `d9582a6` (30 September 2026).

## 1. Source

The data comes from [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining), a public repository of the game client's data sheets saved as CSV files. A *sheet* is one of the game's internal data tables, for example `Item` (one row per item). The files are exported straight from the client, by XIVData Oxidizer since January 2026 and by SaintCoinach before that. The miners do not compute or derive anything: a row in a CSV is a row in the game's own data. **Verified**: the repository's own commit history shows the exporter change (commit `d3eb86d`, 4 January 2026, "Migrate to XIVData Oxidizer").

The project fetches twelve sheets (English column names, `csv/en/`). Ten supply data to the generators; `ClassJob` only tells the fetch step which icon belongs to which job (section 2); from `BaseParam` the generators copy the stat factor table (section 5) and only check the slot percentages: those are kept in the shared format definition (section 3), and the generator stops if `BaseParam` disagrees with them.

| Sheet | Read by | What it contributes |
| --- | --- | --- |
| `Item` | item database generator | One row per item: name, equip slot category, item level, equip level, job category, up to six stat id and value pairs, up to six HQ bonus pairs, `CanBeHq`, `IsUnique`, `BaseParamModifier` (the item's kind, a column of the stat factor table), `MateriaSlotCount` and `IsAdvancedMeldingPermitted` (materia slots). 52,801 rows. |
| `Materia` | item database generator (materia table) | One row per stat: the materia item of each grade (`Item[0]` to `Item[15]`), what it adds (`Value[0]` to `Value[15]`) and the stat (`BaseParam`). 1,417 rows, ids 0 to 1416. |
| `MateriaGrade` | item database generator (materia table) | One row per grade (I to XII): the overmeld success rates, `OvermeldNQPercent[0]` to `[3]` for the four overmeld slots. 12 rows. |
| `EquipSlotCategory` | item database generator | Which gear slots an item occupies (1) or blocks (−1). 25 rows. |
| `ClassJobCategory` | item database generator | Which classes and jobs may equip an item (`True`/`False` per job). 206 rows. |
| `ItemLevel` | item level generator | The stat budget of every stat at every item level. 921 rows, ids 0 to 920. |
| `ParamGrow` | item level generator | Per character level data, including the speed constants. Rows 0 to 201; levels 1 to 100 are used. |
| `Recipe` | item database generator (sources) | One row per recipe; `ItemResult` is the item it makes. 14,909 rows. |
| `SpecialShop` | item database generator (sources) | Exchange shops: up to 60 listings each, with what a listing gives (`Item`) and costs (`ItemCost`), and the shop's `UseCurrencyType`. 1,489 rows. |
| `TomestonesItem` | item database generator (sources) | The tomestone currencies and which are current (`Tomestones` 1 to 4). 24 rows. |
| `ClassJob` | fetch step (job icons) | One row per class and job with its abbreviation (`PLD`, `SGE`, ...); the row number picks the job's icon. |
| `BaseParam` | item level generator (slot shares checked, stat factors copied); item database generator (item kinds checked) | One row per stat, including the share of the budget each slot gets (two-handed weapon 140, one-handed 100, off-hand 40, head/hands/feet 85, body/legs 135, accessories 67, in thousandths) and the stat factor per item kind (`MeldParam[0]` to `MeldParam[12]`, in percent). |

**Verified on every regeneration**: for all 14 stats the project uses, the item level generator reads the stat's `BaseParam` row and compares each slot column with the percentage the page uses. Any difference, a missing column or a missing stat row stops it with an error that lists every mismatch (for example `mind RingPercent = 70, page uses 67`). With the current data all 12 rows match. The `BaseParam` columns are `TwoHandWeaponPercent`, `OneHandWeaponPercent`, `OffHandPercent`, `HeadPercent`, `ChestPercent`, `HandsPercent`, `LegsPercent`, `FeetPercent`, `EarringPercent`, `NecklacePercent`, `BraceletPercent` and `RingPercent`. The sheet has more columns for gear that covers several slots (for example `ChestHeadPercent` = 220); the project leaves that gear out (section 4), so they are not checked. See [math.md](math.md) for how the percentages are used.

**Column checks.** Before using a sheet, each generator checks that every column it reads is in the sheet's header, and stops with an error naming the sheet and each missing column. That covers every job of the shared format in `ClassJobCategory`, every stat column in `ItemLevel`, every slot column (plus `MainHand` and `OffHand`) in `EquipSlotCategory`, the `Item` columns listed in the table above (the 24 stat pair columns, `CanBeHq`, `IsUnique`, `LevelItem`, `LevelEquip`, `ClassJobCategory`, `EquipSlotCategory`, `Name`, `BaseParamModifier`, `MateriaSlotCount`, `IsAdvancedMeldingPermitted`), the `Materia` and `MateriaGrade` columns of the materia table (section 4), the 13 `MeldParam` columns of `BaseParam` and the three `ParamGrow` columns. A stat factor that is not a whole percent from 1 to 100, or an item kind with no `MeldParam` column, also stops the generators. The item database generator also stops if any job ends up with no item at all, which catches a change in how the job columns are written (for example `1` instead of `True`). An error exits with status 1 and writes no file, so the full regeneration stops too.

## 2. Fetching

The fetch step makes a **sparse, shallow, blobless** clone of the datamining repository into `data/ffxiv-datamining/` (gitignored):

- *shallow*: only the latest commit, no history;
- *sparse*: only the twelve `csv/en/<Sheet>.csv` paths are checked out;
- *blobless*: file contents are downloaded only for those paths.

For the current data that is about 7 MB of git data and 20 MB of CSV files on disk, mostly `Item.csv`, instead of the whole repository. Running the fetch again when the clone exists does a fast-forward pull, which picks up whatever the miners published since. The step fails if any of the twelve files is missing afterwards. A clone made before a sheet was added picks it up on the next fetch, because the sparse path list is set on every run; to add a sheet without moving to a newer commit, set the same path list in the clone by hand instead of fetching.

### Job icons

The job picker shows the game's framed, role-coloured job icons. The CSVs hold no images, so the fetch step downloads them from xivapi's asset endpoint, which converts the game's own icon textures to PNG, into `data/icons/<JOB>.png` (gitignored). Each job's icon number is $62100 + r$, where $r$ is the job's row in `ClassJob` (Paladin, row 19, is icon 062119). **Verified** by looking at all 22 icons; the rule itself is a numbering pattern of the game's icon files, not a column in any sheet. The high-resolution versions (64 × 64 pixels) are used.

The icon generator embeds the 22 PNG files in `src/data/job-icons.js` as data URLs, so the page still makes no image requests. It stops with an error if a job's icon is missing or is not a 64 × 64 PNG. FINAL FANTASY XIV icons © SQUARE ENIX; the page footer says so.

## 3. The shared format definition

The generators are written in Python; the page is JavaScript. Both have to agree on what the numbers in a generated row mean. That agreement lives in one JSON file that both sides read, so they cannot drift apart. It defines three orders:

**Job order.** The 22 combat jobs, in this order (bit index $i$ in parentheses):

PLD (0), WAR (1), DRK (2), GNB (3), WHM (4), SCH (5), AST (6), SGE (7), MNK (8), DRG (9), SAM (10), RPR (11), NIN (12), VPR (13), BRD (14), MCH (15), DNC (16), BLM (17), SMN (18), RDM (19), PCT (20), BLU (21).

**Stat order.** The 14 stats stored per item, each with its column in the `ItemLevel` sheet and its row id in `BaseParam` (the id the `Item` sheet uses to name a stat):

| Position | Stat | `ItemLevel` column | `BaseParam` id |
| --- | --- | --- | --- |
| 0 | Strength | Strength | 1 |
| 1 | Dexterity | Dexterity | 2 |
| 2 | Intelligence | Intelligence | 4 |
| 3 | Mind | Mind | 5 |
| 4 | Vitality | Vitality | 3 |
| 5 | Piety | Piety | 6 |
| 6 | Tenacity | Tenacity | 19 |
| 7 | Direct Hit Rate | DirectHitRate | 22 |
| 8 | Critical Hit | CriticalHit | 27 |
| 9 | Determination | Determination | 44 |
| 10 | Skill Speed | SkillSpeed | 45 |
| 11 | Spell Speed | SpellSpeed | 46 |
| 12 | Main Attribute | Strength | 55 |
| 13 | Secondary Attribute | DirectHitRate | 56 |

- **Main Attribute and Secondary Attribute** are generic stats on 16 pieces (the pre-order earrings, the Occult accessories, Neophyte's Ring). The wearer gets Main Attribute as its own main stat, and Secondary Attribute as Piety (healers), Tenacity (tanks) or Direct Hit (everyone else). That mapping is xivgear's, with in-game values for a healer and a Ninja in its tests; the tank case is inferred.
- They have no `ItemLevel` column, so they borrow the main-stat and Direct Hit columns. The four main-stat columns are equal at every item level (verified), and Direct Hit equals the common substat column.

**Slot codes.** Each code names a slot type and the `EquipSlotCategory` column that identifies it. Each slot also carries its share of the budget (`percent`, in thousandths) and the `BaseParam` column that holds it; the page reads its slot shares from here, and the item level generator checks them against `BaseParam` (section 1).

| Code | Slot | Column | Code | Slot | Column |
| --- | --- | --- | --- | --- | --- |
| 0 | two-handed weapon | MainHand (off-hand blocked) | 6 | legs | Legs |
| 1 | one-handed weapon | MainHand (off-hand free) | 7 | feet | Feet |
| 2 | off-hand (shield) | OffHand | 8 | earring | Ears |
| 3 | head | Head | 9 | necklace | Neck |
| 4 | body | Body | 10 | bracelet | Wrists |
| 5 | hands | Gloves | 11 | ring | FingerL |

Belts (`Waist`) and soul crystals have no slot code, so items in those slots are dropped.

**Stat factor.** The file also names where the stat factor comes from: the `Item` column that gives an item's kind (`BaseParamModifier`), the `BaseParam` columns that hold one percentage per kind (`MeldParam`) and how many there are (13). It is a separate entry at the end of the file, so it does not depend on the stat order.

**Materia.** A separate entry names the `Item` columns of the two meld fields (`MateriaSlotCount`, `IsAdvancedMeldingPermitted`), the most guaranteed slots a piece may have (5), the positions of the two fields in a row (10 and 11), and where the materia table comes from: the `Materia` sheet and its columns, the number of grades (12), the seven combat substats whose rows are read (Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed), the `Item` column that gives each grade's item level gate (`LevelItem`) and the `MateriaGrade` column that marks the high grades (`OvermeldNQPercent[1]`).

Changing any order in this file changes the meaning of the already generated item database, so the data must be regenerated afterwards. A unit test checks that the page's job list, stat order, slot table and slot shares are exactly the ones in the file.

## 4. Item database generation

![Worked example with Void Ark Helm of Fending, a tank head piece: each Item sheet column maps to a database field. Equip slot category 3 becomes slot code 3 (head); item level 200 is kept; job category 59 becomes job mask 15 (bits 0 to 3, PLD WAR DRK GNB); four stat id and value pairs (Strength 46, Vitality 45, Skill Speed 50, Determination 35) are placed into 12 stat positions by id; the HQ bonus is skipped because the item cannot be high quality; IsUnique becomes 1](diagrams/data-item-row.svg)

### Selection

An `Item` row becomes a database row when all of these hold:

1. it has a name;
2. its equip slot category resolves to one of the 12 slot codes (below), which rules out belts, soul crystals and non-gear;
3. its item level is at least 100;
4. at least one of the 22 combat jobs may equip it (job mask $> 0$), which rules out crafter and gatherer gear and gear only a base class (for example Gladiator) can wear;
5. at least one of its 14 stats is non-zero after the HQ rule below;
6. it carries no crafter or gatherer stat (GP, CP, Craftsmanship, Control, Gathering, Perception), normal or HQ: such a piece is crafter or gatherer gear even when "All Classes" can wear it. The stats are listed by `BaseParam` row id in `item-format.json` (`crafterGathererParams`), and the generator stops if one of those rows carries another name. Today this leaves out five item level 150 "All Classes" gatherer pieces (Serpentskin, Chimerical Felt) with Gathering, Perception and a small Vitality, which the formula could not predict because crafter and gatherer Vitality follows no share of the combat budget;
7. it is not retired: the Heavensward Diadem gear (category diadem, code 250) can no longer be obtained, so it is left out (**verified** on the Console Games Wiki, [subcategory-sort-codes.md](subcategory-sort-codes.md)). The generator prints how many pieces each of these two rules left out.

For the current data, each rule leaves:

| Step | Rows left |
| --- | --- |
| all `Item` rows | 52,801 |
| has a name | 50,880 |
| resolves to a slot | 29,026 |
| item level ≥ 100 | 19,843 |
| a combat job can equip it | 17,627 |
| at least one stat | 17,579 |
| no crafter or gatherer stat | 17,574 |
| its slots match a slot code (multi-slot combinations without one are left out and listed; none at item level 100 or above today) | 17,574 |
| not retired (Diadem gear left out) | **17,281** |

The item level floor of 100 is a choice of this project, not a game rule; gear below it is not useful for the sync caps the page targets.

### Slot

The slot is the first slot code, in format order, whose `EquipSlotCategory` column is 1. A main-hand item is **two-handed when the same category also blocks the off-hand** (off-hand column $= -1$) and one-handed when the off-hand column is 0. A piece must also block (value $-1$) exactly the slots its slot code names: none for most codes, the off-hand for a two-handed weapon, and the head for code 12, a body piece that also covers the head (the two Vermilion Cloaks, item level 300; share 220 per mille, the `ChestHeadPercent` column of `BaseParam`, which reproduces both cloaks' stats exactly). Other multi-slot combinations (legs that cover the feet, a body that covers hands, legs and feet) exist only below item level 100; if one appears above it, the generator leaves it out and prints its name. Rings set both FingerL and FingerR to 1 and are matched by FingerL.

### Job mask

The job mask packs "who can equip this" into one integer. With $\text{job}_i$ the $i$-th job of the shared order and $[\cdot]$ equal to 1 when the condition is true and 0 otherwise:

$$
\text{mask} = \sum_{i=0}^{21} 2^{i}\,\bigl[\text{job}_i \text{ can equip the item}\bigr]
$$

"Can equip" means the job's column in the item's `ClassJobCategory` row is `True`. Base classes (Gladiator, Conjurer, ...) and crafting or gathering classes have no bit. In the example above, category 59 lists GLA MRD PLD WAR DRK GNB; Gladiator and Marauder are base classes, so only bits 0 to 3 are set and $\text{mask} = 2^0 + 2^1 + 2^2 + 2^3 = 15$. An item every job can wear has $\text{mask} = 2^{22} - 1 = 4{,}194{,}303$ (1,079 rows).

### Stats and the HQ bonus

An `Item` row lists up to six stats as pairs (stat id, value), plus up to six more pairs for the high-quality (HQ) bonus that a crafted HQ copy gets on top. Each id is looked up in the stat order and added to that position; ids outside the 12 (Defense, Magic Defense and similar) are ignored. For stat position $k$ with `BaseParam` id $\text{id}(k)$:

$$
\text{stat}_k = \sum_{j=0}^{5} \bigl[\text{id}_j = \text{id}(k)\bigr]\,\text{value}_j \;+\; \bigl[\text{can be HQ}\bigr] \sum_{j=0}^{5} \bigl[\text{id}^{\text{HQ}}_j = \text{id}(k)\bigr]\,\text{value}^{\text{HQ}}_j
$$

The HQ bonus is added **only when the item's `CanBeHq` flag is true**, so the database holds the HQ version of every craftable item and the only version of everything else. Why the flag matters: 293 `Item` rows have non-zero HQ bonus values for one of the 12 stats although they cannot be high quality, and 290 of them pass the other selection rules. An earlier version added the bonus to every item and inflated their stats; the problem was found by diffing the two versions (**verified** by count: 290 now, "about 290" in the original finding). By name they are mostly upgradeable gear families (Phantom Vision, 140 rows, item level 780; Arcanaut's, 105 rows, item level 745) plus 45 item level 130 "Captain's" weapons (Serpent, Storm and Flame, 15 each). With the rule, the bonus is applied to 4,398 rows.

Melds (materia) are not part of these stats: a database row holds the item as it drops or is crafted. What a piece can take is in its two meld fields (section *Materia slots*).

### Unique flag

`IsUnique` becomes 1 or 0. A Unique item can be equipped only once, which matters for rings: two copies of the same Unique ring are not allowed in one set. 12,780 of the 17,281 rows are Unique. How the optimizer uses the flag is in [optimizer.md](optimizer.md).

### Sources

Each row carries a bit mask of the six groups the optimizer can leave out: crafted, tomestone, ultimate, savage, relic and PvP. A gear piece can be in none, one or several. A group's bit is set from two signals:

- the piece's **category**, from `Item.SubcategorySort` and shop data (`gear_categories.py`; every code and how it was checked is in [subcategory-sort-codes.md](subcategory-sort-codes.md)). Each group lists its categories in the shared format file: crafted ← crafted; tomestone ← tomestone; ultimate ← ultimate; savage ← savage, current expansion only; relic ← relic and field_op (Eureka, Bozja and Occult Crescent armor and accessories, which take the same zone grind as the relic weapons from those zones); pvp ← pvp (the item level 100 to 205 sets sold for Wolf Marks, still on sale and with normal stats outside PvP: **verified** on the Lodestone at patch 7.56);
- the **shop and recipe flags** below, for crafted, tomestone and ultimate.

The generator stops if a code has no known category, if a category named in the format file does not exist, or if the two signals contradict each other (a recipe result outside crafted, a totem purchase outside ultimate, a Savage armor piece or weapon without a dye slot).

The game files do not record dungeon drops: loot tables live on the game's servers, and no client sheet lists them (**verified**: the loot-related sheets `Treasure`, `InstanceContentRewardItem`, `ContentRewardCondition` and `LootModeType` hold no item ids). Dungeon gear can still be told apart by its code (270), but it is in no group.

The savage group is marked `currentOnly`: it takes only pieces whose equip level is the highest in the database (the level cap, 100 today), so legacy Savage gear, which is far easier to get now, stays in the pool, and the group moves on by itself when an expansion raises the cap. No item names are used.

Counts in the current data: crafted 4,307, tomestone 2,947, ultimate 136, savage 231 (the three Dawntrail tiers; 886 legacy Savage pieces are in no group), relic 1,559, pvp 340.

The shop and recipe flags:

- **Crafted** (bit 0): the item is the `ItemResult` of a recipe. 3,450 rows, all in the crafted category; the other 857 crafted pieces are augmented crafted gear bought with certificates (675) and pieces with no recipe of their own. **Verified** against the Lodestone (section 10).
- **Tomestone** (bit 1): an exchange listing costs a tomestone to get it, or it is made by trading in such a piece. 1,833 rows. Shops do not store most currency costs as item ids: a cost below 8 is a code, read through the shop's `UseCurrencyType` as SaintCoinach's shop reader does. Types 4 and 2: codes 1 to 4 are the current tomestones (code 1 is Poetics; SaintCoinach does not decode type 2, and the Lodestone shows its code 1 as Poetics, for example "Deepshadow Necklace of Healing ×1 + Allagan Tomestone of Poetics ×100"). Type 16: code 1 is Poetics; 2, 4, 6 and 7 are crafter and gatherer scrips. Type 8: gil. A tomestone's own item id as a cost also counts, and so does a listing that also takes a piece of gear in (augmentation and repair exchanges). A piece made by trading in tomestone gear counts too (for example Augmented Quetzalli, made from Quetzalli and Surgelight Twine), repeated until nothing changes. 1,768 of these are tomestone-category pieces; the other 65 are Heavensward artifact armor (item level 210) bought with Allagan Tomestones of Esoterics, which the group includes. The category adds 1,114 tomestone pieces with no current tomestone cost (retired sets). The piece traded in is not flagged by that trade: retired sets that are no longer sold (the un-augmented Ironworks, Shire, Lost Allagan, Scaevan, Deepshadow, Crystarium, Cryptlurker, Lunar Envoy and Credendum pieces, removed in patch 5.3 or later) carry no tomestone cost in the current game files, and no source checked (Lodestone, Garland Tools, the Console Games Wiki) records how they were sold. The flag therefore means *the game files sell it for tomestones, or it is made from such a piece*. A shop the game no longer uses can still be in the files: the Allagan Tomestones of Heliometry shop still sells Quetzalli gear, while the Lodestone shows only today's Sack of Nuts exchange.
- **Ultimate** (bit 2): an exchange listing sells it for one of the seven ultimate totems (Dreadwyrm, Ultima, Colossus, Dragonsong, Omega, Oracle, Mad Harlequin's). 136 rows: the 16, 16, 18, 20, 22, 22 and 22 weapons of the seven ultimates. Item names are not used: the Weapon's Refrain weapons end in "Ultima" and the Dancing Mad weapons are named "Palazzo Diamond". Which duty a totem comes from is not in the game files: six pairs match Teamcraft's data, and the Console Games Wiki says Mad Harlequin's Totem drops in Dancing Mad (Ultimate) (**verified** there; the game files still do not link them). The generator stops if any totem id no longer has its expected name.

### Stat factor kind

`BaseParamModifier` becomes the last field: the item's kind, a number from 0 to 12 that picks a column of the stat factor table (section 5). On that item each stat's full-share slot value is multiplied by its percentage in that column ([math.md, section 4](math.md#the-stat-factor-of-an-item)). In the current data: kinds 1, 2, 3 and 10 are Strength gear (7,253 rows), 4, 11 and 12 Dexterity gear (4,136), 5 Intelligence (2,894), 6 Mind (2,949), 7 Strength and Dexterity (25), 8 Intelligence and Mind (5), 9 crafter and gatherer gear (none left in the database), and 0 the 13 pieces with all four main stats plus six earrings and rings with no main stat (19). The generator stops if an item names a kind the table has no column for. **Verified** (game data): the kind is copied, not inferred.

### Materia slots

Two more fields record what a piece can be melded with. Both are copied from `Item`, not inferred (**verified**, game data):

- **meld slots**: `MateriaSlotCount`, the guaranteed slots, 0 to 5. The generator stops on a value outside that range or that is not a whole number. No piece in the database has more than 5;
- **overmeld**: 1 when `IsAdvancedMeldingPermitted` is `True` (overmelding allowed), 0 when `False`; any other value stops the generator.

### Rarity

The last field is `Item.Rarity`, copied as is (1 white, 2 green, 3 blue, 4 purple; **verified**, game data): 2,078, 6,052, 8,559 and 592 rows in the current data. A value that is not a whole number stops the generator. Only the accuracy check reads it: Direct Hit on green, HQ-able healer pieces with three substats is 25%, not 20% ([math.md, section 4](math.md#substat-shares-empirical)).

| Meld slots | Overmeld 0 | Overmeld 1 |
| --- | --- | --- |
| 0 | 2,494 | 15 |
| 1 | 1,720 | 863 |
| 2 | 8,723 | 2,776 |
| 3 | 129 | 0 |
| 5 | 561 | 0 |

No piece has 4 slots. The 15 pieces with no slot but the overmeld flag are old crafted Paladin shields, item level 180 to 415 (for example Dwarven Mythril Shield). Whether they take any materia in game is not known (**inferred** that they take none: a piece overmelds only past its guaranteed slots, report in `docs/scratchpad/materia/`).

### The materia table

The item file also holds one small table, one entry per materia grade I to XII:

| Grade | I | II | III | IV | V | VI | VII | VIII | IX | X | XI | XII |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| value $v_g$ | 1 | 2 | 3 | 4 | 6 | 16 | 8 | 24 | 12 | 36 | 18 | 54 |
| gate $L_g$ | 15 | 30 | 45 | 70 | 160 | 290 | 420 | 420 | 560 | 560 | 690 | 690 |
| high | | | | | | ✓ | | ✓ | | ✓ | | ✓ |

- **Value** $v_g$: what grade $g$ adds to a combat substat (`Materia`, `Value[g − 1]`). **Verified**, game data.
- **Gate** $L_g$: the lowest gear item level that takes grade $g$, the `LevelItem` of the grade's materia item. **Verified** against the Lodestone, whose materia pages list "Base Item: Item Level $L_g$".
- **High**: the grades that cannot go past the first overmeld slot, those whose `MateriaGrade` row has a 0% rate in the second overmeld slot (`OvermeldNQPercent[1]` = 0). **Verified**, game data and the materia's item text.

How it is built:

1. Take the `Materia` rows of the seven combat substats whose first materia item is not empty. Exactly one row per substat must be left.
2. Each row must have 12 positive values and 12 materia items with a `LevelItem`, nothing in the item and value columns after the twelfth, and gates that never decrease from one grade to the next.
3. All seven rows must agree on values and gates.
4. The high grades must be exactly the grades worth more than each grade next to them: $v_g > v_{g-1}$ and $v_g > v_{g+1}$ where those exist (VI: 16 against 6 and 8). This ties the two sheets together; a patch that changed one without the other stops the generator.

Any violation stops the generator with an error naming the rows; the table is printed in the run summary.

**Decoy rows.** Most of the `Materia` sheet is rows with values but no materia items: 1,377 of its 1,417 rows, ids 39 to 1416, 1,372 of them for a combat substat (ids 44 to 1416; Determination and Critical Hit 259 each, Direct Hit 247, Skill Speed 181, Spell Speed 157, Tenacity 150, Piety 119). Their values do not follow the table (row 44, Direct Hit: 2, 3, 4 and then nothing). No materia item points to them, so they are not materia a player can meld; what the game uses them for is not known. Step 1 skips them by their empty first item, and the run summary counts them. Only 25 rows carry items: the seven combat substats; the main stat, Vitality and resistance rows (items, every value 0); six crafter and gatherer stats with their own values; and row 1, Cracked Materia (no stat).

### Row format and order

Each database row is a fixed list of thirteen fields:

| Field | Type | Meaning |
| --- | --- | --- |
| name | text | Item name as in the English client. |
| slot code | integer 0 to 12 | Slot, per the shared slot table. |
| item level | integer | The item's own item level (`LevelItem`), 100 to 795 in the current data. |
| equip level | integer | Character level needed to wear it (`LevelEquip`). |
| job mask | integer, $0 < \text{mask} < 2^{22}$ | Who can equip it, as defined above. |
| stats | 14 comma-separated integers | Stat values in the shared stat order, HQ bonus included when the item can be HQ. |
| unique | 0 or 1 | 1 when only one copy can be worn. |
| hq | 0 or 1 | 1 when the item can be high quality (`CanBeHq`), so its stats are the HQ ones; the page marks it HQ. |
| sources | integer 0 to 63 | Bit mask: 1 crafted, 2 tomestone, 4 relic, 8 savage, 16 ultimate, 32 PvP (section *Sources*). |
| stat factor kind | integer 0 to 12 | `BaseParamModifier`: the column of the stat factor table (section *Stat factor kind*). |
| meld slots | integer 0 to 5 | `MateriaSlotCount`: guaranteed materia slots (section *Materia slots*). |
| overmeld | 0 or 1 | 1 when overmelding is allowed (`IsAdvancedMeldingPermitted`). |
| rarity | integer | `Item.Rarity` (section *Rarity*). |

The example row is

| name | slot | item level | equip level | job mask | stats | unique | hq | sources | kind | meld slots | overmeld | rarity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Void Ark Helm of Fending | 3 | 200 | 60 | 15 | 46,0,0,0,45,0,0,0,0,35,50,0,0,0 | 1 | 0 | 0 | 1 | 0 | 0 | 3 |

The file holds the rows and the materia table next to each other, under the same source record (section 6).

Rows are sorted by item level (highest first), then slot code, then name. The stats are stored as one string per row to keep the file small; the page splits it when it reads a row.

## 5. Item level table and level data

The second generator writes one file with four parts.

**Stat budgets.** For each of the 14 stats, the `ItemLevel` column of that stat as a list indexed by item level: $\text{budget}_s(\ell)$ for $\ell = 0, \dots, 920$. The ids must run 0, 1, 2, ... without gaps, so that the list position equals the item level; the generator stops with an error otherwise. For example, at item level 123: Mind 355, Vitality 375, Spell Speed 346. How a budget becomes the stat on a piece is in [math.md](math.md).

**Level data.** For character levels 1 to 100, three `ParamGrow` columns:

| Column | Meaning | Level 90 | Level 100 |
| --- | --- | --- | --- |
| BaseSpeed | a character's own speed stat at that level, with no gear | 400 | 420 |
| LevelModifier | the divisor in the speed formulas | 1900 | 2780 |
| ItemLevelSync | the item level gear is synced to when the character is synced to that level (level sync, [math.md, section 5](math.md#which-pieces-are-synced)) | 660 | 690 |

A missing level or column stops the generator with an error. The speed formulas are in [math.md](math.md).

**Stat factor table.** For each stat, its `BaseParam` row's 13 `MeldParam` columns, in percent: $f_s(k)$ for item kind $k = 0, \dots, 12$. For example Vitality is 90 in columns 0, 5, 6 and 8 and 100 elsewhere; each main stat is 90 in column 0, 100 in the columns of gear that carries it (and in column 9) and 70 in the rest; Critical Hit, Determination, Direct Hit, both speeds and Tenacity are 100 everywhere. How it is used is in [math.md, section 4](math.md#the-stat-factor-of-an-item).

**Source record.** Which datamining commit the data came from (next section).

## 6. Provenance

When the data is regenerated, the commit id and commit date of the local datamining clone are recorded. They appear in three places:

- in the item and item level files, a one-line "do not edit" notice naming the repository, the full commit id and the date;
- in the same two files, a source record (repository, commit, date); the page reads it from the item level file;
- the page footer, as "Game data: ffxiv-datamining" plus the short commit id and the date. The current footer reads `Game data: ffxiv-datamining d9582a6, 2026-09-30`.

The full regeneration refuses to run when it cannot read the clone's commit. The generators run on their own (for example on test files) write "commit unknown" and an empty source record, and the footer then shows nothing.

The recorded commit is the clone's newest commit, not the newest commit that changed one of the six sheets. Commit `d9582a6` ("TC 7.25") changed no English CSV. The six sheets were last changed by:

| Sheet | Last changed in |
| --- | --- |
| `Item` | `a67c23b`, patch 7.56, 8 September 2026 |
| `ClassJobCategory` | `d71de32`, 7.56 hotfix 1, 17 September 2026 |
| `ItemLevel`, `BaseParam` | `50686a9`, patch 7.50, 28 April 2026 |
| `ParamGrow`, `EquipSlotCategory` | `d3eb86d`, exporter migration, 4 January 2026 |

## 7. Facts about the current data

| Fact | Value |
| --- | --- |
| Database rows | 17,281 |
| Lowest / highest item level in the database | 100 / **795** (66 rows at 795) |
| `ItemLevel` rows | 921 (ids 0 to 920) |
| Level data | levels 1 to 100 |
| Unique rows | 12,780 |
| Rows wearable by every job | 1,079 |

Rows per slot:

| Slot | Rows | Slot | Rows |
| --- | --- | --- | --- |
| two-handed weapon | 4,264 | feet | 1,743 |
| one-handed weapon | 263 | earring | 990 |
| off-hand | 260 | necklace | 990 |
| head | 1,748 | bracelet | 990 |
| body | 1,852 | ring | 993 |
| hands | 1,743 | | |
| legs | 1,743 | | |

### Item levels above 795

The `ItemLevel` sheet has rows up to 920, but no gear has an item level above 795. The page therefore limits item level inputs to the highest real item level, which it computes from the database rather than storing.

Where the extra rows come from (**verified** against the datamining repository's history for `ItemLevel.csv`, which has two commits):

| Snapshot | Rows | Highest gear item level |
| --- | --- | --- |
| January 2026, exporter migration (`d3eb86d`) | 901 (ids 0 to 900) | 795 |
| Patch 7.50, April 2026 (`50686a9`) | 921 (ids 0 to 920) | 795 |

Between the two, 20 rows were added (901 to 920) and 120 existing rows changed, from row 766 up. In rows 766 to 795 only crafting and gathering columns changed (CP, Control, Craftsmanship, GP, Gathering, Perception); the 12 combat stat columns this project uses changed only in rows 796 to 900. So every row that real gear uses is the same in both snapshots. The current `ItemLevel.csv` is identical to the 7.50 one.

Since these rows are in the client's own data, they are not something the miners added. The values climb smoothly and almost linearly: from row 896 to row 920, Mind goes from 10,415 to 11,742, each substat from 4,385 to 4,626, and Vitality from 11,409 to 13,163. That looks like budget room prepared ahead of gear that is not released yet, but that is an **inference**: the data cannot show intent, and nothing above 795 can be checked against a real item.

## 8. Building the page

The page bundle takes the page code, the stylesheet and both generated data files and writes them into one HTML file, so it opens from disk without a server. Its only external reference is the Google Fonts stylesheet; without a network connection the page falls back to system fonts. The data is part of the code bundle, not loaded at run time.

| Part | Size |
| --- | --- |
| item database (generated file) | 1,618,359 bytes |
| item level table, level data and stat factor table (generated file) | 61,140 bytes |
| job icons (generated file) | 206,351 bytes |
| finished page, minified | 2,017,420 bytes at the last build (about 2.0 MB) |

The item database is close to 80% of the page, the icons about 12%.

## 9. Updating after a game patch

1. **Fetch**: pull the newest CSVs into the local clone.
2. **Regenerate**: run the three generators (the item and item level ones record the new commit) and rebuild the page.
3. **Check**: run the full check (lint, build, unit tests, generator tests, browser smoke test). Every test must pass.
4. Review the change in the two generated files (the diff shows new items and any changed table rows) and update counts quoted in the docs, such as the 17,281 rows above.

Some test expectations are allowed to move, others must not:

| Expectation | After a patch |
| --- | --- |
| Highest real item level, row counts | Move when new gear is added. The page computes the highest item level itself. |
| Formula accuracy per item level band (at least 95% exact, at least 96% within 1) | The shares can move as new gear arrives; the thresholds should still hold. A drop below them means the model needs a look, not a lower threshold. |
| Regression values tied to specific old items (item lookups and optimizer totals on them) | Must not move. Old items do not change. |
| Wiki sync caps at item level 475 | Must not move. They are published numbers; a change means the game changed old `ItemLevel` rows. |
| Generic maximum at cap 123 (296 Spell Speed, 2.22 s GCD) | Depends only on `ItemLevel` rows 123 and 475. Should not move unless those rows change; investigate if it does. |
| Format, row shape and provenance tests, generator tests on test files | Must not move. They test the pipeline, not the game data. |

If a patch adds a job or a stat, the shared format definition and the page's job table have to be extended first; the format test fails until both agree. If a patch renames a column the generators read, or changes a slot share in `BaseParam`, the regeneration stops with an error naming it (section 1); update the shared format definition (and, for a slot share, check the math) rather than working around it.

## 10. How the pipeline is tested

**Generator tests** (Python, on small test CSVs in the test folder):

- The test files use the real sheet headers. The `EquipSlotCategory` and `ClassJobCategory` rows are copied from the real sheets; the `Item` rows are made-up test items built on the real header.
- `ItemLevel` values are synthetic: the value in row $r$, column position $c$ is $1000\,r + c$, so reading the wrong column shows up as a wrong number. `ParamGrow` is written by the test with distinct values per column ($1000 + \ell$, $2000 + \ell$, $3000 + \ell$ for level $\ell$).
- The `BaseParam` test file holds the real rows of the 14 stats.
- They check slot detection (two-handed vs one-handed, every slot type), exclusions (belt, soul crystal, missing or non-gear category, base-class-only, crafter-only, unknown category, no stats, empty name, item level 99), stat placement including a stat in the sixth pair after empty ones, the HQ rule in both directions, job mask bits, the Unique flag, sort order, the 14 `ItemLevel` columns, the stat factor kind and the meld fields of a few items, the materia table (with two decoy rows in the `Materia` test file, which holds 12 real rows; `MateriaGrade` is the whole real sheet and `Item` also holds the 84 real materia items of the seven combat substats), the stat factor table (the `BaseParam` test file holds the real rows), levels 1 to 100, and the errors for a missing level and for non-contiguous `ItemLevel` ids.
- Schema drift, on edited copies of the test files: a renamed job column (`SGE` to `SAGE`), job values written as `1` instead of `True`, missing `EquipSlotCategory` columns, missing `Item` columns, a missing `ItemLevel` stat column, a missing `ParamGrow` column, a `BaseParam` slot share that differs from the page, a missing `BaseParam` column, a missing stat row, a missing `MeldParam` or `BaseParamModifier` column, a stat factor of 0, an item kind with no `MeldParam` column, a missing meld column in `Item`, `Materia` or `MateriaGrade`, a slot count of 6, an overmeld value other than `True`/`False`, a rarity that is not a whole number, combat materia rows that disagree on a value or a gate, a decoy row that gains an item, a missing combat materia row, a thirteenth grade, and high grades that no longer match the values each stop the generator with an error naming the sheet and column, and no file is written. Run from the command line, the generator exits with status 1 and a one-line message.

**Format tests** (Node, on the real generated data):

- the page's job order, stat order and slot table equal the shared format definition;
- the budget table has one column per stat, all the same length, and the level data has 100 rows;
- every database row has thirteen fields (an item kind below 13, meld slots 0 to 5, a 0/1 overmeld flag and a whole-number rarity last), a valid slot code, a job mask in $(0, 2^{22})$, 14 stats, 0/1 Unique and HQ flags and a source mask below 64; the meld fields sit where the shared format says; the materia table has 12 positive values, non-decreasing gates and high grades between 1 and 12; the stat factor table has one row of percents per stat and 13 columns;
- the slot shares the page uses (per slot, per weapon mode and per job) equal the `percent`s in the shared format definition;
- every job has at least one item for each of its active slots, with the weapon matching its weapon mode. One exception is listed in the test: Blue Mage weapons exist in `Item` (10 rows) but carry no stats, so none are in the database. The test fails if that changes.

**Job icon tests**: the generator tests check a missing icon and a file that is not a 64 × 64 PNG; a format test (Node) checks that every job is in the picker exactly once and has an embedded 64 × 64 PNG.

**Provenance tests** (Node): the source record names the datamining repository, a full 40-character commit id and an ISO date; both generated data files carry the same source record and name its commit in their notice; the footer text is short and empty when the source is unknown.

**Source flags against the Lodestone** (a manual check, not part of the test suite): 175 randomly chosen pieces (two samples: 15 and 20 per flag plus twice as many unflagged pieces), each compared with its Lodestone item page at one request every 2.5 seconds. A page counts as crafted when it links a recipe, tomestone when a shop cost is an Allagan Tomestone, ultimate when a cost is an ultimate totem. 167 agree. All 8 differences are tomestone pieces the page shows no tomestone for, and each has a known cause: the game files still hold a retired tomestone shop that sells it (Quetzalli, Moonward: the page shows only today's Sack of Nuts exchange; Radiant's: the page lists no source at all), or the piece is made from tomestone gear (Augmented Bygone Brass from Bygone Brass plus a glaze or twine, Exquisite Isnae Phis from Augmented Isnae Phis plus an Elevated Ester). No crafted, ultimate or unflagged piece disagrees. The first sample found two generator bugs, both fixed (see [history.md](history.md)).

## Where this lives

| Concept | File |
| --- | --- |
| Fetch (sparse clone and job icons) | `scripts/data/fetch.py` |
| Shared format definition | `src/core/item-format.json` |
| Format loading, CSV reading, the column and slot share checks, the stat factor table | `scripts/data/item_format.py` (`stat_factors`) |
| Item database generator; materia table and decoy rows | `scripts/data/gen_items.py` (`materia_table`) |
| Meld fields of an Item row | `scripts/data/item_format.py` (`meld_fields`), `materia` in `src/core/item-format.json` |
| Meld fields of a pool item | `src/core/items.js` (`parseRow`, `meldInfo`) |
| Item level table, level data and stat factor table generator | `scripts/data/gen_item_level.py` |
| Job icon generator | `scripts/data/gen_job_icons.py` |
| Source commit detection and the generated-file notice | `scripts/data/provenance.py` |
| Regenerate everything | `scripts/data/regen.py` (`npm run update-data` runs fetch, then this) |
| Generated data (never edit by hand) | `src/data/items.json`, `src/data/item-level.json`, `src/data/job-icons.js` |
| Tables, materia table, highest real item level, footer text | `src/core/tables.js` (`MATERIA`, `MAX_REAL`, `MAX_ILVL`, `dataSourceLabel`) |
| Page's job, stat and slot tables; hard-coded slot percentages | `src/core/constants.js` |
| Page bundle | `scripts/build/build.mjs` (`npm run build`) |
| Generator tests and test CSVs | `tests/data/test_generators.py`, `tests/data/fixtures/` (part of `npm test`) |
| Format and provenance tests | `tests/unit/data-format.test.js`, `tests/unit/provenance.test.js` |
| Local CSV clone (gitignored) | `data/ffxiv-datamining/csv/en/` |
| Diagrams | `docs/diagrams/data-flow.svg`, `docs/diagrams/data-item-row.svg` |
