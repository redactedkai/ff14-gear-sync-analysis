/* The shapes the set page's session and its five parts share (session.ts, menus.ts, edits.ts, fill-run.ts, fill-settings-edit.ts,
   leave-guard.ts): what the element gives the session (`ports`, `host`), the solver as the page asks it, the job, and the Auto-fill
   settings. The views the page draws are in set-page-types.ts; the store's state in ui/store/app-state.ts. */
import type { makeJobContext } from '../../../core/job-context.ts';
import type { AppStore, GearSet, Suggestion } from '../../store/app-state.ts';
import type { SheetsFacade } from '../../store/sheets-facade.ts';

/* The job's names, stats and keys (core/job-context.ts makeJobContext). */
export type JobContext = ReturnType<typeof makeJobContext>;

/* A request to the solver (ui/solver.js solverRequest): `kind` 'solve' (an Auto-fill) or 'gearToSearch' (the count line); the job's
   id, the sync settings, the level and the recipe are plain data; `key` names the caller (a gear set's id); `pins` the slots an
   Auto-fill keeps. */
export interface SolverRequest {
  kind: string;
  jobId: string;
  sync: unknown;
  level: unknown;
  recipe: unknown;
  key?: string | number;
  pins?: unknown;
}

/* The solver as the page asks it (ui/solver.js inProcessSolver, workerSolver): `blocksPage` is true when a solve holds the page's
   thread (so the page paints "Solving…" first); `request` answers with the handler's `result` (its shape depends on the kind: `Result`)
   and the time it took (ms); `cancel` stops the request of a kind and key, and says whether it did. */
export interface Solver {
  blocksPage: boolean;
  request<Result = unknown>(request: SolverRequest): Promise<{ result: Result; ms: number }>;
  cancel(kind: string, key?: string | number): boolean;
}

/* What the page needs of the rest of the page: the store (to follow), its Sheets facade (to read and to act), the solver for Auto-fill
   and Gear to search, and the highest real item level (the Auto-fill settings' item level range). */
export interface SetPagePorts {
  store: AppStore;
  sheets: SheetsFacade;
  solver: Solver;
  maxReal: number;
}

/* What the session needs of the element it serves: whether it is in the page, whether a dialog of the Sheets tab is open, an element
   of the page by selector (or null), a callback run once the page has drawn the change just made (unless the page is gone by then),
   and a request to draw again. */
export interface SessionHost {
  readonly isConnected: boolean;
  readonly dialogOpen: boolean;
  query(selector: string): HTMLElement | null;
  afterDraw(callback: () => void): void;
  requestUpdate(): void;
}

/* The goal part of a set's Auto-fill settings (sheets/fill-settings.js defaultFillSettings): the stat to maximize and two tiebreaks
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

/* A set's Auto-fill settings (sheets/fill-settings.js fillSettingsOf). */
export interface FillSettings {
  goal: FillGoal;
  searchCriteria: FillSearchCriteria;
}

/* One option of a select (<gsa-select>): the value it sets and the label it shows. */
export interface SelectOption {
  value: string;
  label: string;
}

/* One row of a gear set's pieces: the slot's code, and for a used row the piece's gameId (an empty slot has none) and its materia
   (null: an empty materia slot). */
export interface GearRow {
  slot: string;
  gameId?: number | null;
  stones?: ({ stat: string; grade: number } | null)[];
}

/* The pins of a gear set: the rows an Auto-fill keeps (their indexes) and whether it keeps the meal. */
export interface GearPins {
  pieces: number[];
  meal: boolean;
}

/* A gear set as the set page reads it (sheets/ops.js newGearSet): the store types the fields it reads (GearSet); these are the
   ones the page's edits and Auto-fill read besides. */
export interface PageGearSet extends GearSet {
  pieces: GearRow[];
  meal: string | null;
  pinned?: GearPins;
  fillSettings?: FillSettings | null;
}

/* What the page makes of the solver's reply to an Auto-fill (views/set-suggestion.js fillAnswerView): a `suggestion` to show; a
   `badpin` (pins the set cannot keep: the lines to say, the rows that stay pinned and the ones dropped, whether the meal's pin is
   dropped, and the line naming what was unpinned); or a `failed` answer with its line. */
export type FillAnswer =
  | { kind: 'suggestion'; suggested: Suggestion['suggested'] }
  | {
      kind: 'badpin';
      messages: string[];
      pinnedRows: number[];
      droppedRows: number[];
      mealDropped: boolean;
      droppedText: string;
    }
  | { kind: 'failed'; text: string };
