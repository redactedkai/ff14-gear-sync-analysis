# SubcategorySort codes on gear (working notes)

`Item.SubcategorySort` is an undocumented game-file column. On gear, its last three digits (`SubcategorySort % 1000`) say where the gear comes from. The item database generator files every piece by this code, refined by shop data (sections below), and a code it does not know stops the run, so new kinds of gear after a patch are noticed. Outside gear, the same digits mean other things.

How to read the table:

- **Category** is the one the code is filed under. Where a piece is moved to another category, the note says by what.
- **Pieces** counts the gear the generator keeps (item level 100+, game data `d9582a6`) before retired gear is left out, so the Diadem gear is counted.
- ✅ = checked against the wiki or Lodestone, one piece per group.

| Code | Category | Pieces | Examples | Meaning | Status |
|---|---|---|---|---|---|
| 10 | Relic (weapons, shields); Field Op (the rest) | 1,226 | Zodiac, Anima, Eureka, Honorbound, Manderville, Phantom, Arcanaut's | Most relic weapon steps, plus Eureka and Occult Crescent armor. By item level: 100–275 Zodiac/Anima, 335–405 Eureka, 485–515 Resistance, 615 Manderville, 745–795 Occult Crescent | ✅ Verified |
| 11 | Relic | 64 | Curtana Atma, Antea Eureka, Augmented Honorbound, Amazing Manderville | One relic step per line | ✅ Verified |
| 12 | Relic | 38 | Law's Order, Majestic Manderville | One relic step per line | ✅ Verified |
| 13 | Relic | 38 | Blade's, Mandervillous | Final ShB and EW relic step | ✅ Verified |
| 20 | Raid; Savage (by shop) | 2,077 | Gordian, Omega, Eden, Grand Champion's | 8-player raids, Normal and Savage | ✅ Verified |
| 40 | Alliance raid | 625 | Void Ark, Ivalician, Ark Angel's, Vana'dielian | Alliance raid armor (incl. Chaotic: Clouddark) | ✅ Verified |
| 60 | Trial; Ultimate (by shop) | 876 | Expanse, Ruby, Skyruin, Ultimate …, Palazzo Diamond | Extreme and Minstrel's Ballad trials, plus ultimate weapons (bought with an ultimate totem). Exception: the 21 Proto Ultima pieces are alliance raid gear (bought with Proto Ultima Heat Shielding from the Shadow of Mhach quest; overridden by that currency) | ✅ Verified |
| 61 | Trial; Ultimate (by shop) | 16 | Thunderstrike, Adjudicator's | Ramuh Extreme weapons | ✅ Verified |
| 80 | Artifact | 703 | Antiquated, Weathered, Idealized, Caballarius | Job (artifact) gear, plus Blue Mage sets | ✅ Verified |
| 100 | Tomestone | 2,882 | Ironworks, Shire, Credendum, Quetzalli, Bygone Brass | Tomestone gear, incl. retired and augmented sets | ✅ Verified |
| 130 | Deep dungeon | 154 | Padjali, Empyrean, Orthos, Sacramental | Deep dungeon weapons | ✅ Verified |
| 140 | Field Op | 5 | Kirin's Osode | Eureka side set | ✅ Verified |
| 150 | Field Op | 176 | Bozjan, Law's Order, Blade's | Bozja armor and accessories | ✅ Verified |
| 210 / 220 / 230 | Grand Company | 17 each | Serpent / Storm / Flame | Twin Adder / Maelstrom / Immortal Flames gear (same as the `GrandCompany` column) | ✅ Verified |
| 250 | Diadem | 293 | Mistfall, Sunburst, Coven | Heavensward Diadem gear, retired (random substats); left out of the database | ✅ Verified |
| 270 | Dungeon | 3,391 | Ktiseos, Riversbreath, Mistwake | Dungeon drops | ✅ Verified |
| 300 | Crafted (augmented) | 675 | Augmented Exarchic, Augmented Courtly Lover's | Crafted gear upgraded with certificates (ShB on) | ✅ Verified |
| 310 | Wondrous Tails | 91 | Ornate … | Ornate copies of crafted body pieces | ✅ Verified |
| 320 | Crafted | 3,632 | Archeo, Ceremonial, Courtly | Crafted gear, and gear exchanged for crafted gear. The 182 without a recipe: 38 Paladin swords and shields (the recipe makes a "Paladin's … Arms" set holding both), 71 Yama (traded for Rakshasa Tokens from turning in crafted gear), 73 pre-ShB augmented crafted | ✅ Verified |
| 350 | FATE | 1 | Kidomaru | FATE reward | ✅ Verified |
| 370 | Field Op | 11 | Occult …, Neophyte's Ring | Occult Crescent accessories. Exception: Neophyte's Ring is a Hall of the Novice reward (filed under Quest, overridden by item id) | ✅ Verified |
| 410 | PvP | 340 | Hellwolf, Werewolf, Battleliege, Althyk's | PvP gear (item level 100–205) | ✅ Verified (game shop data: all 340 sold for Wolf Marks) |
| 450 | Gil vendor | 1 | Kettle Knuckles Nexus | Basic gear sold for gil | ✅ Verified |
| 500 | Achievement | 6 | Field Commander's, Warlord's Crown | Achievement reward | ✅ Verified |
| 510 | Quest | 10 | Nameless, Red | Quest reward (Samurai, Red Mage starter gear) | ✅ Verified |
| 530 | Quest (job starter) | 32 | Outsider's, Bookwyrm's, Weathered Painter's | Starter gear of GNB, DNC, SGE, RPR, VPR, PCT | ✅ Verified |
| 922 | Collaboration | 119 | Makai, Mado, The Fanged Wolf | GARO collaboration gear, bought with Wolf Marks (PvP) | ✅ Verified |
| 923 | Collaboration | 44 | Veldian, Augmented Veldian | Monster Hunter crossover weapons (The Windward Wilds, 7.35) | ✅ Verified |
| 980 | Promotional (pre-order) | 4 | Aetheryte, Menphina's, Azeyma's, Halone's | Expansion pre-order bonus earrings (level-scaled stats) | ✅ Verified (3 of 4; Halone's is reported as the Evercold pre-order bonus, not yet official) |

