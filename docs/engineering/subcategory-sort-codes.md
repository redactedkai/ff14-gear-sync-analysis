# SubcategorySort codes on gear (working notes)

The page lets a player hide gear by where it comes from (crafted, tomestone, Savage raid, ...), but the game files have no documented "source" column. This page is the reference for the undocumented column the project uses instead, `Item.SubcategorySort`: what each of its codes means on gear, how each meaning was checked, and the two extra signals (shop data and dye slots) that the item database generator adds where a code is not enough.

Related pages: [data-pipeline.md, section 4](data-pipeline.md#gear-category) (how the categories become the page's source groups), [glossary.md](../glossary.md) (Savage, Ultimate, relic weapon, Field Op, tomestones, Diadem gear).

## How a code is read

`SubcategorySort` is a number on every item. On gear, only its last three digits say where the piece comes from; the digits above them vary between pieces of one source, even within one set. For example (read from the local game files with `docs/scratchpad/docs-rewrite/subcat-examples.py`, 2026-10-16):

| Piece | SubcategorySort | Code |
|---|---|---|
| Ironworks Helm of Fending | 8100 | 100 (tomestone) |
| Ironworks Robe of Healing | 47100 | 100 (tomestone) |
| Ironworks Magitek Sword | 2100 | 100 (tomestone) |
| Curtana Zenith (relic, item level 90) | 1010 | 10 (relic) |
| Curtana Atma (relic, item level 100) | 1011 | 11 (relic) |
| Kidomaru | 5350 | 350 (FATE) |

So the code of item $i$ is

$$
\text{code}(i) = \text{SubcategorySort}(i) \bmod 1000 .
$$

Outside gear, the same digits mean other things. Nothing in the game documents these codes: every meaning below was inferred from the pieces that carry the code and then checked against the wiki or the Lodestone (the official site).

**How the generator uses a code.** For each piece it keeps, the generator takes the steps below; a code that is not in the table stops the run, so a new kind of gear after a patch is noticed rather than filed under a wrong category.

![Five steps traced for three real pieces at game data d9582a6. SubcategorySort: Curtana Zenith 1010, Ironworks Robe of Healing 47100, Neophyte's Ring 49370. Code, SubcategorySort mod 1000: 10, 100, 370. Look up the code in the table: Relic, Tomestone, Field Op; a code missing from the table stops the run. Split codes 10, 20, 60, 61 and 250 further: Curtana Zenith is a weapon, so it stays Relic; the other two are not split. Override single pieces by item id or currency: Neophyte's Ring becomes Quest by item id. Categories: Relic, Tomestone, Quest.](../diagrams/subcategory-code-steps.svg)

The splits in step 4: code 10 by slot (weapons and shields are Relic, the rest Field Op), code 20 by dye slots and shop currency (Savage or Raid), codes 60 and 61 by shop currency (Ultimate or Trial), code 250 by equip level (Diadem or Aetherial). Step 5 covers a short list of single pieces whose code says the wrong thing. Here "shop data" means the game's exchange shops: which items each shop sells, and for which currency.

## The codes

How to read the table:

- **Category** is the one the code is filed under. Where a piece is moved to another category, the note says by what.
- **Pieces** counts the gear the generator keeps before the gear left out is dropped (so the Diadem and Aetherial gear is counted): item level 100+ at game data `d9582a6` for the codes found there; the codes added when the floor moved to item level 15 (430, 470, 520, 830, 921, 990, Aetherial) count item level 15 to 99 at `a67c23b`. Lower floors also added pieces to older codes (Grand Company, PvP, dungeon), not recounted here.
- ✅ = checked against the wiki or Lodestone, one piece per group.
- A code with a longer explanation has a note under the table.

| Code | Category | Pieces | Examples | Meaning | Status |
|---|---|---|---|---|---|
| 10 | Relic (weapons, shields); Field Op (the rest) | 1,226 | Zodiac, Anima, Eureka, Honorbound, Manderville, Phantom, Arcanaut's | Most relic weapon steps, plus Eureka and Occult Crescent armor (note) | ✅ Verified |
| 11 | Relic | 64 | Curtana Atma, Antea Eureka, Augmented Honorbound, Amazing Manderville | One relic step per line | ✅ Verified |
| 12 | Relic | 38 | Law's Order, Majestic Manderville | One relic step per line | ✅ Verified |
| 13 | Relic | 38 | Blade's, Mandervillous | Final ShB and EW relic step | ✅ Verified |
| 20 | Raid; Savage (by shop) | 2,077 | Gordian, Omega, Eden, Grand Champion's | 8-player raids, Normal and Savage | ✅ Verified |
| 40 | Alliance raid | 625 | Void Ark, Ivalician, Ark Angel's, Vana'dielian | Alliance raid armor (incl. Chaotic: Clouddark) | ✅ Verified |
| 60 | Trial; Ultimate (by shop) | 876 | Expanse, Ruby, Skyruin, Ultimate …, Palazzo Diamond | Extreme and Minstrel's Ballad trials, plus ultimate weapons; one exception (note) | ✅ Verified |
| 61 | Trial; Ultimate (by shop) | 16 | Thunderstrike, Adjudicator's | Ramuh Extreme weapons | ✅ Verified |
| 80 | Artifact | 738 | Antiquated, Weathered, Idealized, Caballarius | Job (artifact) gear, plus the Blue Mage and Beastmaster sets (note) | ✅ Verified |
| 100 | Tomestone | 2,882 | Ironworks, Shire, Credendum, Quetzalli, Bygone Brass | Tomestone gear, incl. retired and augmented sets | ✅ Verified |
| 130 | Deep dungeon | 154 | Padjali, Empyrean, Orthos, Sacramental | Deep dungeon weapons | ✅ Verified |
| 140 | Field Op | 7 | Kirin's Osode, Vermilion Cloak | Kirin's Osode and Vermilion Cloaks (note) | ✅ Verified (Kirin's Osode; the cloaks' origin not checked) |
| 150 | Field Op | 176 | Bozjan, Law's Order, Blade's | Bozja armor and accessories | ✅ Verified |
| 210 / 220 / 230 | Grand Company | 17 each | Serpent / Storm / Flame | Twin Adder / Maelstrom / Immortal Flames gear (same as the `GrandCompany` column) | ✅ Verified |
| 250 | Diadem (equip level 60); Aetherial (equip level 50 or below) | 293 + 487 | Mistfall, Sunburst, Coven; Aetherial Brass Viking Sword | Random secondary attributes; left out of the database (note) | ✅ Verified (Diadem: retired; Aetherial: the random attributes on the Console Games Wiki item page, second-hand game text) |
| 270 | Dungeon | 3,387 | Ktiseos, Riversbreath, Mistwake | Dungeon drops | ✅ Verified |
| 300 | Crafted (augmented) | 675 | Augmented Exarchic, Augmented Courtly Lover's | Crafted gear upgraded with certificates (ShB on) | ✅ Verified |
| 310 | Wondrous Tails | 91 | Ornate … | Ornate copies of crafted body pieces | ✅ Verified |
| 320 | Crafted | 3,627 | Archeo, Ceremonial, Courtly | Crafted gear, and gear exchanged for crafted gear (note) | ✅ Verified |
| 350 | FATE | 1 | Kidomaru | FATE reward | ✅ Verified |
| 370 | Field Op | 11 | Occult …, Neophyte's Ring | Occult Crescent accessories; one exception (note) | ✅ Verified |
| 410 | PvP | 340 | Hellwolf, Werewolf, Battleliege, Althyk's | PvP gear (item level 100–205) | ✅ Verified (game shop data: all 340 sold for Wolf Marks) |
| 430 | Gold Saucer | 26 | Blood Sword, Ai Apaec, Cross Pattee, Senor Sabotender | Level 50 weapons bought with MGP at the Gold Saucer (item level 50) | ✅ Verified |
| 450 | Gil vendor | 1 | Kettle Knuckles Nexus | Basic gear sold for gil | ✅ Verified |
| 470 | Crafted | 124 | Replica Allagan Blade, Replica Allagan Cane | Replica Allagan and relic glamour weapons (item level 50); every one is a recipe result | ✅ Verified (recipe: Master Blacksmith IV, Master Goldsmith IV) |
| 500 | Achievement | 6 | Field Commander's, Warlord's Crown | Achievement reward | ✅ Verified |
| 510 | Quest | 10 | Nameless, Red | Quest reward (Samurai, Red Mage starter gear) | ✅ Verified |
| 520 | Venture | 37 | Thormoen's Pride, Explorer's, Mage's, Stonewall, Gysahl Ring | Retainer venture rewards (Quick and Field Exploration), item level 49 to 52 | ✅ Verified |
| 530 | Quest (job starter) | 32 | Outsider's, Bookwyrm's, Weathered Painter's | Starter gear of GNB, DNC, SGE, RPR, VPR, PCT | ✅ Verified |
| 830 | Seasonal event | 4 | Chocobo Egg Cap, Midnight Egg Cap | Hatching-tide egg caps (item level 15 to 40), sold for gil after the event | ✅ Verified |
| 921 | Collaboration | 14 | Whisker of the Brave Cat, Ears of the Moon Rabbit | Yo-kai Watch collaboration weapons (item level 30), bought with Legendary Shogunyan Medals | ✅ Verified |
| 922 | Collaboration | 119 | Makai, Mado, The Fanged Wolf | GARO collaboration gear, bought with Wolf Marks (PvP) | ✅ Verified |
| 923 | Collaboration | 44 | Veldian, Augmented Veldian | Monster Hunter crossover weapons (The Windward Wilds, 7.35) | ✅ Verified |
| 980 | Promotional (pre-order) | 4 | Aetheryte, Menphina's, Azeyma's, Halone's | Expansion pre-order bonus earrings (level-scaled stats) | ✅ Verified (3 of 4; Halone's is reported as the Evercold pre-order bonus, not yet official) |
| 990 | Legacy | 1 | Chocobo Mask (and 1,121 "Dated" pieces with no combat stats) | Gear from version 1.0 and retired rewards; left out of the database; one exception (note) | ✅ Verified (retired notices on the Console Games Wiki; the "Dated" gear has no wiki pages and no shop or recipe in the game files) |

