/* Static game and project constants. Nothing here changes at runtime.
   Internal stat keys are role-neutral: main (Str/Dex/Int/Mind), vit, crit, det, dh,
   spd (Skill/Spell Speed), spec (Piety/Tenacity/none). A JobContext (job-context.js) maps them per job.
   The generated-data format (job bit order, raw stat order, slot codes) comes from item-format.json, which the
   Python generators read too. */
import ITEM_FORMAT from './item-format.json' with { type: 'json' };

export const ALL_STATS = Object.freeze(['main', 'vit', 'crit', 'det', 'dh', 'spd', 'spec']);
export const BASE_SUBSTATS = Object.freeze(['crit', 'det', 'dh', 'spd']);

export const SLOT_TYPES = Object.freeze(['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring']);
export const SLOT_LABEL = Object.freeze({
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  ear: 'Earring',
  neck: 'Necklace',
  wrist: 'Bracelet',
  ring: 'Ring',
});

/* Slot share of the ItemLevel budget, in thousandths: `percent` per slot in item-format.json, which
   gen_item_level.py checks against the BaseParam sheet. The weapon value depends on the weapon mode
   (WEAPON_PCT); BASE_SLOT_PCT.weapon is the two-handed value. Multi-slot codes (`blocks`, e.g. a cloak) have their own
   share and do not set the type's. */
const weaponSlotPct = twoHanded => ITEM_FORMAT.slots.find(s => s.type === 'weapon' && s.twoHanded === twoHanded).percent;
export const WEAPON_PCT = Object.freeze({ '2h': weaponSlotPct(true), '1h+oh': weaponSlotPct(false) });
export const BASE_SLOT_PCT = Object.freeze({
  weapon: WEAPON_PCT['2h'],
  ...Object.fromEntries(ITEM_FORMAT.slots.filter(s => s.type !== 'weapon' && !s.blocks).map(s => [s.type, s.percent])),
});

/* Substat shares by rank on a piece, in percent. Empirical pattern, not stored in the game files (docs/mechanics/math.md section 4; evidence in docs/mechanics/validation.md). */
export const SUB_WEIGHTS = Object.freeze([100, 70]);
/* Direct Hit on gear whose only main stat is Mind (old healer Accuracy, item level 50 to 135) is a fixed line at this
   share of its slot value, outside the ranking above. Measured, not in the game files (docs/mechanics/math.md section 4). */
export const MIND_DIRECT_HIT_SHARE = 20;
/* The same line is at this share on green (RARITY_GREEN), HQ-able pieces with three substats: eight item level 110
   crafted healer pieces, raised from 20% in patch 4.0. Measured; the owner accepted it as a rule (docs/mechanics/math.md). */
export const GREEN_CRAFTED_DIRECT_HIT_SHARE = 25;
export const RARITY_GREEN = 2;
/* The Zodiac Atma weapons (item level 100) are copies of their Zenith step: the same stats and weapon damage, item
   level 90's. Nothing in the data marks them but the name, so this one rule goes by name (owner's decision; all 11
   end in " Atma"). Accuracy check only. */
export const ATMA_NAME_SUFFIX = ' Atma';
export const ATMA_STAT_ILVL = 90;
/* The all-jobs earrings and rings (pre-order bonuses, Bozja, Hall of the Novice): every piece of stat factor kind 0
   with Main Attribute. Their stats were edited by hand patch by patch (datamining history), so their main stat and
   Vitality follow no one factor; this is the factor each one carries (the file's is 90 for both), by name (owner's
   decision). Stored stats only: synced, the game applies the file's factor (xivgear's in-game values). */
export const ALL_JOBS_ACCESSORY_FACTORS = Object.freeze({
  "Neophyte's Ring": { mainAttr: 100, vit: 90 },
  'Aetheryte Earring': { mainAttr: 100, vit: 90 },
  'Bozjan Earring': { mainAttr: 100, vit: 100 },
  "Menphina's Earring": { mainAttr: 100, vit: 100 },
  "Azeyma's Earrings": { mainAttr: 100, vit: 100 },
  "Halone's Earring": { mainAttr: 90, vit: 90 },
});
/* 18 A Realm Reborn dungeon pieces at item level 46 (equip level 44) whose stats sit below their item level: each main
   stat at 90% of the usual value, Vitality and every substat at 80% (fits 17 of 18; Harlequin's Acton's Intelligence
   stays 1 off). The other 26 pieces of their sets and level follow the usual rule and nothing in the data marks these,
   so the rule goes by name (owner's decision, 2026-10-16). Measured on these pieces only. Accuracy check only. */
