# Data pipeline

How game data gets from the game client into the page. The page needs, for every piece of combat gear, its slot, its item level, who can wear it and its stats, plus the game's tables that turn an item level into stats. All of that is in the game client's own data tables, spread over twenty of them, and most of their rows are not gear at all. This page covers where the data comes from, which rules turn it into the compact data tables the page uses, and how to refresh it after a game patch. How the numbers are then used is in [math.md](../mechanics/math.md) (stat budgets, sync caps, speed) and [optimizer.md](optimizer.md) (gear search).

Related pages: [math.md](../mechanics/math.md), [optimizer.md](optimizer.md), [architecture.md](architecture.md), [testing.md](testing.md), [subcategory-sort-codes.md](subcategory-sort-codes.md), [glossary.md](../glossary.md).

**The whole pipeline in one picture.** A JSON file that both the Python generators and the JavaScript page read (the shared format) defines what each number in a generated row means. The browser never loads data at run time.

![Flow from the game client through the datamining repository to the fetch step, which copies the 20 needed CSV files and the 23 job icons to this machine. Four Python generators, all reading the shared format, write four generated files: the item database (20,031 rows, item level 15 to 795), the item level table, the food table (296 meals) and the job icons. The esbuild page bundle, which also reads the shared format, packs code, styles and the generated files into one HTML file that the browser opens from disk; the footer names the source commit](../diagrams/data-flow.svg)

**Which data.** Every count on this page was produced by running the generators' rules over the CSVs in the local clone, or by importing the generated tables in Node. They describe datamining commit `d9582a6` (30 September 2026).