Notes on single codes:

- **10.** By item level: 100–275 Zodiac/Anima, 335–405 Eureka, 485–515 Resistance, 615 Manderville, 745–795 Occult Crescent. How the relic weapons and Field Op armor share it: [Field Op gear](#field-op-gear) below.
- **60.** The ultimate weapons are bought with an ultimate totem, which moves them to Ultimate. Exception: the 21 Proto Ultima pieces are alliance raid gear (bought with Proto Ultima Heat Shielding from the Shadow of Mhach quest; overridden by that currency).
- **80.** Guttler and Kornago Hoplon, called relic weapons on the Console Games Wiki, are artifact gear by code, so the Relic box does not hide them.
- **140.** The five Kirin's Osode (Eureka side set) and the two Vermilion Cloaks (body covering the head).
- **250.** Heavensward Diadem gear (retired) and A Realm Reborn's Aetherial gear (dungeon and treasure loot, item level 14 to 50). Both have random secondary attributes (the item text says "This weapon's secondary attributes are random."; the export's descriptions are empty), so the stats in the game files are not what a piece has: both are left out of the database.
- **320.** The 182 without a recipe: 38 Paladin swords and shields (the recipe makes a "Paladin's … Arms" set holding both), 71 Yama (traded for Rakshasa Tokens from turning in crafted gear), 73 pre-ShB augmented crafted.
- **370.** Neophyte's Ring is a Hall of the Novice reward (filed under Quest, overridden by item id).
- **990.** The "Dated" gear, the Chocobo Mask (achievement), White Ravens (The Rising 2018). Exception: the Peregrine Helm is a Quick Exploration venture reward today (filed under Venture, overridden by item id).

## Field Op gear

Which codes hold the gear of the field operations, and how is it told apart from relic weapons?

**Field Op** = gear from the field operations: large open zones with their own gear and relic grind, namely Eureka (Stormblood), Bozja / Save the Queen (Shadowbringers) and the Occult Crescent (Dawntrail). It is spread over several codes. The generator files code 10 armor and accessories and codes 140, 150 and 370 as Field Op; relic weapons from these zones stay Relic:

| Zone | Armor and accessories | Relic weapons |
|---|---|---|
| Eureka | code 10 (reforged artifact armor 335–345, Anemos 350, Elemental 380–390), code 140 (Kirin's Osode 300) | code 10 (Anemos … Physeos), code 11 (the 405 "Eureka" step) |
| Bozja | code 150 (Bozjan, Law's Order, Blade's) | Resistance weapons: codes 10, 11, 12, 13 (questline from Gangos) |
| Occult Crescent | code 10 (Arcanaut's 745, Phantom Vision 780), code 370 (Occult accessories) | code 10 (Phantom weapons) |

**A second signal.** The documented `Item.ItemSpecialBonus` column backs this up on the pieces that carry an in-zone bonus: 7 "Eureka Effect", 8 "Save the Queen Area Effect", 9 "Occult Crescent Effect", 10 "Occult Crescent Set Bonus" (from the `ItemSpecialBonus` sheet). It does not mark every Field Op piece (the base Bozjan sets and most Eureka armor have none), so it confirms rather than replaces the codes. The Occult armor's +1 to +3 upgrades differ only in that in-zone bonus; their normal stats are identical to the base piece.

**Why code 10 weapons are all Relic.** Codes 10 and 11 also hold the non–Field Op relics (Zodiac, Anima, Manderville). Telling a field-zone relic weapon from another relic would need the relic line, which only the item level ranges above separate (an inference from the data, not a documented field). The generator does not try: every weapon and shield in code 10 is Relic.

## Savage versus Normal (code 20)

Code 20 holds every 8-player raid piece. Each raid tier comes in a Normal and a harder Savage version with stronger gear, and the page hides Savage gear by default, so the two must be told apart. The code does not separate them. Two game-file signals do, without names. The generator combines them (rule after the list).

- **Shop currency**: Normal pieces are bought with Normal-raid tokens (Tarnished … parts, Deltascape/Sigmascape/Alphascape parts, "of … Antiquity", "Unsung …", Holo tokens); Savage pieces with Savage books (Manifesto pages, Datalogs, "Book of …", Mythos, AAC Illustrated). Which token belongs to which difficulty is not in the game files, though: one token per tier was checked on the wiki. The Coils have no shop entries (drops only).
- **Dye slots**: from Heavensward on, Savage armor and weapons have dye slots (1, or 2 in Dawntrail) and Normal pieces have none. Accessories have no dye slots either way, so this does not classify them. ✅ Verified on every code-20 piece.
- Item level: Savage armor and accessories are Normal + 20 in every tier from Heavensward on (a pattern, not a rule; not used).

Each signal alone falls short: dye slots miss the accessories, and the currencies need a token-to-difficulty list the game files do not have. Together they need neither.

**The rule the generator uses.** Dyeable armor and weapons seed the Savage set; the shops that sell them reveal the Savage currencies (the raid books); anything bought with those is Savage too, accessories included. No token-to-difficulty list is needed.

![Code 20 split in three steps, with one Dawntrail tier at game data d9582a6. 1, seed: code-20 armor and weapons with a dye slot, such as Grand Champion's Coat of Aiming, item level 790, 2 dye slots. 2, Savage currencies: every cost in a shop that sells a seed piece, such as the raid book AAC Illustrated: HW Edition I. 3, Savage: the seed plus every piece sold for a Savage currency, such as Grand Champion's Ring of Aiming, item level 790, no dye slot. Every other code-20 piece is Raid, such as Heavyweight Gloves of Healing, item level 770, no dye slot, bought with Heavy Hologauntlets; the Coils have no dye slots and no shops. Cross-check: a Savage armor piece or weapon with no dye slot stops the run.](../diagrams/subcategory-savage.svg)

Stated precisely, with $\text{dye}(i)$ the number of dye slots:

$$
S_0 = \{\, i : \text{code}(i) = 20,\ \text{dye}(i) \ge 1 \,\}, \qquad
C = \{\, c : c \text{ is a cost in a shop that sells some } i \in S_0 \,\},
$$

and a code-20 piece is Savage when it is in $S_0$ or some shop sells it for a currency in $C$.

**Why this is safe.** It can only go wrong if a shop that sells Savage gear also takes a currency used for other gear (a Normal-raid token, say); the Normal pieces bought with it would then be called Savage, and would show up as armor or a weapon filed as Savage with no dye slot. That is exactly what the cross-check stops the run on. The Coils have no dye slots and no shops, so their gear stays Raid.

## Relic weapon steps by code

A relic weapon is upgraded in steps, and each step is a separate item. Which code does each step carry? From the code 11–13 checks (Paladin weapon of each line, read from `Item.csv`; stage order from the wiki). Numbers after a name are item levels; bold codes are the ones other than 10.

| Step | Zodiac (ARR) | Eureka (SB) | Resistance (ShB) | Manderville (EW) |
|---|---|---|---|---|
| 1 | Base: 10 | Antea: 10 | Honorbound 485: 10 | Manderville 615: 10 |
| 2 | Zenith: 10 | … | Augmented Honorbound 500: **11** | Amazing 630: **11** |
| 3 | Atma: **11** | … | Honorbound Recollection 500: 10 | Majestic 645: **12** |
| 4+ | Animus, Novus, Nexus, Excalibur, Zeta: 10 | Antea Eureka 405: **11** (Hydatos step) | Law's Order 510: **12** | Mandervillous 665: **13** |
| 5 | | Antea Physeos: 10 | Augmented Law's Order 515: 10 | |
| 6 | | | Blade's 535: **13** | |

The codes do not follow the step number: 11, 12 and 13 mark single steps, and the steps between them fall back to 10. Relic glamour replicas use 470. Curtana Ultima (375) is 60. So "relic weapon, any step" is the union of 10, 11, 12 and 13, but 10 also holds non-relic exploration gear.

## Where this lives

| Concept | File |
| --- | --- |
| Code to category table, overrides, gear left out | `scripts/data/gear_categories.py` (`CATEGORY_BY_CODE`, `CURRENCY_OVERRIDES`, `ITEM_OVERRIDES`, `LEFT_OUT`) |
| Savage currencies and the dye-slot cross-check | `scripts/data/gear_categories.py` (`savage_items`, `check`) |
| Ultimate totems and the recipe flag | `scripts/data/gear_sources.py` (`ULTIMATE_TOTEMS`) |
| A category's activity for a piece with no way in ("Gear from") | `scripts/data/gear_activities.py` (`DROP_ACTIVITY`) |
| How pieces get their "Gear from" routes | [data-pipeline.md, section 4](data-pipeline.md#sources) |