export const REDUCED_STAT_PIECES = Object.freeze({
  names: new Set([
    "Buccaneer's Tricorne",
    "Buccaneer's Shirt",
    "Buccaneer's Boots",
    "Harlequin's Cap",
    "Harlequin's Acton",
    "Harlequin's Tights",
    "Sentinel's Celata",
    "Sentinel's Cuirass",
    "Sentinel's Gauntlets",
    "Sentinel's Trousers",
    "Sentinel's Sabatons",
    "Templar's Chain Coif",
    "Templar's Haubergeon",
    "Templar's Sollerets",
    'Coliseum Galerus',
    'Coliseum Shawl',
    'Coliseum Loincloth',
    'Coliseum Subligar',
  ]),
  main: 90,
  rest: 80,
});

export const MAIN_NAME = Object.freeze({ str: 'Strength', dex: 'Dexterity', int: 'Intelligence', mind: 'Mind' });
/* Short names as xivgear writes them */
export const MAIN_SHORT = Object.freeze({ str: 'STR', dex: 'DEX', int: 'INT', mind: 'MND' });
export const SPD_NAME = Object.freeze({ sks: 'Skill Speed', sps: 'Spell Speed' });
export const SPD_SHORT = Object.freeze({ sks: 'SkS', sps: 'SpS' });
export const SPEC_NAME = Object.freeze({ piety: 'Piety', ten: 'Tenacity' });
export const SPEC_SHORT = Object.freeze({ piety: 'PIE', ten: 'TNC' });

/* Role profiles: which raw stat each neutral key means. */
export const PROFILES = Object.freeze({
  healer: Object.freeze({ label: 'Healer', main: 'mind', spd: 'sps', spec: 'piety' }),
  tank: Object.freeze({ label: 'Tank', main: 'str', spd: 'sks', spec: 'ten' }),
  melee: Object.freeze({ label: 'Melee DPS (Strength)', main: 'str', spd: 'sks', spec: null }),
  dex: Object.freeze({ label: 'Ranged, Ninja, Viper (Dexterity)', main: 'dex', spd: 'sks', spec: null }),
  caster: Object.freeze({ label: 'Caster (Intelligence)', main: 'int', spd: 'sps', spec: null }),
});

/* Name and role profile per job id. */
const JOB_INFO = {
  PLD: ['Paladin', 'tank'],
  WAR: ['Warrior', 'tank'],
  DRK: ['Dark Knight', 'tank'],
  GNB: ['Gunbreaker', 'tank'],
  WHM: ['White Mage', 'healer'],
  SCH: ['Scholar', 'healer'],
  AST: ['Astrologian', 'healer'],
  SGE: ['Sage', 'healer'],
  MNK: ['Monk', 'melee'],
  DRG: ['Dragoon', 'melee'],
  SAM: ['Samurai', 'melee'],
  RPR: ['Reaper', 'melee'],
  NIN: ['Ninja', 'dex'],
  VPR: ['Viper', 'dex'],
  BRD: ['Bard', 'dex'],
  MCH: ['Machinist', 'dex'],
  DNC: ['Dancer', 'dex'],
  BLM: ['Black Mage', 'caster'],
  SMN: ['Summoner', 'caster'],
  RDM: ['Red Mage', 'caster'],
  PCT: ['Pictomancer', 'caster'],
  BLU: ['Blue Mage', 'caster'],
  BST: ['Beastmaster', 'melee'],
};
/* [id, name, profile], in item-format.json order, which is the job bitmask in the item database: bit i = JOBS[i]. */
export const JOBS = Object.freeze(
  ITEM_FORMAT.jobs.map(id => {
    if (!JOB_INFO[id]) throw new Error(`item-format.json lists job ${id}, which has no entry in JOB_INFO`);
    return Object.freeze([id, ...JOB_INFO[id]]);
  }),
);
/* The job context used to render (hidden) job-dependent parts before a job is chosen, and the fallback for an unknown
   id in makeJobContext. The page itself starts with no job. */
