/* The shared types of src/core: the game's own records as the code reads them. Types only, no runtime code: Node strips
   them, esbuild drops them. Local types (a function's options, a search's state) stay next to the code that uses them.

   Where a type is derived: the stat keys, slot types, profile ids and weapon modes come from the tables in constants.ts
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

/* The dimensions the optimizer tracks per candidate: the stat keys, and weapon damage under 'wd' (WD_KEY in damage-defense.ts). */
export type DimKey = StatKey | 'wd';

/* An immutable description of everything that depends on the selected job (makeJobContext in job-context.ts; the fields
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
   it through ROW: row[ROW.ilvl], never row[2]; the fields are explained at ROW in constants.ts). `stats` holds the raw
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
   Vitality HQ maximum] or null] (food.ts allMeals). */
export type FoodRow = readonly [
  name: string,
  ilvl: number,
  stats: readonly (readonly [stat: RawStatKey, pct: number, max: number])[],
  vitality: readonly [pct: number, max: number] | null,
];

/* A pool item: a piece the optimizer searches or a set holds (mkItem in items.ts; the fields are explained there). Frozen:
   nothing may change one after it is made. A database piece (src 'game') also has its gameId and hq; a hand-made one may
   carry its own `meld`. */
export interface PoolItem {
  readonly id: string;
  readonly name: string;
  readonly type: SlotType;
  readonly ilvl: number;
  readonly stats: StatMap;
  /* how many of it can be worn at once */
  readonly copies: number;
  readonly src: 'game' | 'generated' | 'custom';
  /* the game's item id, on a database piece */
  readonly gameId?: number;
  /* can be high quality (a database piece) */
  readonly hq?: boolean;
  /* the item's own melding facts, on a hand-made piece (meldInfo) */
  readonly meld?: MeldInfo;
}

/* The materia slots of a pool item: the guaranteed slots, and whether overmelding is allowed (meldInfo in items.ts). */
export interface MeldInfo {
  readonly slots: number;
  readonly overmeld: boolean;
}

/* The settings that sync a piece: the item level cap (null for none), whether item level sync is on, and the synced
   character level (null or missing: no level sync). itemSyncIlvl in piece.ts. */
export interface Sync {
  readonly cap: number | null;
  readonly sync: boolean;
  readonly level?: number | null;
}

/* A stone in a meld slot: the stat key it raises and its grade (1 to 12). A slot with no stone is null. */
export interface Stone {
  readonly stat: StatKey;
  readonly grade: number;
}

/* One piece of a set (set.ts): a database piece by its game id, a custom pool item, or an empty slot (neither). `stones`:
   one entry per meld slot, [] for no melds. */
export interface SetPiece {
  readonly slot: SlotType;
  readonly gameId?: number;
  readonly custom?: PoolItem;
  readonly stones?: readonly (Stone | null)[];
}

/* Gear totals by key: the stat keys, and weapon damage under 'wd' (the optimizer's dimensions, DimKey). A key it lacks
   counts as 0. */
export type Totals = Partial<Record<DimKey, number>>;

/* A run of stones of one stat and grade in a meld: `n` stones of `grade` in `stat`. */
export interface StoneGroup {
  readonly stat: StatKey;
  readonly grade: number;
  readonly n: number;
}

/* A piece's melds, as bestMeld and applyStones give them (meld.ts): the points the stones add per stat after the cap
   (`gain`), the stones in slot order (the best grades first), and how many slots stay empty. */
export interface Meld {
  readonly gain: StatMap;
  readonly stones: readonly StoneGroup[];
  readonly free: number;
}

/* A gear set as plain frozen data (makeSet in set.ts; the fields are explained there): one piece per row of the character
   panel, and the meal's key or null. */
export interface GearSet {
  readonly pieces: readonly SetPiece[];
  readonly meal: string | null;
}

/* A candidate's effective stats: after sync and melds, by stat key; weapon damage under 'wd' when the job ranks it; and, in
   a search with regain cuts, the cuts' synthetic stats ('regain0', ...). Not every key is present: a missing one reads 0. */
export type Eff = Record<string, number>;

/* One piece as the optimizer sees it (buildCandidates in optimizer/candidates.js; the fields are explained there). The
   searches read it, and a result shows it. `score` and `sum` are set by buildCandidates after the candidate is made. */
export interface Candidate {
  item: PoolItem;
  eff: Eff;
  copies: number;
  blocks: readonly SlotType[];
  meld: Meld | null;
  score: number;
  sum: number;
  /* every meld version of the piece, this one among them (itemVersions only) */
  versions?: Candidate[];
  /* true on a pinned piece (fixedCandidate) */
  fixed?: boolean;
  /* the candidate a regain cut copy stands for (regain.ts) */
  original?: Candidate;
}

/* A limit on a stat's total over the whole loadout (optimizer/search.js): a minimum (null or 0 for none) and a maximum
   (null for none). `cut` marks a regain cut's synthetic stat. */
export interface Limit {
  stat: string;
  min: number | null;
  max: number | null;
  cut?: boolean;
}

/* A maximum an earlier search proved (optimizer/regain.js): under its speed rule ('band' for a maximum too, 'min' for a
   minimum only, null for none) and minimums on `minStats`, no loadout has more than `most` points of `stat`. */
export interface Proven {
  stat: string;
  most: number;
  minStats: readonly string[];
  speed: 'band' | 'min' | null;
}

/* A worn piece of an optimizer result: its slot type, the pool item, its effective stats and melds; `pinned` on a pinned piece. */
export interface FilledPick {
  type: SlotType;
  item: PoolItem;
  eff: Eff;
  meld?: Meld | null;
  pinned?: boolean;
}
/* An empty slot of an optimizer result: the item that leaves it empty (a cloak for the head), if any. */
export interface EmptyPick {
  type: SlotType;
  item: null;
  blockedBy?: PoolItem | null;
  eff?: undefined;
  meld?: undefined;
  pinned?: undefined;
}
/* One slot of an optimizer result (solve in optimizer/index.js), in the character panel's order. */
export type SlotPick = FilledPick | EmptyPick;

/* One slot of a search's loadout (optimizer/search.js): its candidate (null for an empty slot), the candidate's rank in its
   slot's list (-1 for an empty slot or a seed's piece), and, on a slot a chosen piece leaves empty, the piece that does. */
export interface SlotEntry {
  cand: Candidate | null;
  rank: number;
  blockedBy?: Candidate | { item: PoolItem };
}

/* An optimizer result that found a loadout (solve in optimizer/index.js; the fields are explained there): the picks in the
   character panel's order, the gear totals over the dimensions, and what the search did. */
export interface SolveSuccess {
  ok: true;
  picks: SlotPick[];
  totals: Eff;
  truncated: boolean;
  nodes: number;
  noMeldData: number;
  method: 'trial' | 'fronts' | 'search';
  kept: number;
  frontSizes?: number[];
}
/* An optimizer result with no feasible loadout. */
export interface SolveFailure {
  ok: false;
  truncated: boolean;
  nodes: number;
  noMeldData: number;
  method: 'trial' | 'fronts' | 'search';
  kept: number;
  frontSizes?: number[];
}
/* What solve and optimize return. */
export type SolveResult = SolveSuccess | SolveFailure;