## Field Op gear

**Field Op** = gear from the field operations: Eureka (Stormblood), Bozja / Save the Queen (Shadowbringers) and the Occult Crescent (Dawntrail). It is spread over several codes. The generator files code 10 armor and accessories and codes 140, 150 and 370 as Field Op; relic weapons from these zones stay Relic:

| Zone | Armor and accessories | Relic weapons |
|---|---|---|
| Eureka | code 10 (reforged artifact armor 335–345, Anemos 350, Elemental 380–390), code 140 (Kirin's Osode 300) | code 10 (Anemos … Physeos), code 11 (the 405 "Eureka" step) |
| Bozja | code 150 (Bozjan, Law's Order, Blade's) | Resistance weapons: codes 10, 11, 12, 13 (questline from Gangos) |
| Occult Crescent | code 10 (Arcanaut's 745, Phantom Vision 780), code 370 (Occult accessories) | code 10 (Phantom weapons) |

The documented `Item.ItemSpecialBonus` column backs this up on the pieces that carry an in-zone bonus: 7 "Eureka Effect", 8 "Save the Queen Area Effect", 9 "Occult Crescent Effect", 10 "Occult Crescent Set Bonus" (from the `ItemSpecialBonus` sheet). It does not mark every Field Op piece (the base Bozjan sets and most Eureka armor have none), so it confirms rather than replaces the codes. The Occult armor's +1 to +3 upgrades differ only in that in-zone bonus; their normal stats are identical to the base piece.

Codes 10 and 11 also hold the non–Field Op relics (Zodiac, Anima, Manderville). Telling a field-zone relic weapon from another relic would need the relic line, which only the item level ranges above separate (an inference from the data, not a documented field). The generator does not try: every weapon and shield in code 10 is Relic.

## Savage versus Normal (code 20)

Not separable by the code. Two game-file signals do separate them, without names. The generator combines them (rule after the list).

- **Shop currency**: Normal pieces are bought with Normal-raid tokens (Tarnished … parts, Deltascape/Sigmascape/Alphascape parts, "of … Antiquity", "Unsung …", Holo tokens); Savage pieces with Savage books (Manifesto pages, Datalogs, "Book of …", Mythos, AAC Illustrated). Which token belongs to which difficulty is not in the game files, though: one token per tier was checked on the wiki. The Coils have no shop entries (drops only).
- **Dye slots**: from Heavensward on, Savage armor and weapons have dye slots (1, or 2 in Dawntrail) and Normal pieces have none. Accessories have no dye slots either way, so this does not classify them. ✅ Verified on every code-20 piece.
- Item level: Savage armor and accessories are Normal + 20 in every tier from Heavensward on (a pattern, not a rule; not used).

**The rule the generator uses.** Dyeable code-20 armor and weapons are Savage. Every shop that sells one of them shows the Savage currencies (the raid books), and anything bought with those currencies is Savage too, accessories included. The generator needs no token-to-difficulty list. As a cross-check, a Savage armor piece or weapon without a dye slot stops the run: it would mean a Savage shop also takes a currency used for other gear. The Coils have no dye slots and no shops, so their gear stays Raid.

## Relic weapon steps by code

From the code 11–13 checks (Paladin weapon of each line, read from `Item.csv`; stage order from the wiki).

| Step | Zodiac (ARR) | Eureka (SB) | Resistance (ShB) | Manderville (EW) |
|---|---|---|---|---|
| 1 | Base: 10 | Antea: 10 | Honorbound 485: 10 | Manderville 615: 10 |
| 2 | Zenith: 10 | … | Augmented Honorbound 500: **11** | Amazing 630: **11** |
| 3 | Atma: **11** | … | Honorbound Recollection 500: 10 | Majestic 645: **12** |
| 4+ | Animus, Novus, Nexus, Excalibur, Zeta: 10 | Antea Eureka 405: **11** (Hydatos step) | Law's Order 510: **12** | Mandervillous 665: **13** |
| 5 | | Antea Physeos: 10 | Augmented Law's Order 515: 10 | |
| 6 | | | Blade's 535: **13** | |

Relic glamour replicas use 470. Curtana Ultima (375) is 60. So "relic weapon, any step" is the union of 10, 11, 12 and 13, but 10 also holds non-relic exploration gear.

## Where this lives

| Concept | File |
| --- | --- |
| Code to category table, overrides, retired gear | `scripts/data/gear_categories.py` (`CATEGORY_BY_CODE`, `CURRENCY_OVERRIDES`, `ITEM_OVERRIDES`, `RETIRED`) |
| Savage currencies and the dye-slot cross-check | `scripts/data/gear_categories.py` (`savage_items`, `check`) |
| Ultimate totems, recipe and tomestone flags | `scripts/data/gear_sources.py` (`ULTIMATE_TOTEMS`) |
| Categories of each source group | `src/core/item-format.json` (`sources`) |
| How the categories become source bits | [data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation) |
