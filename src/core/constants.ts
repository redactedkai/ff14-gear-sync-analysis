/* Static game and project constants. Nothing here changes at runtime.
   Stat keys are the game's own stat names: str, dex, int, mind, vit, crit, det, dh, sks, sps, piety, ten (the keys of
   item-format.json's `stats`). A JobContext (job-context.js) says which of them a job has: mainKey, speedKey, specKey.
   The generated-data format (job bit order, raw stat order, slot codes) comes from item-format.json, which the
   Python generators read too. */
import ITEM_FORMAT from './item-format.json' with { type: 'json' };
import type { RowIndex } from './types.ts';

/* The substats every job has; the speed stat and the special substat follow in a job's own list. */
export const SHARED_SUBSTATS = Object.freeze(['crit', 'det', 'dh'] as const);

export const SLOT_TYPES = Object.freeze([
  'weapon',
  'offhand',
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'ear',
  'neck',
  'wrist',
  'ring',
] as const);
/* A slot type: one of SLOT_TYPES (the `type` of item-format.json's `slots`). */
export type SlotType = (typeof SLOT_TYPES)[number];
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
/* The four accessory slots, which share one budget share (item-format.json: 67 per mille each); a menu that groups
   them calls the group ACCESSORIES_LABEL. */
export const ACCESSORY_SLOTS = Object.freeze(['ear', 'neck', 'wrist', 'ring'] as const);
export const ACCESSORIES_LABEL = 'Accessories';

/* Slot share of the ItemLevel budget, in thousandths: `percent` per slot in item-format.json, which
   gen_item_level.py checks against the BaseParam sheet. The weapon value depends on the weapon mode
   (WEAPON_PCT); BASE_SLOT_PCT.weapon is the two-handed value. Multi-slot codes (`blocks`, e.g. a cloak) have their own
   share and do not set the type's. */
const weaponSlotPct = (twoHanded: boolean): number =>
  (ITEM_FORMAT.slots.find(s => s.type === 'weapon' && s.twoHanded === twoHanded) as { percent: number }).percent;
