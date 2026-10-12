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

/* Substat shares by rank on a piece, in percent. Empirical pattern, not stored in the game files (docs/math.md section 4; evidence in docs/validation.md). */
export const SUB_WEIGHTS = Object.freeze([100, 70, 20]);

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
export const ONE_HANDED_JOBS = Object.freeze(['PLD']); /* 1H weapon + off-hand; everyone else uses a 2H weapon */
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
  Object.freeze(['Melee', Object.freeze(['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'])]),
  Object.freeze(['Physical ranged', Object.freeze(['BRD', 'MCH', 'DNC'])]),
  Object.freeze(['Magical ranged', Object.freeze(['BLM', 'SMN', 'RDM', 'PCT', 'BLU'])]),
]);

/* Item database rows (src/data/items.json): [name, slotCode, ilvl, equipLevel, jobMask, "stats", unique, hq, sources,
   statFactor] (statFactor: the item's kind, a column of the stat factor table MP in tables.js) */
export const ITEM_STAT_ORDER = Object.freeze(ITEM_FORMAT.stats.map(s => s.key));
export const RAW_MAIN_IDX = Object.freeze(['str', 'dex', 'int', 'mind'].map(k => ITEM_STAT_ORDER.indexOf(k)));
export const RAW_VIT_IDX = ITEM_STAT_ORDER.indexOf('vit');
export const RAW_SUBSTAT_IDX = Object.freeze(ITEM_STAT_ORDER.map((_, i) => i).filter(i => !RAW_MAIN_IDX.includes(i) && i !== RAW_VIT_IDX));
/* slot code -> pool slot type; codes 0 = two-handed, 1 = one-handed weapon, 12 = body that also covers the head */
export const DB_SLOT_TYPE = Object.freeze(ITEM_FORMAT.slots.map(s => s.type));
export const DB_SLOT_PCT = Object.freeze(ITEM_FORMAT.slots.map(s => s.percent));
/* slot code -> the slot types a piece in it leaves empty: the off-hand for a two-handed weapon, the head for a cloak */
export const DB_SLOT_BLOCKS = Object.freeze(ITEM_FORMAT.slots.map(s => Object.freeze(s.twoHanded ? ['offhand'] : s.blocks || [])));
/* Gear groups the optimizer can leave out (crafted, tomestone, ultimate, savage, relic): bit i of a row's source mask = SOURCES[i]. */
export const SOURCES = Object.freeze(ITEM_FORMAT.sources.map((s, i) => Object.freeze({ key: s.key, label: s.label, bit: 1 << i })));