export const DEFAULT_JOB = JOBS[0][0];
export const ONE_HANDED_JOBS = Object.freeze(['PLD', 'BST']); /* 1H weapon + shield; everyone else uses a 2H weapon */
/* Limited jobs stop below the game's level cap. The game files hold no level cap (ClassJob has no such column; its
   IsLimitedJob flag marks exactly these two jobs), so these come from the official patch notes on the Lodestone:
   Blue Mage "The level cap for blue mage has been increased to 80" (Patch 6.45 Notes,
   https://na.finalfantasyxiv.com/lodestone/topics/detail/2a6c65f39b5b16b58bd4f0d9b1edaa8c0b7ec4f3), Beastmaster "begins at
   level 1 with a maximum level of 50" (Patch 7.56 Notes,
   https://na.finalfantasyxiv.com/lodestone/topics/detail/a8a526ad64db45c8ca8d1c7fdcce8a5eedaa18bc). Every other job caps
   at the highest equip level in the item database (MAX_LEVEL in tables.js, 100). */
export const JOB_LEVEL_CAPS = Object.freeze({ BLU: 80, BST: 50 });
/* Haste that is up all fight in practice, counted in the Target GCD (owner's decision 2026-10-15; short buffs such as
   Presence of Mind, Ley Lines, Army's Paeon and Inspiration are not): job -> {name, steps: [[from level, percent]]},
   steps in level order. Percents and levels from the official job guides (https://na.finalfantasyxiv.com/jobguide/,
   read 2026-10-15): Monk's trait Greased Lightning 5% at 1, 10% at 20, 15% at 40, 20% at 76; Ninja's trait
   Increase Attack Speed 15% from 45; Samurai's Fuka 10% from 18 (Shifu), 13% from 78 (Enhanced Fugetsu and Fuka);
   Viper's Swiftscaled 15% from 20 (Swiftskin's Sting). xivgear applies Ninja's and Viper's at every level. */
export const HASTE = Object.freeze({
  MNK: Object.freeze({
    name: 'Greased Lightning',
    steps: Object.freeze([
      [1, 5],
      [20, 10],
      [40, 15],
      [76, 20],
    ]),
  }),
  NIN: Object.freeze({ name: 'Increase Attack Speed', steps: Object.freeze([[45, 15]]) }),
  SAM: Object.freeze({
    name: 'Fuka',
    steps: Object.freeze([
      [18, 10],
      [78, 13],
    ]),
  }),
  VPR: Object.freeze({ name: 'Swiftscaled', steps: Object.freeze([[20, 15]]) }),
});
/* Expansions in order: [short name, full name, level cap]. The item level boundary after each one is the game's own
   sync item level at its level cap (ParamGrow), see expansionBounds in speed.js. */
export const EXPANSIONS = Object.freeze([
  Object.freeze(['ARR', 'A Realm Reborn', 50]),
  Object.freeze(['HW', 'Heavensward', 60]),
  Object.freeze(['SB', 'Stormblood', 70]),
  Object.freeze(['ShB', 'Shadowbringers', 80]),
  Object.freeze(['EW', 'Endwalker', 90]),
  Object.freeze(['DT', 'Dawntrail', 100]),
]);

/* The job picker's rows, in the game's own role grouping and order. This is not the stat profile: Ninja and Viper are
   melee here but use the Dexterity profile with the ranged jobs. */
export const JOB_ROWS = Object.freeze([
  Object.freeze(['Tanks', Object.freeze(['PLD', 'WAR', 'DRK', 'GNB'])]),
  Object.freeze(['Healers', Object.freeze(['WHM', 'SCH', 'AST', 'SGE'])]),
  Object.freeze(['Melee', Object.freeze(['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BST'])]),
  Object.freeze(['Physical ranged', Object.freeze(['BRD', 'MCH', 'DNC'])]),
  Object.freeze(['Magical ranged', Object.freeze(['BLM', 'SMN', 'RDM', 'PCT', 'BLU'])]),
]);

/* Field positions in an item database row (src/data/items.json; written by scripts/data/gen_items.py). Read a row as
   row[ROW.ilvl], never row[2]; parseRow in items.js turns a whole row into an object.
   - slotCode: index into `slots` of item-format.json (DB_SLOT_TYPE, DB_SLOT_PCT, DB_SLOT_BLOCKS)
   - equipLevel: the character level needed to wear it
   - jobMask: bit i set when JOBS[i] can wear it
   - stats: comma-joined raw stats in ITEM_STAT_ORDER (rowStats in items.js splits them)
   - unique: 1 when only one can be worn (rings); hq: 1 when it can be high quality (the stats are then the HQ ones)
   - sources: bit mask over SOURCES (gear groups)
   - kind: the item's stat factor kind, a column of the stat factor table MP in tables.js (kindFactors in items.js)
   - meldSlots: guaranteed materia slots, 0 to 5; overmeld: 1 when overmelding is allowed (`materia` in item-format.json)
   - rarity: Item.Rarity (1 white, 2 green, 3 blue, 4 purple, 7 pink); gameId: the game's item id (Item.csv row)
   - scales: 1 when its item level follows the wearer's level (Item.SubStatCategory 2; syncTarget) */