export const WEAPON_PCT = Object.freeze({ '2h': weaponSlotPct(true), '1h+oh': weaponSlotPct(false) });
export const BASE_SLOT_PCT = Object.freeze({
  weapon: WEAPON_PCT['2h'],
  ...Object.fromEntries(ITEM_FORMAT.slots.filter(s => s.type !== 'weapon' && !s.blocks).map(s => [s.type, s.percent])),
} as Record<SlotType, number>);

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
export const ALL_JOBS_ACCESSORY_FACTORS: Readonly<Record<string, { mainAttr: number; vit: number }>> = Object.freeze({
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
   so the rule goes by name (owner's decision). Measured on these pieces only. Accuracy check only. */
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

/* Names of every stat key, in full and short (the short names as xivgear writes them). One table by key: a job's
   labels are the entries of its own keys (job-context.js). */
export const STAT_LABEL = Object.freeze({
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  mind: 'Mind',
  vit: 'Vitality',
  crit: 'Critical Hit',
  det: 'Determination',
  dh: 'Direct Hit',
  sks: 'Skill Speed',
  sps: 'Spell Speed',
  piety: 'Piety',
  ten: 'Tenacity',
});
/* A stat key of a job (the keys of STAT_LABEL: every one this file and a JobContext name). */
export type StatKey = keyof typeof STAT_LABEL;
export const STAT_SHORT = Object.freeze({
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  mind: 'MND',
  vit: 'VIT',
  crit: 'CRT',
  det: 'DET',
  dh: 'DHT',
  sks: 'SkS',
  sps: 'SpS',
  piety: 'PIE',
  ten: 'TNC',
});

/* The weapon damage and defense keys of an item row (`damageDefense` in item-format.json; DAMAGE_DEFENSE_KEYS lists them). */
export type DamageDefenseKey = 'damagePhys' | 'damageMag' | 'defensePhys' | 'defenseMag';
/* The weapon damage key of a job's weapons (a DamageDefenseKey that is damage, not defense). */
export type DamageKey = 'damagePhys' | 'damageMag';
/* A key of the raw stats of an item row, as `stats` of item-format.json lists them: the stat keys, the game's generic Main
   Attribute (`mainAttr`) and Secondary Attribute (`secAttr`). */
export type RawStatKey = StatKey | 'mainAttr' | 'secAttr';

/* Role profiles: which game stat is each position of a job's stat list. mainKey: Strength, Dexterity, Intelligence or
   Mind; speedKey: Skill Speed or Spell Speed; specKey: Piety or Tenacity, null for a job without a special substat. */
export const PROFILES = Object.freeze({
  healer: Object.freeze({ label: 'Healer', mainKey: 'mind', speedKey: 'sps', specKey: 'piety' }),
  tank: Object.freeze({ label: 'Tank', mainKey: 'str', speedKey: 'sks', specKey: 'ten' }),
  melee: Object.freeze({ label: 'Melee DPS (Strength)', mainKey: 'str', speedKey: 'sks', specKey: null }),
  dex: Object.freeze({ label: 'Ranged, Ninja, Viper (Dexterity)', mainKey: 'dex', speedKey: 'sks', specKey: null }),
  caster: Object.freeze({ label: 'Caster (Intelligence)', mainKey: 'int', speedKey: 'sps', specKey: null }),
});

/* A main stat key: the Strength, Dexterity, Intelligence or Mind a job's mainKey is. */
export type MainStatKey = (typeof PROFILES)[ProfileId]['mainKey'];
/* A speed stat key (Skill Speed or Spell Speed) and a special substat key (Piety or Tenacity): what a profile's speedKey
   and specKey hold. */
export type SpeedKey = (typeof PROFILES)[ProfileId]['speedKey'];
export type SpecKey = NonNullable<(typeof PROFILES)[ProfileId]['specKey']>;
/* A role profile's id: a key of PROFILES. */
export type ProfileId = keyof typeof PROFILES;
/* A job's weapon mode: '2h', '1h+oh' or 'mixed' (makeJobContext). */
export type WeaponMode = '2h' | '1h+oh' | 'mixed';

/* Name and role profile per job id. */
const JOB_INFO: Record<string, readonly [string, ProfileId]> = {
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
/* Every job, {id, name, profile} (profile: a PROFILES key), in item-format.json order, which is the job bitmask in the
   item database: bit i = JOBS[i]. */
export const JOBS = Object.freeze(
  ITEM_FORMAT.jobs.map(id => {
    if (!JOB_INFO[id]) {
      throw new Error(`item-format.json lists job ${id}, which has no entry in JOB_INFO`);
    }
    const [name, profile] = JOB_INFO[id];
    return Object.freeze({ id, name, profile });
  }),
);
/* The job of id `id` (a JOBS entry), or undefined for an unknown id. */
export const jobById = (id: string) => JOBS.find(j => j.id === id);
/* The job a fresh page starts with (Paladin, the first of JOBS) and the fallback for an unknown id in makeJobContext. */
export const DEFAULT_JOB = JOBS[0].id;
/* The jobs with a shield, by weapon mode (makeJobContext's weaponMode). Both lists come from the item database (job mask
   and slot code: 1H weapon, shield, 2H weapon); tests/unit/core/job-context.weapon-mode.test.js derives them again from
   items.json, so a data update that gives another job a shield fails there. Every other job uses a 2H weapon.
   ONE_HANDED_JOBS: only 1H weapons and shields exist (weaponMode '1h+oh'). */
export const ONE_HANDED_JOBS = Object.freeze(['PLD', 'BST']);
/* MIXED_WEAPON_JOBS: 2H weapons and also 1H weapons with shields, at every level (weaponMode 'mixed'). */
export const MIXED_WEAPON_JOBS = Object.freeze(['WHM', 'BLM']);
/* Jobs whose weapons carry no real weapon damage, so the optimizer does not rank it (damage-defense.js): Blue Mage's
   weapons all hold 6 physical and 1 magic damage (Item.csv); its weapon damage comes from Intelligence instead
   (xivgear's bluWdfromInt), which a goal covers when Intelligence is in it (owner's decision). */
export const NO_WEAPON_DAMAGE_JOBS = Object.freeze(['BLU']);
/* Limited jobs stop below the game's level cap. The game files hold no level cap (ClassJob has no such column; its
   IsLimitedJob flag marks exactly these two jobs), so these come from the official patch notes on the Lodestone:
   Blue Mage "The level cap for blue mage has been increased to 80" (Patch 6.45 Notes,
   https://na.finalfantasyxiv.com/lodestone/topics/detail/2a6c65f39b5b16b58bd4f0d9b1edaa8c0b7ec4f3), Beastmaster "begins at
   level 1 with a maximum level of 50" (Patch 7.56 Notes,
   https://na.finalfantasyxiv.com/lodestone/topics/detail/a8a526ad64db45c8ca8d1c7fdcce8a5eedaa18bc). Every other job caps
   at the highest equip level in the item database (MAX_LEVEL in tables.ts, 100). */
export const JOB_LEVEL_CAPS: Readonly<Record<string, number>> = Object.freeze({ ...ITEM_FORMAT.jobLevelCaps });
/* A job's always-on haste: its name and its steps ({level, pct, source}), in level order (HASTE). */
export interface HasteTrait {
  readonly name: string;
  readonly steps: readonly { readonly level: number; readonly pct: number; readonly source: string }[];
}
/* Haste that is up all fight in practice, counted in the Target GCD (owner's decision; short buffs such as
   Presence of Mind, Ley Lines, Army's Paeon and Inspiration are not): job -> {name, steps: [{level (the level it starts
   at), pct (percent), source (the trait or action that gives it)}]}, steps in level order. Percents, levels and names from the official job guides
   (https://na.finalfantasyxiv.com/jobguide/, read 2026-10-15, rechecked 2026-10-16). A level synced below the job's
   starting level is real (a Samurai, from 50, synced to Sastasha's 18): the step's own level decides. Samurai's 10%
   below 78 is second-hand (Game8, xivgear): the guide gives only today's 13% and the trait that raises it. xivgear
   applies Ninja's and Viper's at every level. */
export const HASTE: Readonly<Record<string, HasteTrait>> = Object.freeze({
  MNK: Object.freeze({
    name: 'Greased Lightning',
    steps: Object.freeze([
      { level: 1, pct: 5, source: 'Greased Lightning' },
      { level: 20, pct: 10, source: 'Enhanced Greased Lightning' },
      { level: 40, pct: 15, source: 'Enhanced Greased Lightning II' },
      { level: 76, pct: 20, source: 'Enhanced Greased Lightning III' },
    ]),
  }),
  NIN: Object.freeze({ name: 'Increase Attack Speed', steps: Object.freeze([{ level: 45, pct: 15, source: 'Increase Attack Speed' }]) }),
  SAM: Object.freeze({
    name: 'Fuka',
    steps: Object.freeze([
      { level: 18, pct: 10, source: 'Shifu' },
      { level: 78, pct: 13, source: 'Enhanced Fugetsu and Fuka' },
    ]),
  }),
  VPR: Object.freeze({ name: 'Swiftscaled', steps: Object.freeze([{ level: 20, pct: 15, source: "Swiftskin's Sting" }]) }),
});
/* The shortest recast speed and haste can give a weaponskill or spell, in ms. Second-hand: the game client's recast
   adjustment, as reverse-engineered by ffxiv_bossmod (its TODO notes on GetAdjustedRecastTime, 7.0: speed multiplier
   (at least 0), then haste, then "min 1500"), and players' reports of a 1.50 s cap. xivgear clamps only at 0 and
   AkhMorning gives none. No real setting comes near it (the fastest found: 1.83 s, Samurai at level 90 with Fuka); a
   cap above every real duty's at a low level does (docs/mechanics/math.md section 6). */
export const GCD_FLOOR_MS = 1500;
/* Expansions in order: {short (name), name (in full), levelCap}. The item level boundary after each one is the game's
   own sync item level at its level cap (ParamGrow), see expansionBounds in items.js. */
export const EXPANSIONS = Object.freeze([
  Object.freeze({ short: 'ARR', name: 'A Realm Reborn', levelCap: 50 }),
  Object.freeze({ short: 'HW', name: 'Heavensward', levelCap: 60 }),
  Object.freeze({ short: 'SB', name: 'Stormblood', levelCap: 70 }),
  Object.freeze({ short: 'ShB', name: 'Shadowbringers', levelCap: 80 }),
  Object.freeze({ short: 'EW', name: 'Endwalker', levelCap: 90 }),
  Object.freeze({ short: 'DT', name: 'Dawntrail', levelCap: 100 }),
]);

/* The job picker's rows, in the game's own role grouping and order. This is not the stat profile: Ninja and Viper are
   melee here but use the Dexterity profile with the ranged jobs. */
export const JOB_ROWS: readonly (readonly [string, readonly string[]])[] = Object.freeze([
  Object.freeze(['Tanks', Object.freeze(['PLD', 'WAR', 'DRK', 'GNB'])] as const),
  Object.freeze(['Healers', Object.freeze(['WHM', 'SCH', 'AST', 'SGE'])] as const),
  Object.freeze(['Melee', Object.freeze(['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BST'])] as const),
  Object.freeze(['Physical ranged', Object.freeze(['BRD', 'MCH', 'DNC'])] as const),
  Object.freeze(['Magical ranged', Object.freeze(['BLM', 'SMN', 'RDM', 'PCT', 'BLU'])] as const),
]);

/* Field positions in an item database row (src/data/items.json; written by scripts/data/gen_items.py), by name from
   `itemRow.fields` in item-format.json (field i is fields[i]; each section's `rowField` agrees). Read a row as
   row[ROW.ilvl], never row[2]; parseRow in items.js turns a whole row into an object.
   - slotCode: index into `slots` of item-format.json (DB_SLOT_TYPE, DB_SLOT_PCT, DB_SLOT_BLOCKS)
   - equipLevel: the character level needed to wear it
   - jobMask: bit i set when JOBS[i] can wear it
   - stats: comma-joined raw stats in ITEM_STAT_ORDER (rowStats in items.js splits them)
   - unique: 1 when only one can be worn (rings); hq: 1 when it can be high quality (the stats are then the HQ ones)
   - routes: the ways to get the piece, a list of bit masks over ACTIVITIES (bit ACTIVITY_MARKET_BIT: the market board);
     any one route whose every bit is allowed lists it (routesAllow in items.js). Empty: it can no longer be obtained
   - kind: the item's stat factor kind, a column of the stat factor table MP in tables.ts (kindFactors in items.js)
   - meldSlots: guaranteed materia slots, 0 to 5; overmeld: 1 when overmelding is allowed (`materia` in item-format.json)
   - rarity: Item.Rarity (1 white, 2 green, 3 blue, 4 purple, 7 pink); gameId: the game's item id (Item.csv row)
   - scales: 1 when its item level follows the wearer's level (Item.SubStatCategory 2; syncTarget) */
export const ROW = Object.freeze(
  Object.fromEntries(ITEM_FORMAT.itemRow.fields.map((field, position) => [field, position])),
) as unknown as RowIndex;
/* The weapon damage and defense keys of a row (`damageDefense` in item-format.json): damagePhys, damageMag,
   defensePhys, defenseMag. */
export const DAMAGE_DEFENSE_KEYS = Object.freeze(ITEM_FORMAT.damageDefense.entries.map(e => e.key)) as readonly DamageDefenseKey[];
/* The gear categories, in the order of a row's category field: {key, label} (where a piece comes from: Crafted,
   Dungeon, Raid, ...; gear_categories.py). */
export const GEAR_CATEGORIES = Object.freeze(ITEM_FORMAT.category.list.map(c => Object.freeze({ key: c.key, label: c.label })));
export const ITEM_STAT_ORDER = Object.freeze(ITEM_FORMAT.stats.map(s => s.key)) as readonly RawStatKey[];
export const RAW_MAIN_IDX = Object.freeze((['str', 'dex', 'int', 'mind'] as const).map(k => ITEM_STAT_ORDER.indexOf(k)));
export const RAW_VIT_IDX = ITEM_STAT_ORDER.indexOf('vit');
/* Mind's position in a row's raw stats: the old healer gear whose only main stat is Mind carries a fixed Direct Hit line
   (formulas.js fixedDirectHitShare). */
export const RAW_MIND_IDX = ITEM_STAT_ORDER.indexOf('mind');
/* The game's generic "Main Attribute" (pre-order earrings): the wearer's main stat (see items.js dbStats, which also
   maps the generic "Secondary Attribute"). */
export const RAW_MAIN_ATTR_IDX = ITEM_STAT_ORDER.indexOf('mainAttr');
/* Indices into a row's raw stat array (ITEM_STAT_ORDER), not stat keys. Substats: every stat but the main stats, Vitality and Main Attribute (Secondary Attribute ranks as a substat). */
export const RAW_SUBSTAT_IDX = Object.freeze(
  ITEM_STAT_ORDER.map((_, i) => i).filter(i => !RAW_MAIN_IDX.includes(i) && i !== RAW_VIT_IDX && i !== RAW_MAIN_ATTR_IDX),
);
/* slot code -> pool slot type; codes 0 = two-handed, 1 = one-handed weapon, 12 = body that also covers the head */
export const DB_SLOT_TYPE = Object.freeze(ITEM_FORMAT.slots.map(s => s.type)) as readonly SlotType[];
export const DB_SLOT_PCT = Object.freeze(ITEM_FORMAT.slots.map(s => s.percent));
/* slot code -> the slot types a piece in it leaves empty: the off-hand for a two-handed weapon, the head for a cloak */
export const DB_SLOT_BLOCKS = Object.freeze(
  ITEM_FORMAT.slots.map(s => Object.freeze(s.twoHanded ? ['offhand'] : s.blocks || [])),
) as readonly (readonly SlotType[])[];
/* The slot code of a two-handed weapon (`twoHanded` in item-format.json). */
export const TWO_HANDED_SLOT_CODE = ITEM_FORMAT.slots.findIndex(s => s.type === 'weapon' && s.twoHanded);
/* The boxes of the "Gear categories" filter, by what a player does to get a piece (scripts/data/gear_activities.py):
   {key, label, section, on (ticked by default), hint, bit}, in the menu's order. Bit i of a route mask = ACTIVITIES[i]. */
export const ACTIVITIES = Object.freeze(
  ITEM_FORMAT.activities.map((a, i) =>
    Object.freeze({ key: a.key, label: a.label, section: a.section, on: a.on, hint: a.hint, bit: 1 << i }),
  ),
);
/* The route bit of the market board: a tradeable piece has the route made of this bit alone. */
export const ACTIVITY_MARKET_BIT = 1 << ITEM_FORMAT.activities.length;
