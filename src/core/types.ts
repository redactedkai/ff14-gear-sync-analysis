/* The shared types of src/core: the game's own records as the code reads them. Types only, no runtime code: Node strips
   them, esbuild drops them. Local types (a function's options, a search's state) stay next to the code that uses them.

   Where a type is derived: the stat keys, slot types, profile ids and weapon modes come from the tables in constants.js
   (STAT_LABEL, SLOT_TYPES, PROFILES), so a new key is written once. The item row and the names of its fields come from
   item-format.json, which TypeScript reads only as `string`; ItemRow and RowIndex below are written to match it, and
   tests/unit/core/item-format.test.js checks ROW against both the file and RowIndex. */
import type {
  DamageDefenseKey,
  DamageKey,
  MainStatKey,
  ProfileId,
  RawStatKey,
  SlotType,
  SpecKey,
  SpeedKey,
  StatKey,
  WeaponMode,
} from './constants.ts';

export type { DamageDefenseKey, DamageKey, MainStatKey, ProfileId, RawStatKey, SlotType, SpecKey, SpeedKey, StatKey, WeaponMode };

/* Points by stat key ({stat key: points}): a piece's stats, a set's totals, a cap. A key it lacks counts as 0 (readers
   write `stats[s] || 0`). */
export type StatMap = Partial<Record<StatKey, number>>;

/* A table with one entry for each of a job's own stat keys (job.stats): JobContext's labels, short names and attribute
   modifiers. The type lists every StatKey; a key the job lacks has no entry and reads undefined at runtime. */
export type PerStat<T> = Readonly<Record<StatKey, T>>;

/* The dimensions the optimizer tracks per candidate: the stat keys, and weapon damage under 'wd' (WD_KEY in damage-defense.js). */
export type DimKey = StatKey | 'wd';

/* An immutable description of everything that depends on the selected job (makeJobContext in job-context.js; the fields
   are explained there). Core functions take it as their first argument. */
export interface JobContext {
  readonly jobId: string;
  readonly jobName: string;
  /* the job's position in the item database's job mask (bit jobIndex) */
  readonly jobIndex: number;
  readonly profileId: ProfileId;
  readonly mainKey: MainStatKey;
  readonly speedKey: SpeedKey;
  /* null for a job without a special substat */
  readonly specKey: SpecKey | null;
  /* [mainKey, 'vit', ...substats] */
  readonly stats: readonly StatKey[];
  readonly substats: readonly StatKey[];
  readonly label: PerStat<string>;
  readonly short: PerStat<string>;
  readonly weaponMode: WeaponMode;
  /* slot share per mille by slot type, the job's own for a hand-made weapon */
  readonly slotPct: Readonly<Record<SlotType, number>>;
  readonly activeSlotTypes: readonly SlotType[];
  /* the job's modifier in percent of its main stat and Vitality */
  readonly attributeMods: PerStat<number>;
  readonly vitFactor: number;
  readonly maxLevel: number;
  /* null for a job whose weapons carry no weapon damage (Blue Mage) */
  readonly damageKey: DamageKey | null;
}

/* A database row of src/data/items.json, one entry per field of `itemRow.fields` in item-format.json, in that order (read
   it through ROW: row[ROW.ilvl], never row[2]; the fields are explained at ROW in constants.js). `stats` holds the raw
   stats comma-joined in ITEM_STAT_ORDER (rowStats splits them); `routes` the bit masks over ACTIVITIES. */
export type ItemRow = readonly [
  name: string,
  slotCode: number,
  ilvl: number,
  equipLevel: number,
  jobMask: number,
  stats: string,
  unique: number,
  hq: number,
  routes: readonly number[],
  kind: number,
  meldSlots: number,
  overmeld: number,
  rarity: number,
  gameId: number,
  scales: number,
  category: number,
  damagePhys: number,
  damageMag: number,
  defensePhys: number,
  defenseMag: number,
];

/* The type of ROW: each field name of an item row and its position in ItemRow, so row[ROW.ilvl] has the field's own type. */
export interface RowIndex {
  readonly name: 0;
  readonly slotCode: 1;
  readonly ilvl: 2;
  readonly equipLevel: 3;
  readonly jobMask: 4;
  readonly stats: 5;
  readonly unique: 6;
  readonly hq: 7;
  readonly routes: 8;
  readonly kind: 9;
  readonly meldSlots: 10;
  readonly overmeld: 11;
  readonly rarity: 12;
  readonly gameId: 13;
  readonly scales: 14;
  readonly category: 15;
  readonly damagePhys: 16;
  readonly damageMag: 17;
  readonly defensePhys: 18;
  readonly defenseMag: 19;
}

/* A meal of src/data/food.json: [name, item level, [[raw stat key, HQ percent, HQ maximum], ...], [Vitality HQ percent,
   Vitality HQ maximum] or null] (food.js allMeals). */
export type FoodRow = readonly [
  name: string,
  ilvl: number,
  stats: readonly (readonly [stat: RawStatKey, pct: number, max: number])[],
  vitality: readonly [pct: number, max: number] | null,
];
