/* The shapes of the saved data: a sheet and the gear sets inside it, as storage.ts reads and writes them and the page holds them
   (docs/engineering/sheets.md, "Saved data"). Types only, no runtime code: Node strips them, esbuild drops them. Every field a reader
   checks (storage.ts sheetProblem) is typed; a field marked optional may be missing in an older record. */
import type { SlotType, Stone } from '../../core/types.ts';

/* A stone in a materia slot: {stat (a stat key), grade (1 to 12)}; null is an empty slot. */
export type SavedStone = Stone;

/* One row of a gear set's pieces: its slot, and for a row that holds a piece its game id and its stones (one entry per materia slot,
   null for an empty one). An empty row is {slot} alone. */
export interface SavedRow {
  slot: SlotType;
  gameId?: number | null;
  stones?: (SavedStone | null)[];
}

/* The pins of a gear set: the rows an Auto-fill keeps (their indexes) and whether it keeps the meal. */
export interface GearPins {
  pieces: number[];
  meal?: boolean;
}

/* The goal part of a set's Auto-fill settings (sheets/fill-settings.ts defaultFillSettings): the stat to maximize and two tiebreaks
   ('' for none), the Target GCD typed ('' for any), whether it is exact or a limit, and the switches. */
export interface FillGoal {
  target: string;
  tb: string;
  tb2: string;
  gcd: number | '';
  gcdMode: string;
  byTier: boolean;
  melds: boolean;
  food: boolean;
}

/* The Gear to search part: the filters (`min`, `max` and `lvl` are '' for no limit). */
export interface FillSearchCriteria {
  expOff: string[];
  exclude: string[];
  market: boolean;
  min: number | '';
  max: number | '';
  lvl: number | '';
}

/* A set's Auto-fill settings as the set page uses them (sheets/fill-settings.ts fillSettingsOf): every field there. */
export interface FillSettings {
  goal: FillGoal;
  searchCriteria: FillSearchCriteria;
}

/* A set's Auto-fill settings as saved: each part, and each field of it, may be missing (fillSettingsOf fills them in). */
export interface SavedFillSettings {
  goal?: Partial<FillGoal>;
  searchCriteria?: Partial<FillSearchCriteria>;
}

/* A saved gear set (sheets/ops.ts newGearSet): `pieces` are the 12 rows in SLOT_TYPES order with 'ring' twice; `meal` an allMeals key
   or null; `bestMeals` the meals tagged "best for goal" (a hint: a damaged one is dropped on read). */
export interface SavedGearSet {
  id: string;
  name: string;
  description?: string;
  pieces: SavedRow[];
  meal: string | null;
  bestMeals?: string[] | null;
  pinned?: GearPins;
  fillSettings?: SavedFillSettings | null;
  createdAt: number;
  updatedAt: number;
}

/* A saved sheet (sheets/ops.ts newSheet): its gear sets inside. `v` is the record's version (SHEET_VERSION), `gameData` the game data it
   was made with ({commit, date}), `clan` and `partyRoles` the player's own bonus (missing: none). */
export interface SavedSheet {
  v: number;
  id: string;
  name: string;
  description?: string;
  job: string;
  level: number;
  sync: { on: boolean; cap: number };
  clan?: string | null;
  partyRoles?: number;
  sets: SavedGearSet[];
  gameData?: { commit: string; date: string };
  createdAt: number;
  updatedAt: number;
}