**Game terms** used below, each also in the [glossary](../glossary.md): a [job](../glossary.md#game-terms) is a combat class (23 of them); a [slot](../glossary.md#game-terms) is where a piece is worn; the [item level](../glossary.md#game-terms) is a row number in the game's stat budget table, from which a piece's stats follow; an [HQ](../glossary.md#game-terms) (high-quality) crafted item has bonus stats on top of the normal one; [materia](../glossary.md#game-terms) are stones melded into gear for extra substats.

## 1. Source

*Where does the data come from, and can it be trusted to be the game's own?*

The data comes from [xivapi/ffxiv-datamining](https://github.com/xivapi/ffxiv-datamining), a public repository of the game client's data sheets saved as CSV files. A *sheet* is one of the game's internal data tables, for example `Item` (one row per item). The files are exported straight from the client, by XIVData Oxidizer since January 2026 and by SaintCoinach before that. The miners do not compute or derive anything: a row in a CSV is a row in the game's own data. **Verified**: the repository's own commit history shows the exporter change (commit `d3eb86d`, 4 January 2026, "Migrate to XIVData Oxidizer").

The project fetches twenty sheets (English column names, `csv/en/`). The fetch step reads `ClassJob` for the job icons (section 2); the item level generator reads it for the job modifiers.

| Sheet | Read by | Gives | Rows |
| --- | --- | --- | --- |
| `Item` | item database and food generators | one row per item | 52,801 |
| `Materia` | item database generator | materia table | 1,417 |
| `MateriaGrade` | item database generator | high materia grades | 12 |
| `EquipSlotCategory` | item database generator | slots taken or blocked | 25 |
| `ClassJobCategory` | item database generator | who can equip | 206 |
| `Recipe` | item database generator | crafted flag | 14,909 |
| `SpecialShop` | item database generator | shop flags, Savage currencies | 1,489 |
| `TomestonesItem` | item database generator | current tomestones | 24 |
| `ItemLevel` | item level generator | stat budgets | 921 |
| `ParamGrow` | item level generator | per-level data | 202 |
| `ItemAction` | food generator | what using an item does | 3,051 |
| `ItemFood` | food generator | meal and medicine bonuses | 714 |
| `BaseParam` | item database and item level generators | slot shares, stat factors | |
| `ClassJob` | fetch step, item level generator | job icon numbers, job modifiers | |
| `Quest` | item database generator | quest rewards | |
| `QuestClassJobReward` | item database generator | job-specific quest rewards | |
| `Achievement` | item database generator | achievement rewards | |
| `GCScripShopItem` | item database generator | Grand Company seal shop | |
| `GilShop` | item database generator | event shops (`FestivalId`) | |
| `GilShopItem` | item database generator | gil shop listings | |

What each sheet holds, and which of its columns are read:

- **`Item`**: name, equip slot category, item level, equip level, job category, up to six stat id and value pairs, up to six HQ bonus pairs, `CanBeHq`, `IsUnique`, `BaseParamModifier` (the item's kind, a column of the stat factor table), `MateriaSlotCount` and `IsAdvancedMeldingPermitted` (materia slots), `Rarity`, `SubStatCategory` (whether the item level scales with the wearer's level), and the row id (`#`, the game id). The gear categories also read `SubcategorySort` and `DyeCount` (section 4), and the materia table reads the `LevelItem` of the materia items.
- **`Materia`**: one row per stat: the materia item of each grade (`Item[0]` to `Item[15]`), what it adds (`Value[0]` to `Value[15]`) and the stat (`BaseParam`). Ids 0 to 1416.
- **`MateriaGrade`**: one row per grade (I to XII) with the overmeld success rates, `OvermeldNQPercent[0]` to `[3]` for the four overmeld slots. Only `[1]` is read.
- **`EquipSlotCategory`**: which gear slots an item occupies (1) or blocks (−1).
- **`ClassJobCategory`**: which classes and jobs may equip an item (`True`/`False` per job).
- **`Recipe`**: one row per recipe; `ItemResult` is the item it makes.
- **`SpecialShop`**: exchange shops, up to 60 listings each, with what a listing gives (`Item`) and costs (`ItemCost`), and the shop's `UseCurrencyType`.
- **`TomestonesItem`**: the tomestone currencies and which are current (`Tomestones` 1 to 4).
- **`ItemLevel`**: the stat budget of every stat at every item level. Ids 0 to 920.
- **`ParamGrow`**: per character level data, including the speed constants. Rows 0 to 201; levels 1 to the level cap (100 today) are used (section 5).
- **`BaseParam`**: one row per stat. It holds the share of the budget each slot gets, in thousandths (values in [math.md, section 3](../mechanics/math.md#3-slot-shares)), and the stat factor per item kind (`MeldParam[0]` to `MeldParam[12]`, in percent). The item level generator copies the stat factors (section 5) and only checks the slot shares, which are kept in the shared format definition (section 3). The item database generator checks the item kinds and the names of the crafter and gatherer stats.
- **`ItemAction`**: what using an item does. A meal's row has `Action` 844 or 845, `Data[0]` 48 (the Well Fed status) and `Data[1]` its `ItemFood` row.
- **`ItemFood`**: up to three stats per meal or medicine: `BaseParam[0..2]`, `IsRelative[0..2]` (a percentage, or a flat bonus), `Value`/`Max` for normal quality and `ValueHQ`/`MaxHQ` for HQ, in one row.
- **`ClassJob`**: one row per class and job with its abbreviation (`PLD`, `SGE`, ...); the row number picks the job's icon, and the `Modifier` columns of Strength, Dexterity, Intelligence, Mind and Vitality are the job modifiers (section 5).
- **`Quest`, `QuestClassJobReward`, `Achievement`, `GCScripShopItem`, `GilShop`, `GilShopItem`**: the ways a player gets a piece other than crafting and `SpecialShop` shops (quest and achievement rewards, seal shops, gil shops and seasonal event shops). Which columns are read is in section 4, *Sources*.

### Guarding against a changed game file

A game patch can rename a column, change a number the page relies on, or change how values are written. The generators check for all three before they write anything, so such a change stops the regeneration with an error instead of producing wrong data quietly.

**Slot shares, verified on every regeneration.** For all 14 stats the project uses, the item level generator reads the stat's `BaseParam` row and compares each slot column with the share the page uses. Any difference, a missing column or a missing stat row stops it with an error that lists every mismatch (for example `mind RingPercent = 70, page uses 67`). The columns checked are `TwoHandWeaponPercent`, `OneHandWeaponPercent`, `OffHandPercent`, `HeadPercent`, `ChestPercent`, `HandsPercent`, `LegsPercent`, `FeetPercent`, `EarringPercent`, `NecklacePercent`, `BraceletPercent`, `RingPercent`, and the three multi-slot columns that have a slot code (section 4): `ChestHeadPercent` (the body that covers the head), `LegsFeetPercent` and `ChestHeadLegsFeetPercent`. The sheet has more multi-slot columns (`HeadChestHandsLegsFeetPercent`, `ChestLegsGlovesPercent`, `ChestLegsFeetPercent`, plus `WaistPercent` and `UnderArmorPercent`); the project has no slot code for that gear, so those are not checked. See [math.md](../mechanics/math.md) for how the shares are used.

**Column checks.** Before using a sheet, each generator checks that every column it reads is in the sheet's header, and stops with an error naming the sheet and each missing column. That covers:

- every job of the shared format in `ClassJobCategory`;
- every stat column in `ItemLevel`;
- every slot column (plus `MainHand` and `OffHand`) in `EquipSlotCategory`;
- the `Item` columns listed above: the 24 stat pair columns, `CanBeHq`, `IsUnique`, `LevelItem`, `LevelEquip`, `ClassJobCategory`, `EquipSlotCategory`, `Name`, `BaseParamModifier`, `MateriaSlotCount`, `IsAdvancedMeldingPermitted`, `Rarity`, and for the gear categories `SubcategorySort` and `DyeCount`;
- the `Materia` and `MateriaGrade` columns of the materia table (section 4);
- the `Recipe`, `SpecialShop` and `TomestonesItem` columns of the source flags;
- the 13 `MeldParam` columns of `BaseParam` and the three `ParamGrow` columns;
- the `Item`, `ItemAction` and `ItemFood` columns of the food table (section 5).

**Value checks.** A stat factor that is not a whole percent from 1 to 100, or an item kind with no `MeldParam` column, also stops the generators. The item database generator also stops if any job ends up with no item at all, which catches a change in how the job columns are written (for example `1` instead of `True`). An empty weapon damage or defense cell counts as 0; any other value that is not a whole number (negative or malformed) stops it too, rather than becoming 0.

**Yes/no columns.** The generators read `CanBeHq`, `IsUnique` and `IsUntradable` in `Item`, and `IsRelative` in `ItemFood`, as the word `True`. A value other than `True` or `False` in any row stops them with an error naming the sheet, the column and the values found. Without the check, an exporter that wrote `1`/`0` would make every one of these false without notice: no HQ bonus, no Unique ring, every piece tradeable, no meal kept. Today every value is `True` or `False` (**verified** by count over all 52,801 `Item` rows).

An error exits with status 1 and writes no file, so the full regeneration stops too. The errors a patch is most likely to cause name what to edit: an activity with no box names `ACTIVITY_BOX`, a category with no drop activity names `DROP_ACTIVITY`, and a hand-kept id that now names another item names its table (section 9).

## 2. Fetching

*How does the data get onto this machine without downloading the whole repository?*

The fetch step makes a **sparse, shallow, blobless** clone of the datamining repository into `data/ffxiv-datamining/` (gitignored):

- *shallow*: only the latest commit, no history;
- *sparse*: only the twenty `csv/en/<Sheet>.csv` paths are checked out;
- *blobless*: file contents are downloaded only for those paths.

For the current data that is about 7 MB of git data and 20 MB of CSV files on disk, mostly `Item.csv`, instead of the whole repository.

- **Refreshing.** Running the fetch again when the clone exists does a fast-forward pull, which picks up whatever the miners published since.
- **A given commit.** `fetch.py --commit <id>` fetches that one commit (the full 40-digit id, which every generated file names, section 6) and checks it out instead of the newest one, so the data of an older page can be rebuilt with one fetch and one regeneration. A later fetch without it goes back to the newest commit. The job icons are always fetched as they are today.
- **Completeness.** The step fails if any of the twenty files is missing afterwards.
- **Adding a sheet.** A clone made before a sheet was added picks it up on the next fetch, because the sparse path list is set on every run. To add a sheet without moving to a newer commit, set the same path list in the clone by hand instead of fetching.

### The most speed per level

The GCD sub-tab's speed slider runs from the level's base to the most total speed (base + gear + food) any job can have at that level. `scripts/data/gen_max_speed.mjs` works it out with the optimizer (JavaScript, so `regen.py` runs it with Node after the item and food tables) and writes `src/data/max-speed.json`, one number per level from 1 to the level cap (the highest equip level in the item database, as the page computes it).

For each job, at each level up to its cap, the most gear speed is the best of three searches with melds: gear made for the level without sync, every piece level synced, and every piece at the highest item level cap the level allows (`capCeiling`, from level 15: below that the cap case comes only from Ala Mhigan Earrings, equip level 1 and item level 50, and no duty syncs that low). The HQ meal that adds the most speed goes on top. Jobs that wear the same pieces give the same answer, so each group is searched once. It takes about two and a half minutes. Level 50, for example: 341 base + 387 gear (level 100 gear synced to the 135 cap) + 72 food = 800.

A search that stops at its node limit (2,000,000 nodes) may miss the true most speed. The generator then writes nothing, names each such search (jobs, level and case) and exits with status 1; raise its node limit and run it again. No search stops there today (**verified**: full run on `d9582a6`, 2026-10-19).

### Job icons

The job picker shows the game's framed, role-coloured job icons. The CSVs hold no images, so the fetch step downloads them from xivapi's asset endpoint, which converts the game's own icon textures to PNG, into `data/icons/<JOB>.png` (gitignored).

Each job's icon number is $62100 + r$, where $r$ is the job's row in `ClassJob`. For example Paladin is row 19, so its icon is 062119. **Verified** by looking at all 23 icons; the rule itself is a numbering pattern of the game's icon files, not a column in any sheet. The high-resolution versions (64 × 64 pixels) are used.

The icon generator embeds the 23 PNG files in `src/data/job-icons.js` as data URLs, so the page still makes no image requests. It stops with an error if a job's icon is missing or is not a 64 × 64 PNG. FINAL FANTASY XIV icons © SQUARE ENIX; the page footer says so.

## 3. The shared format definition

*How do the Python generators and the JavaScript page agree on what a generated row means?*

The generators are written in Python; the page is JavaScript. A generated row is a list of plain numbers, so both sides must agree, for example, that bit 7 of the job mask means Sage and that the fourth stat is Mind. That agreement lives in one JSON file that both sides read, so they cannot drift apart. It defines three orders, plus a few smaller entries.

**Job order.** The 23 combat jobs, in this order (bit index $i$ in parentheses):

PLD (0), WAR (1), DRK (2), GNB (3), WHM (4), SCH (5), AST (6), SGE (7), MNK (8), DRG (9), SAM (10), RPR (11), NIN (12), VPR (13), BRD (14), MCH (15), DNC (16), BLM (17), SMN (18), RDM (19), PCT (20), BLU (21), BST (22).

Beastmaster (patch 7.56) was appended at the end, so no other job's bit moved. The job picker shows the jobs in the game's own order instead (Beastmaster ends the melee row).

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

- **Main Attribute and Secondary Attribute** are generic stats on 16 pieces (the pre-order earrings, the Occult accessories, Neophyte's Ring). The wearer gets Main Attribute as its own main stat, and Secondary Attribute as Piety (healers), Tenacity (tanks) or Direct Hit (everyone else). That mapping is xivgear's, with in-game values for a healer and a Ninja in its tests (**second-hand**); the tank case is **inferred**.
- They have no `ItemLevel` column, so they borrow the main-stat and Direct Hit columns. The four main-stat columns are equal at every item level (**verified**), and Direct Hit equals the common substat column.

**Slot codes.** Each code names a slot type and the `EquipSlotCategory` column that identifies it. Each slot also carries its share of the budget (`percent`, in thousandths) and the `BaseParam` column that holds it; the page reads its slot shares from here, and the item level generator checks them against `BaseParam` (section 1).

| Code | Slot | Column | Code | Slot | Column |
| --- | --- | --- | --- | --- | --- |
| 0 | two-handed weapon | MainHand (off-hand blocked) | 6 | legs | Legs |
| 1 | one-handed weapon | MainHand (off-hand free) | 7 | feet | Feet |
| 2 | off-hand (shield) | OffHand | 8 | earring | Ears |
| 3 | head | Head | 9 | necklace | Neck |
| 4 | body | Body | 10 | bracelet | Wrists |
| 5 | hands | Gloves | 11 | ring | FingerL |
| | | | 12 | body covering the head | Body (head blocked) |

Belts (`Waist`) and soul crystals have no slot code, so items in those slots are dropped.

**Stat factor.** The file also names where the stat factor comes from: the `Item` column that gives an item's kind (`BaseParamModifier`), the `BaseParam` columns that hold one percentage per kind (`MeldParam`) and how many there are (13). It is a separate entry at the end of the file, so it does not depend on the stat order.

**Materia.** A separate entry names:

- the `Item` columns of the two meld fields (`MateriaSlotCount`, `IsAdvancedMeldingPermitted`) and their positions in a row (10 and 11);
- the most guaranteed slots a piece may have (5);
- where the materia table comes from: the `Materia` sheet and its columns, the number of grades (12), the seven combat substats whose rows are read (Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed), the `Item` column that gives each grade's item level gate (`LevelItem`) and the `MateriaGrade` column that marks the high grades (`OvermeldNQPercent[1]`).

**Row fields.** `itemRow.fields` names the twenty fields of a database row in order (`name`, `slotCode`, ..., `defenseMag`; section *Row format and order*). The Python generators build and read rows by these names, never by position, and the page's `ROW` names the same positions (a unit test checks). The `rowField` that other entries give (the meld fields, rarity, game id, scaling flag, category, weapon damage and defense) must be the position of its name in that list; the item database generator stops otherwise.

**Other entries.** The file also lists the six source groups and their categories (section 4), the crafter and gatherer stats that keep a piece out of the database, the `Item` column and row position of the rarity, and the gear categories with their labels (section 4, *Gear category*).

**Changing the file.** Changing any order in this file changes the meaning of the already generated item database, so the data must be regenerated afterwards. A unit test checks that the page's job list, stat order, slot table and slot shares are exactly the ones in the file.

**Format version.** `formatVersion` (1 today) numbers the format. Every generated data file except the job icons copies it, and a unit test checks that each one names the file's current version, so a file generated under an older format is caught even when its row width has not changed. Raise it with any change that gives a field or an order another meaning (a slot code reordered, a field added), then regenerate.

## 4. Item database generation

*Which of the 52,801 `Item` rows become gear in the page, and how is each one packed into a row?*

The figure follows one real piece, Void Ark Helm of Fending (a tank head piece), from its `Item` columns to its database fields. The subsections below explain each step in turn.

![Worked example with Void Ark Helm of Fending, a tank head piece: each Item sheet column maps to a database field. Equip slot category 3 becomes slot code 3 (head); item level 200 is kept; job category 59 becomes job mask 15 (bits 0 to 3, PLD WAR DRK GNB); four stat id and value pairs (Strength 46, Vitality 45, Skill Speed 50, Determination 35) are placed into the stat positions by id; the HQ bonus is skipped because the item cannot be high quality; IsUnique becomes 1](../diagrams/data-item-row.svg)

### Selection

An `Item` row becomes a database row when it passes all eight rules below, applied in order. The figure shows how many rows of the current data each rule leaves. The item database generator prints the same funnel on every run, as one line of rows each rule left out, so a patch that suddenly drops many more rows shows there:

```
Item.csv 52,801 rows: no name -1,921, no slot code (belts, soul crystals, not gear) -21,854, item level under 15 -4,248,
no combat job -2,623, no stats -1,338, crafter or gatherer stat -5, category aetherial (LEFT_OUT) -487,
category diadem (LEFT_OUT) -293, category legacy (LEFT_OUT) -1; kept 20,031
```

(One line in the output; wrapped here. A rule that leaves nothing out, rule 7 today, is not listed.) A row whose `EquipSlotCategory` or `ClassJobCategory` id has no row in that sheet counts under rule 2 or 4, and the line then says how many, for example `no combat job -2,623 (3 with an id that has no ClassJobCategory row)`; today there are none (**verified** by count).

![Funnel of the eight selection rules over the 52,801 Item rows, with the rows left after each: 1, has a name, 50,880; 2, its equip slot category resolves to a slot (section Slot), which rules out belts, soul crystals and non-gear, 29,026; 3, item level at least 15, 24,778; 4, at least one of the 23 combat jobs may equip it (job mask above 0), which rules out crafter and gatherer gear and gear only a base class such as Gladiator can wear, 22,155; 5, at least one of its 14 stats is non-zero after the HQ rule below, 20,817; 6, no crafter or gatherer stat, normal or HQ, 20,812; 7, its slots match a slot code, else the piece is left out and its name printed, 20,812; 8, not retired (Diadem, Aetherial and legacy gear left out), 20,031](../diagrams/data-selection.svg)

Notes on the rules:

- **Rule 6.** The crafter and gatherer stats are GP, CP, Craftsmanship, Control, Gathering and Perception. Such a piece is crafter or gatherer gear even when "All Classes" can wear it. The stats are listed by `BaseParam` row id in the shared format file, and the generator stops if one of those rows carries another name. Today this leaves out five item level 150 "All Classes" gatherer pieces (Serpentskin, Chimerical Felt) with Gathering, Perception and a small Vitality. The formula could not predict them, because crafter and gatherer Vitality follows no share of the combat budget.
- **Rule 7.** There is no such piece today: the two shapes below item level 100 have slot codes (section *Slot*).
- **Rule 8.** Three categories are left out (checked on the Console Games Wiki, [subcategory-sort-codes.md](subcategory-sort-codes.md)):
  - Code 250 gear has random secondary attributes, so the stats in the game files are not what a piece has (**second-hand**: the item text, which the export does not carry). That is the Heavensward Diadem gear (equip level 60, 293 pieces, also retired) and A Realm Reborn's Aetherial gear (equip level 50 or below, 487 pieces).
  - Code 990 is gear that can no longer be obtained (1 piece reaches this rule, the Chocobo Mask; the version 1.0 "Dated" gear has no combat stats and stops earlier).
  - 781 rows in all (293 + 487 + 1), printed per category in the generator's funnel line above.

**Why item level 15.** The floor is a choice of this project (**owner's decision**, 2026-10-15), not a game rule. Sastasha, the lowest dungeon, opens at level 15 and syncs to level 18 with no item level requirement or item level sync (`ContentFinderCondition`, **verified**), so gear from item level 15 up can be worn there. Until then the floor was 100. Below 100 the database carries each piece's own stats, but the stat model's patterns (substat shares, factors) were measured at 100 and up only ([validation.md](../mechanics/validation.md)), and the item stat accuracy check starts at 110.

### Slot

*Which slot does a piece go in?* The `EquipSlotCategory` row of an item has one column per gear slot: 1 where the piece is worn, −1 where it blocks a slot (a two-handed weapon blocks the off-hand), 0 elsewhere.

**The rule.** The slot is the first slot code, in format order, whose `EquipSlotCategory` column is 1. A main-hand item is **two-handed when the same category also blocks the off-hand** (off-hand column $= -1$) and one-handed when the off-hand column is 0. Rings set both FingerL and FingerR to 1 and are matched by FingerL.

**The blocked slots must match too.** A piece must also block (value $-1$) exactly the slots its slot code names:

| Code | Blocks | Pieces | Share (per mille) |
| --- | --- | --- | --- |
| most codes | nothing | | |
| two-handed weapon (0) | the off-hand | | |
| 12 | the head: a body piece that also covers the head | 21, among them the two Vermilion Cloaks, item level 300 | 220, the `ChestHeadPercent` column of `BaseParam`, which reproduces both cloaks' stats exactly |
| 13 | the feet: legs that also cover the feet | the five Flanchards, item level 25 to 70 | 220 |
| 14 | the hands, legs and feet: a body that covers them | Herklaedi, item level 50 | 440 |

`BaseParam`'s share columns follow the `EquipSlotCategory` rows in order, and their names are the dataminers' own: code 14 reads the column named `ChestHeadLegsFeetPercent`, although Herklaedi leaves the head free; 440 gives its main stat, Vitality and first substat exactly (**verified**). Any other combination is left out and its name printed.

### Job mask

*Who can wear the piece?* The job mask packs "who can equip this" into one integer, one bit per job of the shared order. With $\text{job}_i$ the $i$-th job of the shared order and $[\cdot]$ equal to 1 when the condition is true and 0 otherwise:

$$
\text{mask} = \sum_{i=0}^{22} 2^{i}\,\bigl[\text{job}_i \text{ can equip the item}\bigr]
$$

"Can equip" means the job's column in the item's `ClassJobCategory` row is `True`. Base classes (Gladiator, Conjurer, ...) and crafting or gathering classes have no bit.

**Example.** In the figure above, category 59 lists GLA MRD PLD WAR DRK GNB. Gladiator and Marauder are base classes, so only bits 0 to 3 are set and $\text{mask} = 2^0 + 2^1 + 2^2 + 2^3 = 15$. An item every job can wear has $\text{mask} = 2^{23} - 1 = 8{,}388{,}607$ (1,531 rows); Beastmaster's own gear has $\text{mask} = 2^{22}$ (50 rows).

### Stats and the HQ bonus

*Which stats does the row hold?* An `Item` row lists up to six stats as pairs (stat id, value), plus up to six more pairs for the high-quality (HQ) bonus that a crafted HQ copy gets on top. Each id is looked up in the stat order and added to that position; other ids are ignored, apart from the HQ bonus to weapon damage and defense (ids 12, 13, 21 and 24), which is added to those fields (section *Row format and order*). In the figure, the helm's four pairs (Strength 46, Vitality 45, Skill Speed 50, Determination 35) land in positions 0, 4, 10 and 9.

For stat position $k$ with `BaseParam` id $\text{id}(k)$:

$$
\text{stat}_k = \sum_{j=0}^{5} \bigl[\text{id}_j = \text{id}(k)\bigr]\,\text{value}_j \;+\; \bigl[\text{can be HQ}\bigr] \sum_{j=0}^{5} \bigl[\text{id}^{\text{HQ}}_j = \text{id}(k)\bigr]\,\text{value}^{\text{HQ}}_j
$$

**The rule.** The HQ bonus is added **only when the item's `CanBeHq` flag is true**, so the database holds the HQ version of every craftable item and the only version of everything else. With the rule, the bonus is applied to 5,395 rows (2026-10-16).

**Why the flag matters.** 328 `Item` rows at item level 100 or above have non-zero HQ bonus values for one of the 12 named stats (the 14 stored stats without Main and Secondary Attribute) although they cannot be high quality, and 325 of them pass the other selection rules (**verified** by count). Adding the bonus to those would inflate their stats; an earlier version did, and its finding of "about 290" (before Beastmaster) matches ([history.md](../history.md)).

- **Which pieces.** By name they are mostly upgradeable gear families (Phantom Vision, 140 rows, item level 780; Arcanaut's, 105 rows, item level 745) plus 45 item level 130 "Captain's" weapons (Serpent, Storm and Flame, 15 each) and Beastmaster's own 35 pieces.
- **Beastmaster's.** They carry its Crucible bonus there (Strength and Vitality, `ItemSpecialBonus` 11; +9 / +9 on Guttler), which the game applies only inside the Crucible of the Unbroken (**second-hand**, Console Games Wiki). The tool leaves it out, as it does the Eureka and Bozja bonuses.
- **Below item level 100**, 451 more pieces carry such values without being HQ-able, nearly all Grand Company gear (Storm, Flame and Serpent; Gridanian, Lominsan and Ul'dahn); the rule leaves them out too.

Melds (materia) are not part of these stats: a database row holds the item as it drops or is crafted. What a piece can take is in its two meld fields (section *Materia slots*).

### Unique flag

`IsUnique` becomes 1 or 0. A Unique item can be equipped only once, which matters for rings: two copies of the same Unique ring are not allowed in one set. 14,458 of the 20,031 rows are Unique. How the optimizer uses the flag is in [optimizer.md](optimizer.md).

### Sources

*Where does a piece come from, so the page can leave out gear a player won't go and get?* Each row carries the piece's **routes** for the "Gear from" filter of the optimizer and the gear browser. The filter's 20 boxes name what a player does: quests, crafting, normal duties, tomestones, hunts, Savage and so on ([Savage](../glossary.md#game-terms), [Ultimate](../glossary.md#game-terms), [tomestones](../glossary.md#game-terms) and [relics](../glossary.md#game-terms) are game terms). The boxes are listed in `activities` of the shared format file, with their menu section, whether they are ticked by default and the hint the menu shows.

**Routes.** A route is a bit mask over the boxes; bit *i* is the *i*-th box. A piece has one or more routes, and any one gets it; a route needs every box in it. Augmented Bygone Brass Earrings of Casting, for example, has two: current tomestones plus Hunts, or current tomestones plus Savage (Current), because the tomestone piece is upgraded with Thundersteeped Twine, which drops in Savage and is also sold for Sacks of Nuts. A tradeable piece also has the route made of the market board bit alone (the bit after the last box), so the market board switch lists it whatever its source. The page lists a piece when every bit of one of its routes is allowed. A piece with no route can no longer be obtained and is never listed.

**How the routes are found** (`gear_activities.py`; game files only, no item names):

- **Ways in.** A recipe (crafting), a gil shop (vendor), a Grand Company seal shop, a quest reward (`Quest.Reward`, `OptionalItemReward`, `QuestClassJobReward`), an achievement reward, a seasonal event gil shop (`GilShop.FestivalId`), or an exchange listing (`SpecialShop`), which needs everything it costs.
- **Costs.** A cost is a currency or a piece traded in, resolved the same way, recursively, up to 8 trade-ins deep. Every way to pay each cost is kept: two costs with two ways each give four routes. A route that needs more than another one is dropped.
- **Currency codes.** A cost below 8 is a code read through the shop's `UseCurrencyType`, as SaintCoinach's shop reader does. Types 2 and 4: code 1 is Poetics, codes 2 and 3 the current tomestones (the slots of `TomestonesItem`); code 4 of type 4 is a gatherers' scrip. Type 16: code 1 is Poetics, the others crafter and gatherer scrips. Type 8: gil. The Lodestone shows type 2's code 1 as Poetics ("Deepshadow Necklace of Healing ×1 + Allagan Tomestone of Poetics ×100").
- **Tomestones by item id.** Slot 1 of `TomestonesItem` is Poetics, slots 2 to 4 current (4 is last patch's, still exchanged), slot 0 retired.
- **Retired tomestone shops.** A code means "the *n*-th current tomestone", so a shop left over from an earlier patch decodes to today's tomestone. For codes 2 and 3, only the gear at the highest item level sold for that code is live; older listings for the same code are retired. On every patch from 6.05 to 7.4 the live set was the highest one, but that SE keeps doing this is a judgment (**inferred**). Six retired Poetics shops (code 1), which nothing in the world opens, are listed by id.
- **Rebuys.** A gil listing that needs a quest or an achievement is a Calamity Salvager rebuy: the piece was earned first. Its quest becomes the route (Events & promotions when the quest belongs to a seasonal event), or its achievement when that achievement gives the piece. This matched the salvager NPCs' own shops on all 433 listings of kept gear.
- **Relics.** Relic weapons (category relic) are Relics & Field ops, whatever their quest or tomestone route (owner's ruling: the activity, not the currency).
- **No way in.** The game files do not record drops: loot tables live on the game's servers, and no client sheet lists them (**verified**: `Treasure`, `InstanceContentRewardItem`, `ContentRewardCondition` and `LootModeType` hold no item ids). A kept piece with no way in takes the activity of its category (dungeon, raid, trial ...; artifact rings drop in dungeons). In the categories where every obtainable piece has a source (tomestone, artifact, crafted, gil vendor, Gold Saucer, Grand Company, PvP, quest, achievement, Savage, Ultimate, deep dungeon, seasonal event) an untradeable piece with none is retired. A currency with no way in takes the activity of the gear it buys most (**inferred**; 200 of 201 such currencies buy over 90% one category); trial totems mean Extreme trials. Both fallbacks are counted on every run, in one line by activity after the funnel line: `Routes inferred: 6,205 pieces with no way in the game files (Dungeon 3,896, Retired 1,110, ...); 201 currencies by the gear they buy most (Normal raid 89, Savage 48, ...)`.
- **Hand-kept tables**, each keyed by id with the expected name, so a patch that reuses an id stops the run: 42 currencies the game files cannot place (Hunts seals, Savage and Extreme tokens, Elevated Ester, crafting certificates, retired event tomestones; checked on the Console Games Wiki), the six retired shops, and one piece given through a sheet not read (Neophyte's Ring, a quest reward).
- **Boxes.** Each activity maps to a box. Savage and Extreme split at the level cap (the highest equip level in the data, 100 today): Current at the cap, Legacy below it, since content below the cap can be farmed unsynced. Ultimate is one box: ultimates cannot be run unsynced. Untradeable gil-vendor gear is Miscellaneous; tradeable gil-vendor gear has only the market board route.

The boxes in the current data (2026-10-18):

| Box | Section | Default | From it | Needs it, board off | Needs it, board on |
| --- | --- | --- | ---: | ---: | ---: |
| Quests & story | Everyday | on | 2,198 | 1,199 | 1,196 |
| Crafted | Everyday | on | 5,286 | 4,358 | 867 |
| Normal duties | Everyday | on | 5,771 | 5,771 | 5,713 |
| Tomestones (Legacy) | Everyday | on | 1,291 | 1,079 | 1,079 |
| Tomestones (Current) | Everyday | on | 539 | 539 | 539 |
| Grand Company | Everyday | on | 407 | 407 | 407 |
| Hunts | Everyday | on | 1,096 | 935 | 935 |
| Miscellaneous | Everyday | off | 50 | 50 | 15 |
| Deep dungeons | Side content | off | 154 | 154 | 154 |
| Gold Saucer | Side content | on | 27 | 27 | 27 |
| Relics & Field ops | Side content | on | 1,526 | 1,526 | 1,516 |
| Wondrous Tails | Side content | off | 91 | 91 | 0 |
| Variant & Criterion | Side content | off | 22 | 22 | 22 |
| PvP | Side content | off | 655 | 655 | 587 |
| Extreme (Legacy) | Hard content | on | 661 | 661 | 654 |
| Extreme (Current) | Hard content | off | 209 | 209 | 209 |
| Savage (Legacy) | Hard content | on | 886 | 886 | 886 |
| Savage (Current) | Hard content | off | 429 | 319 | 319 |
| Ultimate | Hard content | off | 136 | 136 | 136 |
| Events & promotions | Time-limited | off | 273 | 83 | 81 |

- "From it": pieces with a route through the box. "Needs it": pieces every route of which needs the box, so unticking it hides them, with the market board switch off and on.
- 4,718 of the 20,031 rows are tradeable; 1,110 have no route (970 base tomestone sets no longer sold, 75 base Radiant's, 65 Antiquated Heavensward).
- Relics & Field ops covers Eureka, Bozja and Occult Crescent gear and the relic weapons; Extreme (Legacy) also covers Baldesion Arsenal and Delubrum Reginae (Savage); Variant & Criterion is the Exquisite weapons, upgraded with Elevated Ester (the rest those dungeons sell is glamour).

**Checks.** The generator stops on an activity with no box (combat gear sold for scrips, for example), a hand-kept id with another name, or a category with no drop activity. Each error names the table to edit (section 9).

**Two flags for the categories.** `gear_sources.py` marks a piece **crafted** when it is the `ItemResult` of a recipe, and **ultimate** when an exchange listing sells it for one of the seven ultimate totems (Dreadwyrm, Ultima, Colossus, Dragonsong, Omega, Oracle, Mad Harlequin's). The category rules use them (the ultimate weapons share code 60 with trial gear) and cross-check them: the generator stops on a recipe result outside crafted, a totem purchase outside ultimate, or a Savage armor piece or weapon without a dye slot. The totem flag covers 136 weapons: the 16, 16, 18, 20, 22, 22 and 22 of the seven ultimates. Item names are not used: the Weapon's Refrain weapons end in "Ultima" and the Dancing Mad weapons are named "Palazzo Diamond". Which duty a totem comes from is not in the game files: six pairs match Teamcraft's data, and the Console Games Wiki says Mad Harlequin's Totem drops in Dancing Mad (Ultimate) (**verified** there; the game files still do not link them). The generator stops if any totem id no longer has its expected name.

### Stat factor kind

*Which percentage of its slot value does each stat on the piece get?* `BaseParamModifier` becomes the tenth field (position 9): the item's kind, a number from 0 to 12 that picks a column of the stat factor table (section 5). On that item each stat's full-share slot value is multiplied by its percentage in that column ([math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item)).

In the current data:

| Kinds | Gear | Rows |
| --- | --- | --- |
| 1, 2, 3 and 10 | Strength | 8,237 |
| 4, 11 and 12 | Dexterity | 4,496 |
| 5 | Intelligence | 3,209 |
| 6 | Mind | 3,319 |
| 7 | Strength and Dexterity | 411 |
| 8 | Intelligence and Mind | 297 |
| 9 | crafter and gatherer | none left in the database |
| 0 | at item level 100 and up, the 13 pieces with all four main stats and six earrings and rings with no main stat; 43 more below | 62 |

The generator stops if an item names a kind the table has no column for. **Verified** (game data): the kind is copied, not inferred.

### Materia slots

*Which materia can a piece take?* Two more fields record what a piece can be melded with. Both are copied from `Item`, not inferred (**verified**, game data):

- **meld slots**: `MateriaSlotCount`, the guaranteed slots, 0 to 5. The generator stops on a value outside that range or that is not a whole number. No piece in the database has more than 5;
- **overmeld**: 1 when `IsAdvancedMeldingPermitted` is `True` (overmelding, adding materia past the guaranteed slots at a risk of failure, is allowed), 0 when `False`; any other value stops the generator.

In the current data:

| Meld slots | Overmeld 0 | Overmeld 1 |
| --- | --- | --- |
| 0 | 4,140 | 15 |
| 1 | 1,725 | 1,085 |
| 2 | 8,842 | 3,484 |
| 3 | 129 | 29 |
| 4 | 0 | 16 |
| 5 | 566 | 0 |

Only 16 pieces have 4 slots, all with the overmeld flag. The 15 pieces with no slot but the overmeld flag are old crafted Paladin shields, item level 180 to 415 (for example Dwarven Mythril Shield). Whether they take any materia in game is not known (**inferred** that they take none: a piece overmelds only past its guaranteed slots, [materia.md, section 2](../mechanics/materia.md#slots-big-and-small-stones)).

### Rarity

Field 12 is `Item.Rarity`, the item's colour in game, copied as is (1 white, 2 green, 3 blue, 4 purple; **verified**, game data): 2,844, 7,333, 9,236 and 618 rows in the current data (2026-10-16). A value that is not a whole number stops the generator. Only the accuracy check reads it: on green, HQ-able healer pieces with three substats, Direct Hit is 25%, not 20% ([math.md, section 4](../mechanics/math.md#substat-shares-empirical)).

### Game id

Field 13 is the item's row id in `Item`, the id the game, its data files and other tools use for the item (**verified**, game data). Ids are unique; a duplicate or a value that is not a whole number stops the generator. The page does not show it. It lets a piece be matched with other tools: the check against ffxiv-gearing's sync caps (roadmap A5) and checks against xivgear. It adds about 0.1 MB to the file.

### Scales with level

Field 14 is 1 when `Item.SubStatCategory` is 2, else 0: gear whose item level follows the wearer's level, which level sync lowers whatever its equip level ([math.md, section 5](../mechanics/math.md#which-pieces-are-synced)). The game's description of each of these pieces says so (**verified**, game data).

- 260 rows in the current data: 127 level 89 and 127 level 99 boost pieces (item level 560 and 690), Bozjan Earring (equip level 71) and five gift accessories at equip level 1.
- The column takes only 0, 1 and 2 in the whole `Item` sheet (1 is never on a database row). Any other value stops the generator, since it might be a new kind of scaling.

### Gear category

*Where, in plain words, does a piece come from?* The category field (position 15, counting from 0; the damage and defense values follow) is the piece's gear category, which a piece with no way in takes its route from (section *Sources*; every code in [subcategory-sort-codes.md](subcategory-sort-codes.md)). It is stored as an index into the category list of the shared format file, which also gives each category its label. The page shows the label on each piece of an optimizer result, so a player can see where a piece comes from and pick an easier one with the same result (roadmap A9).

**Checks.** The list must hold every category a kept piece can have (the generator's categories minus the three left out) exactly once and nothing else. A missing, unknown or repeated key stops the generator, so a category added after a patch can't reach the page without a label.

**Counts.** The 24 categories in the current data, by rows: crafted 5,243, dungeon 3,942, tomestone 2,882, Savage 1,117, raid 1,029, artifact 904, trial 862, field op 856, relic 748, alliance raid 679, PvP 532, Grand Company 494, collaboration 181, deep dungeon 154, ultimate 136, Wondrous Tails 91, quest 52, venture 37, gil vendor 28, Gold Saucer 26, achievement 17, FATE 11, promotional 6, seasonal event 4. It adds about 40 KB to the file.

### The materia table

*What does each grade of materia add, and to which gear?* The item file also holds one small table, one entry per materia grade I to XII, with three fields per grade. The values, gates and high grades themselves, and their evidence, are in [materia.md, section 2](../mechanics/materia.md#2-the-rules).

- **Value** $v_g$: what grade $g$ adds to a combat substat, read from `Materia`, `Value[g − 1]`.
- **Gate** $L_g$: the lowest gear item level that takes grade $g$, read as the `LevelItem` of the grade's materia item.
- **High**: whether the grade cannot go past the first overmeld slot, read as a 0% rate in the second overmeld slot of its `MateriaGrade` row (`OvermeldNQPercent[1]` = 0).

How it is built:

1. Take the `Materia` rows of the seven combat substats whose first materia item is not empty. Exactly one row per substat must be left.
2. Each row must have 12 positive values and 12 materia items with a `LevelItem`, nothing in the item and value columns after the twelfth, and gates that never decrease from one grade to the next.
3. All seven rows must agree on values and gates.
4. The high grades must be exactly the grades worth more than each grade next to them: $v_g > v_{g-1}$ and $v_g > v_{g+1}$ where those exist (VI: 16 against 6 and 8). This ties the two sheets together; a patch that changed one without the other stops the generator.

Any violation stops the generator with an error naming the rows.

**Decoy rows.** Most of the `Materia` sheet is rows with values but no materia items:

- 1,377 of its 1,417 rows, ids 39 to 1416, 1,372 of them for a combat substat (ids 44 to 1416; Determination and Critical Hit 259 each, Direct Hit 247, Skill Speed 181, Spell Speed 157, Tenacity 150, Piety 119).
- Their values do not follow the table (row 44, Direct Hit: 2, 3, 4 and then nothing).
- No materia item points to them, so they are not materia a player can meld; what the game uses them for is not known.
- Step 1 skips them by their empty first item. The generator counts them but does not print the count.

Only 25 rows carry items: the seven combat substats; the main stat, Vitality and resistance rows (items, every value 0); six crafter and gatherer stats with their own values; and row 1, Cracked Materia (no stat).

### Row format and order

Each database row is a fixed list of twenty fields, in the order of `itemRow.fields` in the shared format file (section 3):

| Field | Type | Meaning |
| --- | --- | --- |
| name | text | Item name as in the English client. |
| slot code | integer 0 to 14 | Slot, per the shared slot table. |
| item level | integer | The item's own item level (`LevelItem`), 15 to 795 in the current data. |
| equip level | integer | Character level needed to wear it (`LevelEquip`). |
| job mask | integer, $0 < \text{mask} < 2^{23}$ | Who can equip it, as defined above. |
| stats | 14 comma-separated integers | Stat values in the shared stat order, HQ bonus included when the item can be HQ. |
| unique | 0 or 1 | 1 when only one copy can be worn. |
| hq | 0 or 1 | 1 when the item can be high quality (`CanBeHq`), so its stats are the HQ ones; the page marks it HQ. |
| routes | list of integers | Ways to get it: bit masks over the 20 "Gear from" boxes, bit 20 the market board; empty when it can no longer be obtained (section *Sources*). |
| stat factor kind | integer 0 to 12 | `BaseParamModifier`: the column of the stat factor table (section *Stat factor kind*). |
| meld slots | integer 0 to 5 | `MateriaSlotCount`: guaranteed materia slots (section *Materia slots*). |
| overmeld | 0 or 1 | 1 when overmelding is allowed (`IsAdvancedMeldingPermitted`). |
| rarity | integer | `Item.Rarity` (section *Rarity*). |
| game id | integer | The item's row id in `Item` (section *Game id*). |
| scales | 0 or 1 | 1 when its item level follows the wearer's level (section *Scales with level*). |
| category | integer 0 to 23 | Its gear category, an index into the format file's category list (section *Gear category*). |
| physical, magic weapon damage | integers | `DamagePhys`, `DamageMag`, HQ bonus included when the item can be HQ; 0 on anything but a weapon. |
| defense, magic defense | integers | `Defense`, `MagicDefense`, HQ bonus included when the item can be HQ. |

The example row is

| name | slot | item level | equip level | job mask | stats | unique | hq | routes | kind | meld slots | overmeld | rarity | game id | scales | category | damage | defense |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Void Ark Helm of Fending | 3 | 200 | 60 | 15 | 46,0,0,0,45,0,0,0,0,35,50,0,0,0 | 1 | 0 | [4] (Normal duties) | 1 | 0 | 0 | 3 | 13119 | 0 | 5 (alliance raid) | 0, 0 | 242, 242 |

The file holds the rows and the materia table next to each other, under the same source record (section 6).

Rows are sorted by item level (highest first), then slot code, then name. The stats are stored as one string per row to keep the file small; the page splits it when it reads a row.

**One row per line.** The file is JSON with each database row on a line of its own (and the source record, materia table and tomestone names on one line each), so after a patch `git diff` lists the rows added, removed or changed. The other generated tables are written the same way: one stat, level or job per line in the item level file, one meal per line in the food file. The line breaks cost about 20 KB in the item file and nothing in the page, which the bundler minifies (section 8).

## 5. Item level table and level data

*What, besides the gear itself, does the stat math need?* The formulas turn an item level into stats, a character level into speed constants, and an item's kind into stat percentages. The second generator writes one file with all of that, in six parts.

**Stat budgets.** For each of the 14 stats, the `ItemLevel` column of that stat as a list indexed by item level: $\text{budget}_s(\ell)$ for $\ell = 0, \dots, 920$. The ids must run 0, 1, 2, ... without gaps, so that the list position equals the item level; the generator stops with an error otherwise. The budget curves and example values are in [math.md, section 2](../mechanics/math.md#2-the-budget-table); how a budget becomes the stat on a piece is in [math.md, section 4](../mechanics/math.md#4-the-stats-on-a-piece).

**Level data.** For character levels 1 to the top level, three `ParamGrow` columns, each stored as a list indexed by level. The top level is read from the sheet, not written in the code: it is the highest row with an `ItemLevelSync`, 100 today. The rows above the level cap are zero (101 to 200), and the last row (201) holds 100 and 100 with no `ItemLevelSync`, so neither counts. A level cap raised by a patch therefore lengthens the list by itself; a unit test then checks that every table keyed by level reaches the new cap (section 10).

| Column | Meaning | Used in |
| --- | --- | --- |
| BaseSpeed | a character's own speed stat, no gear | [speed](../mechanics/math.md#6-speed-and-substat-tiers) |
| LevelModifier | the divisor in the speed formulas | [speed](../mechanics/math.md#6-speed-and-substat-tiers) |
| ItemLevelSync | item level gear is synced to at that level | [level sync](../mechanics/math.md#which-pieces-are-synced) |

A missing column, or a level from 1 to the top with a missing row or a value that is not a positive whole number, stops the generator with an error. The values at levels 90 and 100 are in [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers); the `ItemLevelSync` mapping and when a piece is synced are in [math.md, section 5](../mechanics/math.md#which-pieces-are-synced).

**Stat factor table.** For each stat, its `BaseParam` row's 13 `MeldParam` columns, in percent: $f_s(k)$ for item kind $k = 0, \dots, 12$. For example:

- Vitality is 90 in columns 0, 5, 6 and 8 and 100 elsewhere;
- each main stat is 90 in column 0, 100 in the columns of gear that carries it (and in column 9) and 70 in the rest;
- Critical Hit, Determination, Direct Hit, both speeds and Tenacity are 100 everywhere.

How it is used is in [math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item).

**Weapon damage and defense.** The same three tables for physical and magic weapon damage and Defense and Magic Defense (`damageDefense` in the shared format definition): the `ItemLevel` columns `PhysicalDamage`, `MagicalDamage`, `Defense` and `MagicDefense` as budgets, the `MeldParam` columns of `BaseParam` rows 12, 13, 21 and 24 as factors, and their slot shares per slot code (`SHARES`, per mille, from the same `BaseParam` rows; the 14 stats keep their shares in the format file). They cap these values under sync ([math.md, section 4](../mechanics/math.md#weapon-damage-and-defense)).

**Job modifiers.** For each of the 23 combat jobs, its `ClassJob` modifiers of Strength, Dexterity, Intelligence, Mind and Vitality, in percent (`jobModifiers` in the shared format definition): the character's base main stat and Vitality are the level's base times these ([math.md, section 6](../mechanics/math.md#totals-as-on-the-character-panel)). A job with no row, or a modifier that is not a positive whole number, stops the generator.

**Not from the game files.** `LEVEL_MAIN` (`src/core/constants.js`: the main stat base at each level, 1 to 100; food is a percentage of the whole stat) is carried by hand from AkhMorning's Level Modifiers table (**inferred**: no sheet holds it; it equals xivgear's at levels 50, 60, ..., 100). The generators do not touch it, so a patch that raises the level cap needs its new levels added by hand; the level table test fails until they are.

**Source record.** Which datamining commit the data came from (next section).

### The food table

A third generator writes the meals that raise combat substats, one row per meal: name, item level, and the HQ percent and maximum of each substat, primary first. Which rows are meals and which are kept is in the `food` part of the shared format definition (section 3):

- **a meal** is an `Item` row in the Meal category (46) whose `ItemAction` is a food action (844 or 845) with the Well Fed status (48); its `ItemFood` row is `Data[1]`. Medicine (tinctures) uses `ItemFood` too, with another category and action, and is left out;
- **kept**: meals that can be HQ, whose stats are all percentages and all combat stats (Vitality and the seven substats), with at least one substat. That leaves out crafter and gatherer meals and the flat-bonus novelty meals of item level 15 and below;
- **carried**: the HQ percent and maximum of each substat in `ItemFood` order, and the meal's Vitality apart from them (`[percent, max]`, or null).

A meal whose `ItemFood` row is missing, or a kept stat whose HQ percent is not 1 to 100 or whose maximum is not positive, stops the generator. In the current data: 296 meals, 255 with two substats and 41 with one; every kept stat is 10% HQ (**verified** by count). How the page uses them is in [math.md, section 6](../mechanics/math.md#food).

## 6. Provenance

*Which version of the game does the page's data describe?* When the data is regenerated, the commit id and commit date of the local datamining clone are recorded. They appear in three places:

- in the item, item level and food files, a one-line "do not edit" notice naming the repository, the full commit id and the date;
- in those three files and the most-speed file, a source record (repository, commit, date); the page reads it from the item level file; next to it, `formatVersion`, the version of the shared format the file follows (section 3);
- the page footer, as "Game data: ffxiv-datamining" plus the short commit id and the date. The current footer reads `Game data: ffxiv-datamining d9582a6, 2026-09-30`.

The full regeneration refuses to run when it cannot read the clone's commit. A generator run on its own (for example on test files) writes "commit unknown" and no source record, and the footer then shows nothing.

**Edited clones.** The record names a commit, not the files, so data generated from a CSV edited in the local clone would claim to be that commit's. The full regeneration therefore refuses to run while any tracked file in the clone differs from its commit, and lists the files. `regen.py --allow-dirty` runs anyway, with a warning, for trying out an edit; what it writes should not be committed. Untracked files in the clone are not checked: the generators read only tracked sheets.

**The input files.** The summary file (`src/data/summary.json`, section 9) also records the git blob id of each of the twenty CSVs at that commit (`git ls-tree <commit> csv/en` gives the same ids). Two summaries thus show which sheets a patch changed, and a reader can check that a CSV is the exact file the data was made from (`git hash-object <file>`).

**Reproducing older data.** Since every generated file names the full commit, its data can be rebuilt with `fetch.py --commit <id>` followed by `regen.py` (section 2).

**The newest commit, not the newest change.** The recorded commit is the clone's newest commit, not the newest commit that changed one of the fetched sheets. Commit `d9582a6` ("TC 7.25") changed no English CSV. Six of the sheets were last changed by:

| Sheet | Last changed in |
| --- | --- |
| `Item` | `a67c23b`, patch 7.56, 8 September 2026 |
| `ClassJobCategory` | `d71de32`, 7.56 hotfix 1, 17 September 2026 |
| `ItemLevel`, `BaseParam` | `50686a9`, patch 7.50, 28 April 2026 |
| `ParamGrow`, `EquipSlotCategory` | `d3eb86d`, exporter migration, 4 January 2026 |

## 7. Facts about the current data

| Fact | Value |
| --- | --- |
| Database rows | 20,031 |
| Lowest / highest item level in the database | 15 / **795** (66 rows at 795) |
| `ItemLevel` rows | 921 (ids 0 to 920) |
| Level data | levels 1 to 100 |
| Unique rows | 14,458 |
| Rows wearable by every job | 1,531 |

Rows per slot:

| Slot | Rows | Slot | Rows |
| --- | --- | --- | --- |
| two-handed weapon | 5,011 | feet | 1,953 |
| one-handed weapon | 414 | earring | 1,062 |
| off-hand | 357 | necklace | 1,058 |
| head | 2,004 | bracelet | 1,059 |
| body | 2,087 | ring | 1,091 |
| hands | 1,956 | body covering the head | 21 |
| legs | 1,952 | legs covering the feet | 5 |
| | | body covering hands, legs and feet | 1 |

### Item levels above 795

*The budget table goes up to item level 920; why does the page stop at 795?* The `ItemLevel` sheet has rows up to 920, but no gear has an item level above 795. The page therefore limits item level inputs to the highest real item level, which it computes from the database rather than storing.

Where the extra rows come from (**verified** against the datamining repository's history for `ItemLevel.csv`, which has two commits):

| Snapshot | Rows | Highest gear item level |
| --- | --- | --- |
| January 2026, exporter migration (`d3eb86d`) | 901 (ids 0 to 900) | 795 |
| Patch 7.50, April 2026 (`50686a9`) | 921 (ids 0 to 920) | 795 |

- **What changed between the two.** 20 rows were added (901 to 920) and 120 existing rows changed, from row 766 up. In rows 766 to 795 only crafting and gathering columns changed (CP, Control, Craftsmanship, GP, Gathering, Perception); the 12 combat stat columns this project uses changed only in rows 796 to 900.
- **So real gear is unaffected.** Every row that real gear uses is the same in both snapshots. The current `ItemLevel.csv` is identical to the 7.50 one.

**What the rows are.** Since these rows are in the client's own data, they are not something the miners added. The values climb smoothly and almost linearly: from row 896 to row 920, Mind goes from 10,415 to 11,742, each substat from 4,385 to 4,626, and Vitality from 11,409 to 13,163. That looks like budget room prepared ahead of gear that is not released yet, but that is an **inference**: the data cannot show intent, and nothing above 795 can be checked against a real item.

## 8. Building the page

The page bundle takes the page code, the stylesheet and the generated data files (items, item levels, food, job icons) and writes them into one HTML file, so the data is part of the code, not loaded at run time. How the build works, and why the page still runs offline, is in [architecture.md, section 5](architecture.md#5-build).

| Part | Size |
| --- | --- |
| item database (generated file) | 2,422,348 bytes |
| item level table, level data and stat factor table (generated file) | 78,584 bytes |
| job icons (generated file) | 216,622 bytes |
| food (generated file) | 18,290 bytes |
| most speed per level (generated file) | 575 bytes |
| finished page, minified | 2,964,555 bytes (about 3.0 MB) |

Measured 2026-10-19 on datamining commit `d9582a6`, a `dev` build. The generated files hold one row per line (section 4); the bundler minifies them, so the line breaks do not reach the page, which was byte for byte the same before and after them. Without them the item database is 2,402,310 bytes, about 81% of the page; the icons are about 7%.

## 9. Updating after a game patch

One command, `npm run update-data`, does steps 1 and 2.

1. **Fetch**: pull the newest CSVs into the local clone.
2. **Regenerate**: run the generators (the data files record the new commit) and rebuild the page. It refuses to start while a CSV in the clone has local edits (section 6). Each step prints one line naming it (a progress bar instead when the optional `tqdm` package is installed). The item database step also prints its funnel line (section 4): compare it with the last run's, and look into any rule whose count jumped. It then prints the inferred routes line (section 4, *Sources*): a jump there means many new pieces or currencies were placed by a fallback rule rather than the game files. The only other output is a warning when a patch adds multi-slot gear with no slot code; read it before going on.
3. **Compare**: the last step before the build writes `src/data/summary.json` and compares its counts with the committed one (see below). Read every count it names.
4. **Check**: run the full check (lint, build, unit tests, generator tests, browser smoke test). Every test must pass.
5. **Review** the change in the generated files with `git diff`: each changed item, budget column, level or meal is its own line (section 4). Then update counts quoted in the docs, such as the 20,031 rows above, and add a few words to the new line in [data-changelog.md](../data-changelog.md).

**The summary and the drift check.** `scripts/data/summary.py` writes `src/data/summary.json`: the source record, `formatVersion`, the blob id of each CSV (section 6) and the counts a patch could change without any check failing: the selection funnel (rows each rule left out, the `LEFT_OUT` categories, dangling ids), the rows kept, the highest item level, the rows per slot code, per gear category and per "Gear from" box, the pieces with no route, the inferred routes by activity, and the meals. Before writing it, it reads the committed one, and prints every count that moved by more than 10% (and by more than 5), appeared or went away, for example `byCategory.savage 1,117 -> 0 (-100%)`; otherwise `No count moved by more than 10% since the last run`. It only warns: a patch that adds a tier of gear moves several counts on purpose. When the source commit has no line in [data-changelog.md](../data-changelog.md) yet, it adds one (date, short commit, its message, rows and meals with their change); `--allow-dirty` runs skip that.

Some test expectations are allowed to move after a patch and others must not; the list is in [testing.md, section 6](testing.md#6-after-a-game-patch).

**When the regeneration stops.** Each error says what to edit:

| Error | Edit |
| --- | --- |
| a sheet is missing columns | the shared format definition or the generator that reads them |
| slot shares differ from the format file | the slot `percent`s in the format file, after checking the math |
| a yes/no column holds other values | the generators that read the column |
| an activity has no box | `ACTIVITY_BOX` in `gear_activities.py` (and `activities` in the format file for a new box) |
| no drop activity for a category | `DROP_ACTIVITY` in `gear_activities.py` |
| an unknown `SubcategorySort` code | `gear_categories.py`, see [subcategory-sort-codes.md](subcategory-sort-codes.md) |
| hand-kept ids changed | the table it names: `CURRENCIES`, `KNOWN_SOURCE`, `FIXED_ITEMS`, `RETIRED_SHOPS`, `ITEM_OVERRIDES`, `CURRENCY_OVERRIDES` or `ULTIMATE_TOTEMS` |
| a most-speed search stopped at its node limit | its node limit in `gen_max_speed.mjs` |

A hand-kept id that changed means a patch reused it: find the item by its expected name in `Item.csv` and update the id.

**When a patch changes the format.**

- If a patch adds a job or a stat, follow the checklist below; the format test fails until the shared format definition and the page's tables agree.
- If a patch raises the level cap, the level data, the item database's level cap and the most-speed table follow the data by themselves. The hand-kept tables do not, and the level table test fails, naming each one, until they reach the new cap: the main stat base per level (`LEVEL_MAIN`), the expansion list (`EXPANSIONS`, add the new expansion) and the haste steps (`HASTE`, any new trait level).
- If a patch renames a column the generators read, or changes a slot share in `BaseParam`, the regeneration stops with an error naming it (section 1). Update the shared format definition (and, for a slot share, check the math) rather than working around it.

### Adding a job or a stat

Derived from the commit that added Beastmaster (`c31ff55`, patch 7.56) and its follow-up `56fe76b`; the stat steps come from reading the same code. Files under `src/` and `tests/` unless marked.

**A job:**

| File | What changes |
| --- | --- |
| `core/item-format.json` | append the job to `jobs` (append only, so no other job's bit moves; the job mask has room for 8 more jobs in a 32-bit integer) |
| `core/constants.js` | its name and role profile in `JOB_INFO`; its row in `JOB_ROWS` (the picker's order); `ONE_HANDED_JOBS` if it uses a shield; `JOB_LEVEL_CAPS` if it is a limited job (the cap from the patch notes); `HASTE` if it has always-on haste; `NO_WEAPON_DAMAGE_JOBS` if it has no weapon damage |
| `core/job-context.js` | nothing for a job like the others; Beastmaster added `maxLevel` for limited jobs, which now covers any |
| `ui/` (state, store, views, `index.html`) | nothing for a job like the others; Beastmaster made the level inputs, restore and the optimizer pool follow `maxLevel` |
| `scripts/validate/gearing/run.mjs`, `scripts/validate/xivgear/run.py` | the job list (typed out in both) |
| `tests/data/fixtures/ClassJob.csv`, `ClassJobCategory.csv` | the job's real rows and column |
| `tests/data/test_generators.py` | `ALL_JOBS_MASK` (all jobs' bits); the job count in the job modifier test |
| `tests/unit/stat-factor.test.js` and others | the all-jobs mask ($2^{n} - 1$); tests for a new rule (Beastmaster: level cap, shield, its own gear) |
| `tests/e2e/smoke.mjs` | a check of what is new on the page (Beastmaster: the level cap in the inputs) |
| data | `fetch.py` (the new job's icon), then `regen.py`; the job's `ClassJob` modifiers and icon number are read by job abbreviation |
| docs | `CLAUDE.md` jobs table; this page, section 3 (job order); [math.md](../mechanics/math.md), [optimizer.md](optimizer.md), [testing.md](testing.md), [validation.md](../mechanics/validation.md) and the glossary where they count or list jobs |

**A stat** (a new combat stat on gear):

| File | What changes |
| --- | --- |
| `core/item-format.json` | append to `stats` (key, `ItemLevel` column, `BaseParam` id), so existing positions keep their meaning; add it to `materia.statKeys` if materia raise it, and to `food` if meals do |
| `core/constants.js` | the neutral key and role profiles (`PROFILES`, `ALL_STATS`) if jobs use it; names and short names for the page |
| `tests/data/fixtures/BaseParam.csv`, `ItemLevel.csv` | the stat's real `BaseParam` row; its `ItemLevel` column |
| `tests/data/test_generators.py` | `STAT_ORDER` and the item level column map |
| data | `regen.py`: every row gains a value in its stats string, and the slot shares of the new row are checked against the format file |
| docs | this page, section 3 (stat order table); [math.md](../mechanics/math.md) |

## 10. How the pipeline is tested

*How do we know the generators read the right columns, and that the page reads the rows the way they were written?* Two suites: generator tests on small test files, and format tests on the real generated data. Two smaller groups cover the job icons and provenance, and one manual check compares the source flags with the Lodestone.

**Generator tests** (Python, on small test CSVs in the test folder):

- **Test files.** They use the real sheet headers. The `EquipSlotCategory` and `ClassJobCategory` rows are copied from the real sheets; the `Item` rows are made-up test items built on the real header.
- **Synthetic values that expose a wrong column.** `ItemLevel` values are synthetic: the value in row $r$, column position $c$ is $1000\,r + c$, so reading the wrong column shows up as a wrong number. `ParamGrow` is written by the test with distinct values per column ($1000 + \ell$, $2000 + \ell$, $3000 + \ell$ for level $\ell$).
- **Real rows where the values matter.** The `BaseParam` test file holds the real rows of the 14 stats.
- **What they check.** Slot detection (two-handed vs one-handed, every slot type, the cloak's own slot code and an unsupported multi-slot piece), exclusions (belt, soul crystal, missing or non-gear category, base-class-only, crafter-only, unknown category, no stats, empty name, item level 99), stat placement including a stat in the sixth pair after empty ones, the HQ rule in both directions, job mask bits, the Unique flag, sort order, the 14 `ItemLevel` columns, the stat factor kind and the meld fields of a few items, the materia table (with two decoy rows in the `Materia` test file, which holds 12 real rows; `MateriaGrade` is the whole real sheet and `Item` also holds the 84 real materia items of the seven combat substats), the stat factor table (the `BaseParam` test file holds the real rows), the rarity field, the source flags and gear categories, the category field and its list's check (a missing, unknown or repeated key), the funnel counts (they add up to the whole `Item` test file), one item row per line and one level data entry per line, the top level read from `ParamGrow` (100, or 110 for a sheet that goes on, with the zero rows above the cap left out), and the errors for a missing level and for non-contiguous `ItemLevel` ids. Two smaller checks cover the pinning: the fetch step takes only a full 40-digit commit id, and an edited tracked file in a test git clone counts as a local edit while an untracked file does not.
- **Schema drift**, on edited copies of the test files. Each of these stops the generator with an error naming the sheet and column, and no file is written:
  - a renamed job column (`SGE` to `SAGE`), job values written as `1` instead of `True`;
  - `CanBeHq`, `IsUnique` or `IsUntradable` in `Item`, or `IsRelative` in `ItemFood`, written as `1`/`0`;
  - missing `EquipSlotCategory` columns, missing `Item` columns, a missing `ItemLevel` stat column, a missing `ParamGrow` column;
  - a `BaseParam` slot share that differs from the page, a missing `BaseParam` column, a missing stat row, a missing `MeldParam` or `BaseParamModifier` column, a stat factor of 0, an item kind with no `MeldParam` column;
  - a missing meld column in `Item`, `Materia` or `MateriaGrade`, a slot count of 6, an overmeld value other than `True`/`False`, a rarity that is not a whole number, a negative or malformed weapon damage or defense value;
  - combat materia rows that disagree on a value or a gate, a decoy row that gains an item, a missing combat materia row, a thirteenth grade, high grades that no longer match the values;
  - a changed ultimate totem id, missing shop columns, and a renamed crafter or gatherer stat.

  Run from the command line, the generator exits with status 1 and a one-line message.

**Format tests** (Node, on the real generated data):

- the page's job order, stat order and slot table equal the shared format definition;
- the budget table has one column per stat, all the same length, and each level data row has three values;
- every table keyed by level reaches the level cap (the highest equip level in the database): the level data, the most-speed table, and the hand-kept main stat base per level, expansion list and haste steps. A patch that raises the cap fails here, naming the table to extend, instead of showing NaN on the page;
- every generated data file but the icons names the shared format's `formatVersion`, and the page's `ROW` names the positions of `itemRow.fields`;
- every database row has twenty fields (an item level within the `ItemLevel` table, so the page never reads past its end, an item kind below 13, meld slots 0 to 5, a 0/1 overmeld flag, a whole-number rarity, a positive game id (ids unique), a 0/1 scaling flag, a category index, then the four weapon damage and defense values), a valid slot code, a job mask in $(0, 2^{23})$, 14 stats, 0/1 Unique and HQ flags and a list of routes, each below $2^{21}$; the meld fields sit where the shared format says; the materia table has 12 positive values, non-decreasing gates and high grades between 1 and 12; the stat factor table has one row of percents per stat and 13 columns;
- the slot shares the page uses (per slot, per weapon mode and per job) equal the `percent`s in the shared format definition;
- every job has at least one item for each of its active slots, with the weapon matching its weapon mode. One exception is listed in the test: Blue Mage weapons exist in `Item` (10 rows) but carry no stats, so none are in the database. The test fails if that changes.

**Job icon tests**: the generator tests check the icon numbering, a missing icon and a file that is not a 64 × 64 PNG; a format test (Node) checks that every job is in the picker exactly once and has an embedded 64 × 64 PNG.

**Provenance tests** (Node): the source record names the datamining repository, a full 40-character commit id and an ISO date; the item, item level, food, most-speed and summary files carry the same source record, and all but the most-speed file name its commit in their notice; the footer text is short and empty when the source is unknown.

**Source flags against the Lodestone** (a manual check, not part of the test suite):

- **Sample.** 175 randomly chosen pieces (two samples: 15 and 20 per flag plus twice as many unflagged pieces), each compared with its Lodestone item page at one request every 2.5 seconds. A page counts as crafted when it links a recipe, tomestone when a shop cost is an Allagan Tomestone, ultimate when a cost is an ultimate totem.
- **Result.** 167 agree. No crafted, ultimate or unflagged piece disagrees.
- **The 8 differences.** All are tomestone pieces the page shows no tomestone for, and each has a known cause: the game files still hold a retired tomestone shop that sells it (Quetzalli, Moonward: the page shows only today's Sack of Nuts exchange; Radiant's: the page lists no source at all), or the piece is made from tomestone gear (Augmented Bygone Brass from Bygone Brass plus a glaze or twine, Exquisite Isnae Phis from Augmented Isnae Phis plus an Elevated Ester).
- The first sample found two generator bugs, both fixed (see [history.md](../history.md)).

## Claims and their status

The claims on this page that rest on evidence outside the code, collected from the sections above.

| Claim | Status | Evidence |
| --- | --- | --- |
| The CSVs are the client's own rows; exporter changed in January 2026 | verified | repository history, commit `d3eb86d` (section 1) |
| Slot shares in the format file equal `BaseParam` | verified | checked on every regeneration (section 1) |
| The yes/no columns hold only `True` and `False` | verified | checked on every regeneration (section 1) |
| No most-speed search stops at its node limit | verified | full run, 2026-10-19 (section 2) |
| Job icon number is $62100 + r$ | verified | all 23 icons looked at (section 2) |
| Main Attribute and Secondary Attribute mapping | second-hand; tank case inferred | xivgear's tests (section 3) |
| The four main-stat budget columns are equal | verified | game data (section 3) |
| Item level floor of 15 | owner's decision | 2026-10-15; Sastasha has no item level sync, verified (section 4) |
| Code 250 gear has random secondary attributes | second-hand | item text (section 4) |
| HQ bonus only when `CanBeHq` | verified by count | 328 rows, 325 selected (section 4) |
| Beastmaster's Crucible bonus applies only in the Crucible | second-hand | Console Games Wiki (section 4) |
| PvP sets have normal stats outside PvP | verified | Lodestone, patch 7.56 (section 4) |
| Client sheets hold no dungeon loot | verified | four loot sheets hold no item ids (section 4) |
| Mad Harlequin's Totem comes from Dancing Mad | verified | Console Games Wiki (section 4) |
| Crafted, tomestone and ultimate flags | verified | 167 of 175 agree with the Lodestone (section 10) |
| Kind, meld fields, rarity, game id, scaling flag | verified | copied from game data (section 4) |
| The 15 shields with no slot but the overmeld flag take no materia | inferred | [materia.md, section 2](../mechanics/materia.md#slots-big-and-small-stones) (section 4) |
| Every kept meal stat is 10% HQ | verified by count | section 5 |
| `ItemLevel` rows 796 to 920 are budget room for future gear | inferred | smooth, near-linear values (section 7) |

## Where this lives

| Concept | File |
| --- | --- |
| Fetch (sparse clone, `--commit`, job icons) | `scripts/data/fetch.py` |
| Shared format definition | `src/core/item-format.json` |
| Item row field positions | `itemRow.fields` in `src/core/item-format.json` (each section's `rowField` agrees); `ROW` in `src/core/constants.js` |
| Format loading, CSV reading, the column, yes/no and slot share checks, the stat factor table, the row field names | `scripts/data/item_format.py` (`read_csv`, `check_bools`, `check_slot_percents`, `stat_factors`, `row_fields`) |
| Item database generator; materia table and decoy rows; selection rules and their funnel line | `scripts/data/gen_items.py` (`materia_table`, `select`, `DROP_RULES`, `drop_report`) |
| Gear categories (subcategory codes, Savage currencies; the list of categories) | `scripts/data/gear_categories.py` (`CATEGORIES`) |
| Category list and labels; current-only Savage group | `category.list` and `currentOnly` in `src/core/item-format.json` |
| "Gear from" routes | `scripts/data/gear_activities.py` |
| Crafted and ultimate flags | `scripts/data/gear_sources.py` |
| Meld fields of an Item row | `scripts/data/item_format.py` (`meld_fields`), `materia` in `src/core/item-format.json` |
| Meld fields of a pool item | `src/core/items.js` (`parseRow`, `meldInfo`) |
| Item level table, level data and stat factor table generator | `scripts/data/gen_item_level.py` |
| Food table generator; which meals, `food` in the format file | `scripts/data/gen_food.py`, `src/core/item-format.json` |
| Job icon generator | `scripts/data/gen_job_icons.py` |
| Most speed per level generator (the GCD speed slider's top) | `scripts/data/gen_max_speed.mjs` |
| Source commit detection, the edited-clone check, the generated-file notice and the one-row-per-line writer | `scripts/data/provenance.py` (`detect`, `local_edits`, `note`, `json_lines`) |
| Regenerate everything; refuse an edited clone (`--allow-dirty`) | `scripts/data/regen.py` (`npm run update-data` runs fetch, then this) |
| Counts, CSV blob ids, drift since the last run, the changelog line | `scripts/data/summary.py` (`summarize`, `drift`, `csv_blobs`), `src/data/summary.json`, `docs/data-changelog.md` |
| Step lines, or a progress bar when the optional `tqdm` package is installed | `scripts/data/progress.py` |
| Generated data (never edit by hand) | `src/data/items.json`, `src/data/item-level.json`, `src/data/food.json`, `src/data/job-icons.js`, `src/data/max-speed.json`, `src/data/summary.json` (not part of the page) |
| Tables, materia table, highest real item level, footer text | `src/core/tables.js` (`MATERIA`, `MAX_REAL`, `MAX_ILVL`, `dataSourceLabel`) |
| Page's job, stat and slot tables; slot shares read from the format file | `src/core/constants.js` |
| Page bundle | `scripts/build/build.mjs` (`npm run build`) |
| Generator tests and test CSVs | `tests/data/test_generators.py`, `tests/data/test_food.py`, `tests/data/fixtures/` (food: `fixtures/food/`; run by `npm run test:data`) |
| Format, level table and provenance tests | `tests/unit/data-format.test.js`, `tests/unit/level-tables.test.js`, `tests/unit/provenance.test.js` |
| Local CSV clone (gitignored) | `data/ffxiv-datamining/csv/en/` |
| Diagrams | `docs/diagrams/data-flow.svg`, `docs/diagrams/data-item-row.svg`, `docs/diagrams/data-selection.svg` |
