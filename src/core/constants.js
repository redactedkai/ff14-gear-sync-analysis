/* Static game and project constants. Nothing here changes at runtime.
   Internal stat keys are role-neutral: main (Str/Dex/Int/Mind), vit, crit, det, dh,
   spd (Skill/Spell Speed), spec (Piety/Tenacity/none). A JobContext (job-context.js) maps them per job. */

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

/* Slot share of the ItemLevel budget, in thousandths (BaseParam sheet). The weapon value depends on the
   weapon mode (WEAPON_PCT); BASE_SLOT_PCT.weapon is the two-handed value. */
export const WEAPON_PCT = Object.freeze({ '2h': 140, '1h+oh': 100 });
export const BASE_SLOT_PCT = Object.freeze({
  weapon: WEAPON_PCT['2h'],
  offhand: 40,
  head: 85,
  body: 135,
  hands: 85,
  legs: 135,
  feet: 85,
  ear: 67,
  neck: 67,
  wrist: 67,
  ring: 67,
});

/* Substat shares by rank on a piece, in percent. Empirical pattern, not stored in the game files (docs/findings.md). */
export const SUB_WEIGHTS = Object.freeze([100, 70, 20]);

export const MAIN_NAME = Object.freeze({ str: 'Strength', dex: 'Dexterity', int: 'Intelligence', mind: 'Mind' });
export const MAIN_SHORT = Object.freeze({ str: 'Str', dex: 'Dex', int: 'Int', mind: 'Mind' });
export const SPD_NAME = Object.freeze({ sks: 'Skill Speed', sps: 'Spell Speed' });
export const SPD_SHORT = Object.freeze({ sks: 'SkS', sps: 'SpS' });
export const SPEC_NAME = Object.freeze({ piety: 'Piety', ten: 'Tenacity' });
export const SPEC_SHORT = Object.freeze({ piety: 'Piety', ten: 'Ten' });

/* Role profiles: which raw stat each neutral key means. */
export const PROFILES = Object.freeze({
  healer: Object.freeze({ label: 'Healer', main: 'mind', spd: 'sps', spec: 'piety' }),
  tank: Object.freeze({ label: 'Tank', main: 'str', spd: 'sks', spec: 'ten' }),
  melee: Object.freeze({ label: 'Melee DPS (Strength)', main: 'str', spd: 'sks', spec: null }),
  dex: Object.freeze({ label: 'Ranged, Ninja, Viper (Dexterity)', main: 'dex', spd: 'sks', spec: null }),
  caster: Object.freeze({ label: 'Caster (Intelligence)', main: 'int', spd: 'sps', spec: null }),
});

/* [id, name, profile]. The ORDER defines the job bitmask in the item database: bit i = JOBS[i].
   scripts/gen_items.py has the same list as JOB_ORDER; keep them in sync. */
export const JOBS = Object.freeze(
  [
    ['PLD', 'Paladin', 'tank'],
    ['WAR', 'Warrior', 'tank'],
    ['DRK', 'Dark Knight', 'tank'],
    ['GNB', 'Gunbreaker', 'tank'],
    ['WHM', 'White Mage', 'healer'],
    ['SCH', 'Scholar', 'healer'],
    ['AST', 'Astrologian', 'healer'],
    ['SGE', 'Sage', 'healer'],
    ['MNK', 'Monk', 'melee'],
    ['DRG', 'Dragoon', 'melee'],
    ['SAM', 'Samurai', 'melee'],
    ['RPR', 'Reaper', 'melee'],
    ['NIN', 'Ninja', 'dex'],
    ['VPR', 'Viper', 'dex'],
    ['BRD', 'Bard', 'dex'],
    ['MCH', 'Machinist', 'dex'],
    ['DNC', 'Dancer', 'dex'],
    ['BLM', 'Black Mage', 'caster'],
    ['SMN', 'Summoner', 'caster'],
    ['RDM', 'Red Mage', 'caster'],
    ['PCT', 'Pictomancer', 'caster'],
    ['BLU', 'Blue Mage', 'caster'],
  ].map(j => Object.freeze(j)),
);
export const DEFAULT_JOB = 'SGE';
export const ONE_HANDED_JOBS = Object.freeze(['PLD']); /* 1H weapon + off-hand; everyone else uses a 2H weapon */
export const ROLE_GROUP = Object.freeze({
  tank: 'Tanks',
  healer: 'Healers',
  melee: 'Melee DPS',
  dex: 'Ranged and Dexterity DPS',
  caster: 'Casters',
});

/* Item database rows (src/data/items.js): [name, slotCode, ilvl, equipLevel, jobMask, "12 stats", unique] */
export const ITEM_STAT_ORDER = Object.freeze(['str', 'dex', 'int', 'mind', 'vit', 'piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps']);
export const RAW_MAIN_IDX = Object.freeze([0, 1, 2, 3]);
export const RAW_VIT_IDX = 4;
export const RAW_SUBSTAT_IDX = Object.freeze([5, 6, 7, 8, 9, 10, 11]);
/* slot code -> pool slot type; codes 0 = two-handed, 1 = one-handed weapon */
export const DB_SLOT_TYPE = Object.freeze([
  'weapon',
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
]);
export const DB_SLOT_PCT = Object.freeze(DB_SLOT_TYPE.map((t, code) => (code === 1 ? WEAPON_PCT['1h+oh'] : BASE_SLOT_PCT[t])));