export const ROW = Object.freeze({
  name: 0,
  slotCode: 1,
  ilvl: 2,
  equipLevel: 3,
  jobMask: 4,
  stats: 5,
  unique: 6,
  hq: 7,
  sources: 8,
  kind: 9,
  meldSlots: ITEM_FORMAT.materia.rowFields.meldSlots,
  overmeld: ITEM_FORMAT.materia.rowFields.overmeld,
  rarity: ITEM_FORMAT.rarity.rowField,
  gameId: ITEM_FORMAT.gameId.rowField,
  scales: ITEM_FORMAT.levelScaled.rowField,
});
export const ITEM_STAT_ORDER = Object.freeze(ITEM_FORMAT.stats.map(s => s.key));
export const RAW_MAIN_IDX = Object.freeze(['str', 'dex', 'int', 'mind'].map(k => ITEM_STAT_ORDER.indexOf(k)));
export const RAW_VIT_IDX = ITEM_STAT_ORDER.indexOf('vit');
/* The game's generic "Main Attribute" (pre-order earrings): the wearer's main stat (see items.js dbStats, which also
   maps the generic "Secondary Attribute"). */
export const RAW_MAIN_ATTR_IDX = ITEM_STAT_ORDER.indexOf('mainAttr');
/* Indices into a row's raw stat array (ITEM_STAT_ORDER), not neutral keys. Substats: every stat but the main stats, Vitality and Main Attribute (Secondary Attribute ranks as a substat). */
export const RAW_SUBSTAT_IDX = Object.freeze(
  ITEM_STAT_ORDER.map((_, i) => i).filter(i => !RAW_MAIN_IDX.includes(i) && i !== RAW_VIT_IDX && i !== RAW_MAIN_ATTR_IDX),
);
/* slot code -> pool slot type; codes 0 = two-handed, 1 = one-handed weapon, 12 = body that also covers the head */
export const DB_SLOT_TYPE = Object.freeze(ITEM_FORMAT.slots.map(s => s.type));
export const DB_SLOT_PCT = Object.freeze(ITEM_FORMAT.slots.map(s => s.percent));
/* slot code -> the slot types a piece in it leaves empty: the off-hand for a two-handed weapon, the head for a cloak */
export const DB_SLOT_BLOCKS = Object.freeze(ITEM_FORMAT.slots.map(s => Object.freeze(s.twoHanded ? ['offhand'] : s.blocks || [])));
/* Gear groups the optimizer can leave out (crafted, tomestone, ultimate, savage, relic): bit i of a row's source mask = SOURCES[i]. */
export const SOURCES = Object.freeze(ITEM_FORMAT.sources.map((s, i) => Object.freeze({ key: s.key, label: s.label, bit: 1 << i })));

/* The character's base main stat at each level 1..100 (index = level - 1), the base that Determination and Piety start
   from (Critical Hit, Direct Hit, speed and Tenacity start from ParamGrow BaseSpeed). Not in the game files (no sheet
   holds it); AkhMorning's Level Modifiers table (Allagan Studies), which Ariyala and the FF Wiki repeat. Its BaseSpeed
   and LevelModifier columns equal ParamGrow's at every level, and this column equals xivgear's at 50, 60, ..., 100.
   Inferred; used only for food, which is a percentage of the whole stat (docs/mechanics/math.md, section 6, Food). */
export const LEVEL_MAIN = Object.freeze([
  20, 21, 22, 24, 26, 27, 29, 31, 33, 35, 36, 38, 41, 44, 46, 49, 52, 54, 57, 60, 63, 67, 71, 74, 78, 81, 85, 89, 92, 97, 101, 106, 110,
  115, 119, 124, 128, 134, 139, 144, 150, 155, 161, 166, 171, 177, 183, 189, 196, 202, 204, 205, 207, 209, 210, 212, 214, 215, 217, 218,
  224, 228, 236, 244, 252, 260, 268, 276, 284, 292, 296, 300, 305, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355, 360, 365, 370, 375,
  380, 385, 390, 395, 400, 405, 410, 415, 420, 425, 430, 435, 440,
]);
