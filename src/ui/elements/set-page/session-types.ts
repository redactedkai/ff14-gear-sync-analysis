/* The shapes the set page's session and its five parts share (session.ts, menus.ts, edits.ts, fill-run.ts, fill-settings-edit.ts,
   leave-guard.ts): what the element gives the session (`ports`, `host`), the job, and the Auto-fill
   settings. The views the page draws are in set-page-types.ts; the store's state in ui/store/app-state.ts. */
import type { makeJobContext } from '../../../core/job-context.ts';
import type { Solver } from '../../solver.ts';
import type { AppStore } from '../../store/app-state.ts';
import type { Declined, SuggestedSet } from '../../views/set-suggestion.ts';
import type { SheetsFacade } from '../../store/sheets-facade.ts';

/* The job's names, stats and keys (core/job-context.ts makeJobContext). */
export type JobContext = ReturnType<typeof makeJobContext>;

export type { Solver, SolverRequest } from '../../solver.ts'; // the solver as the page asks it (inProcessSolver, workerSolver)

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

export type { FillGoal, FillSearchCriteria, FillSettings } from '../../sheets/saved-types.ts';

/* One option of a select (<gsa-select>): the value it sets and the label it shows. */
export interface SelectOption {
  value: string;
  label: string;
}

/* One row of a gear set's pieces, the pins of a gear set, and a gear set as the set page reads it (sheets/saved-types.ts). */
export type { SavedRow as GearRow, GearPins, SavedGearSet as PageGearSet } from '../../sheets/saved-types.ts';

/* What the page makes of the solver's reply to an Auto-fill (views/set-suggestion.ts fillAnswerView): a `suggestion` to show; a
   `badpin` (pins the set cannot keep: the lines to say, the rows that stay pinned and the ones dropped, whether the meal's pin is
   dropped, and the line naming what was unpinned); or a `failed` answer with its line. */
export type { FillAnswer } from '../../views/set-suggestion.ts';

/* The Auto-fill result waiting for Apply or Discard as the page reads it: the store's `suggestion` with `suggested` as
   views/set-suggestion.ts suggestionOf makes it and `declined` the Take boxes switched off. */
export interface PageSuggestion {
  readonly suggested: SuggestedSet;
  readonly declined: Declined;
}
