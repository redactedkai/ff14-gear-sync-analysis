/* The page's state in the store (store.ts): its shape, its first value, and the selectors that read it. The actions that
   change it are in app-actions.ts (settings, screen, math), sheets-actions.ts (the Sheets tab).

   Decisions of the design:
   - Five slices, the top-level keys, and an action is named '<slice>/<name>' ('settings/setJob'); the slice's revision counts it.
     The settings, screen and math slices are split into parts (`STATE_PARTS`), each with a revision that counts the actions that
     changed it (store.ts compares the part before and after), so a reader of the Gear browser's filters is not run again by a
     change of a panel. A getter of the facade reads the revision of the parts it returns, no more.
       settings  what is saved: the Gear browser's filters, Stat Allocation's piece, the sheet list's figures, Substat tiers' job,
                 and each reference tab's Job and sync panel (job, cap, sync, level).
       screen    the open tab and math sub-tab, and the tab a click is opening. Not saved: the address names it.
       math      the GCD sub-tab's settings and the level typed on Substat tiers. Not saved.
       sheets    the Sheets tab: the saved sheets as loaded, the screen it shows (manager, sheet, gear set), the notes, the lock.
       setPages  one entry per gear set page that is open: its draft, its suggestion and its Auto-fill status.
   - A tab's panel is held once, in `settings.panels`. The old store's top-level job, cap, sync and level (a copy of the open
     tab's panel, swapped by showTab) are gone: read `panelOf(state, tab)`. `persisted` puts each panel back into its tab's group,
     so the saved JSON is the old store's, key for key.
   - Big data stays out of the state or goes in by reference and frozen: the item database is a module constant, and a suggestion
     is the frozen object the solver returned. A sheet is plain data that an action replaces, never edits in place.
   - What is saved, what the screens show and what a user can do are separate: `persisted` is a selector, not a field.
   - The leave guard (a function the set page registers) and the clock, ids, storage and frame scheduler are not state: they are
     options of the action creators, so a test hands in its own.
   - An action that would change nothing returns before it calls `update` (no revision, no render, no save). One that changes
     two slices (a job change that clears Substat tiers' typed level) makes two `update` calls; they are one notification.
   - A selector that returns a new object each time (`panelOf`, `routeOf`) is read with `shallowEq`; one that returns a piece of
     the state (`currentSheet`, `setPageOf`) or a cached object (`jobCtxOf`) with `Object.is`.
   - A typed number is not checked here: the number box does that (number-commit.js) before it calls an action. The actions
     that take a whole panel (`setPanel`) or a form (the sheet actions) check as they did.
   - Saving (autosave.ts) is one subscription to the store: it watches the `settings` revision, writes the JSON 150 ms after the last
     change (made when it is written, not at each change) and at 'pagehide', and writes once at the start to repair an older shape.
   - Kept from the old store, odd as they are: opening a tab that is already open still applies a math sub-tab; a job change
     on the Sheets tab, which has no panel, does nothing; `openTab` counts requests so only the newest shows. */
import { makeJobContext } from '../../core/job-context.js';
import { syncSettings } from '../job-sync-panel.js';
import { DEFAULT_ROUTE, formatRoute } from '../router/routes.js';
import { Store } from './store.ts';

/* One tab's Job and sync panel: the job's id, the item level cap (null: none), whether item level sync is on, the synced level. */
export interface Panel {
  job: string;
  cap: number | null;
  sync: boolean;
  level: number;
}

/* The tabs that have a Job and sync panel (job-sync-panel.js PANEL_GROUP): the Gear browser and How the math works. */
export type PanelTab = 'browse' | 'math';

/* The tabs that have a Job and sync panel, in the order `settings.panels` holds them. */
export const PANEL_TABS: readonly PanelTab[] = ['browse', 'math'];

/* The panel's four fields, in the order they are saved. */
export const PANEL_KEYS = ['job', 'cap', 'sync', 'level'] as const;

/* Stat Allocation's example piece: item level (null: the cap), slot, two ranked substats (the second may be null), materia
   slots (null: the slot's usual total). */
export interface PieceFields {
  ilvl: number | null;
  slot: string;
  subs: (string | null)[];
  slots: number | null;
}

/* The Gear browser's filters and sort (state.js defaultBrowse); min, max and lvl are '' while their box is empty. */
export interface BrowseFields {
  q: string;
  type: string;
  expOff: string[];
  exclude: string[];
  market: boolean;
  min: number | '';
  max: number | '';
  lvl: number | '';
  sort: string;
  dir: string;
}

/* What is saved (the `settings` slice). */
export interface SettingsState {
  sheetFigures: string;
  piece: PieceFields;
  browse: BrowseFields;
  tiers: { job: string };
  panels: Record<PanelTab, Panel>;
}

/* The open tab and the tab being opened (the `screen` slice). tab: 'sheets', 'browse' or 'math'; mathTab: 'piece', 'gcd' or
   'tiers'. pendingTab: the tab a click is opening, or null; openingTabRequest counts the clicks, so only the newest opening
   shows. */
export interface ScreenState {
  tab: string;
  mathTab: string;
  pendingTab: string | null;
  openingTabRequest: number;
}

/* The math tab's unsaved settings (the `math` slice). gcd.level: a level typed into its box, or null to follow the synced
   level; gcd.haste: a HASTE job id, or '' for none; gcd.speed: the total speed asked for, or null for the level's base.
   tiersLevel: a level typed on Substat tiers, or null for the job's level cap. */
export interface MathState {
  gcd: { level: number | null; haste: string; speed: number | null };
  tiersLevel: number | null;
}

/* A gear set as saved (sheets/ops.js newGearSet): the fields the store reads are typed, the rest pass through. */
export interface GearSet {
  id: string;
  name: string;
  bestMeals?: string[] | null;
  [field: string]: unknown;
}

/* A sheet as saved (sheets/ops.js newSheet): its gear sets inside. The fields the store reads are typed, the rest pass through. */
export interface Sheet {
  id: string;
  name: string;
  description: string;
  job: string;
  level: number;
  sync: { on: boolean; cap: number };
  clan?: string | null;
  partyRoles?: number;
  sets: GearSet[];
  updatedAt: number;
  [field: string]: unknown;
}

/* What storage.js loadSheets returns: the readable sheets in the user's order, the records that could not be read, and why the
   index could not. */
export interface SheetsData {
  available: boolean;
  sheets: Sheet[];
  unreadable: { id: string; key: string; cause?: string }[];
  indexProblem: string | null;
}

/* The Sheets tab (the `sheets` slice). screen: 'sheets' (the manager), 'sheet' or 'set'; sheetId and setId: the open sheet and
   gear set (screen state, never saved); missing: the sheet or set an address named that is not saved, {sheetId, setId (null:
   the sheet)}, or null; data: the saved sheets as last read or edited (plain, replaced by an action, never edited in place);
   unsaved: the ids of sheets whose last save failed, and ORDER_MARK when the order's did; saveMessage: the last failed save's
   message ('' when all are saved); noteText and noteSeq: the note after an action, counted even when identical; busy: an
   Auto-fill runs, so every edit is refused. */
export interface SheetsState {
  screen: string;
  sheetId: string | null;
  setId: string | null;
  missing: { sheetId: string; setId: string | null } | null;
  data: SheetsData;
  unsaved: Set<string>;
  saveMessage: string;
  noteText: string;
  noteSeq: number;
  busy: boolean;
}

/* Where an Auto-fill of a gear set is: 'idle', 'running', 'waiting' (a result waits for Apply or Discard), 'failed' or
   'cancelled'. */
export type FillStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'cancelled';

/* A gear set's Auto-fill settings' answer from the solver (the Gear to search line): countText ("searching 1,939 of 1,999
   pieces", or "count failed: ..."), searched (how many pieces Gear to search leaves in the pool; null until the first count has
   landed), fromCounts (the pieces per "Gear categories" box, {box key: count}; null while they are not known), fromCountsFor (the
   job and filters they were counted under, as text) and gcdLabel (the Target GCD label's parts, ui/solve.js gcdLabel). Frozen. */
export interface GearToSearch {
  countText: string;
  searched: number | null;
  fromCounts: Readonly<Record<string, number>> | null;
  fromCountsFor: string | null;
  gcdLabel: Readonly<{ name: string; range: string; haste: string | null; off: string | null; full: string }>;
}

/* An Auto-fill result waiting for Apply or Discard: suggested ({pieces, meal, bestMeals}, views/set-suggestion.js
   suggestionOf), declined (the Take boxes switched off: {rows: row numbers, meal}). Frozen all through. */
export interface Suggestion {
  readonly suggested: Readonly<Record<string, unknown>>;
  readonly declined: Readonly<{ rows: readonly number[]; meal: boolean }>;
}

/* One open gear set page (an entry of the `setPages` slice, by set id; set-page-actions.ts changes it, and the entry is
   replaced on each change, never edited). draft: its manual edits not yet applied (a GearSet copy, frozen), or null;
   suggestion: the Auto-fill result waiting, or null; fill: the Auto-fill's status; fillId: the running search's id (null when
   none runs); countId: the id of the Gear to search count still on its way (null when none); gearToSearch: that count's
   answer; fillLine: the line the page shows about the search ('' for none). The entry is frozen. A suggestion is there only
   while fill is 'waiting', and a search runs only while fill is 'running'. */
export interface SetPageState {
  readonly draft: Readonly<GearSet> | null;
  readonly suggestion: Suggestion | null;
  readonly fill: FillStatus;
  readonly fillId: number | null;
  readonly countId: number | null;
  readonly gearToSearch: GearToSearch;
  readonly fillLine: string;
}

/* The whole state: one key per slice. */
export interface AppState extends Record<string, object> {
  settings: SettingsState;
  screen: ScreenState;
  math: MathState;
  sheets: SheetsState;
  setPages: Record<string, SetPageState>;
}

/* The store of the page. */
export type AppStore = Store<AppState>;

/* The mark in `SheetsState.unsaved` for the order of the sheets (the index): no sheet id looks like it. */
export const ORDER_MARK = '(order)';

/* The state.js state that restoreState returns (the shape that was saved in one object, with the panel copied into the top
   level), as far as this file reads it. */
export interface RestoredState {
  tab: string;
  mathTab: string;
  sheetFigures: string;
  piece: PieceFields & Panel;
  browse: BrowseFields & Panel;
  tiers: { job: string };
}

/* A panel's four fields copied out of `source` (a panel, or a group that holds one). */
export function panelFields(source: Panel): Panel {
  return { job: source.job, cap: source.cap, sync: source.sync, level: source.level };
}

/* `group` (the old store's piece or browse group, panel fields and own fields together) without the panel fields. */
function ownFields<Own>(group: Own & Panel): Own {
  const { job: _job, cap: _cap, sync: _sync, level: _level, ...own } = group;
  return own as unknown as Own;
}

/* The saved settings of a restored state (state.js restoreState) in the shape of the `settings` slice: each tab's panel apart
   from its group. */
export function settingsOf(restored: RestoredState): SettingsState {
  return {
    sheetFigures: restored.sheetFigures,
    piece: ownFields<PieceFields>(restored.piece),
    browse: ownFields<BrowseFields>(restored.browse),
    tiers: { job: restored.tiers.job },
    panels: { browse: panelFields(restored.browse), math: panelFields(restored.piece) },
  };
}

/* The Gear to search answer before a count has landed: no text, no count, no box counts, the Target GCD label's own name. Frozen. */
export const NO_GEAR_TO_SEARCH: GearToSearch = Object.freeze({
  countText: '',
  searched: null,
  fromCounts: null,
  fromCountsFor: null,
  gcdLabel: Object.freeze({ name: 'Target GCD', range: '', haste: null, off: null, full: 'Target GCD' }),
});

/* A gear set page at rest: nothing drafted, no suggestion, no Auto-fill, no count. Frozen, like every entry. */
export function emptySetPage(): SetPageState {
  return Object.freeze({
    draft: null,
    suggestion: null,
    fill: 'idle',
    fillId: null,
    countId: null,
    gearToSearch: NO_GEAR_TO_SEARCH,
    fillLine: '',
  });
}

/* The one frozen page `setPageOf` hands out for a set with no page open, so reading never adds an entry and the same object
   comes back each time. */
const NO_SET_PAGE: SetPageState = Object.freeze(emptySetPage());

/* The state the page starts with: `restored` (state.js restoreState of what loadSaved gave and the address's screen) and
   `sheetsData` (the saved sheets as sheets/store-shared.js readSheets read them). */
export function initialState(restored: RestoredState, sheetsData: SheetsData): AppState {
  return {
    settings: settingsOf(restored),
    screen: { tab: restored.tab, mathTab: restored.mathTab, pendingTab: null, openingTabRequest: 0 },
    math: { gcd: { level: null, haste: '', speed: null }, tiersLevel: null },
    sheets: {
      screen: 'sheets',
      sheetId: null,
      setId: null,
      missing: null,
      data: sheetsData,
      unsaved: new Set(),
      saveMessage: '',
      noteText: '',
      noteSeq: 0,
      busy: false,
    },
    setPages: {},
  };
}

/* The parts of the slices that have a revision of their own (store.ts StoreOptions.parts): a reader of one part is not run again
   by a change of another. Every key of these slices is in one (the store checks), so a new field must be placed. The `sheets` and
   `setPages` slices are read whole. */
export const STATE_PARTS: Record<string, readonly string[]> = {
  settings: [...PANEL_TABS.flatMap(tab => PANEL_KEYS.map(key => `panels.${tab}.${key}`)), 'browse', 'piece', 'tiers', 'sheetFigures'],
  screen: ['tab', 'mathTab', 'pendingTab', 'openingTabRequest'],
  math: ['gcd', 'tiersLevel'],
};

/* The store of the page for a restored state and the saved sheets. */
export function createAppStore(restored: RestoredState, sheetsData: SheetsData): AppStore {
  return new Store(initialState(restored, sheetsData), { parts: STATE_PARTS });
}

/* ---- selectors: each takes the state and returns plain data; none changes anything ---- */

/* The Job and sync panel of `tab` ('browse', 'math' or 'tiers'), open or not: {job (id), jobCtx, cap, sync, level}. 'tiers' has
   only a job (`settings.tiers.job`): no cap, IL Sync off, and its level is the job's level cap (the level typed on its box is
   `math.tiersLevel`). A new object on each call: compare with shallowEq. */
export function panelOf(state: AppState, tab: string) {
  if (tab === 'tiers') {
    const jobCtx = makeJobContext(state.settings.tiers.job);
    return { job: jobCtx.jobId as string, jobCtx, cap: null, sync: false, level: jobCtx.maxLevel as number };
  }
  const panel = state.settings.panels[tab as PanelTab];
  if (!panel) throw new Error(`The ${tab} tab has no Job and sync panel`);
  return { ...panelFields(panel), jobCtx: makeJobContext(panel.job) };
}

/* The JobContext of `tab`'s panel (makeJobContext caches it: the same object each time, so a Select needs no shallowEq). */
export function jobCtxOf(state: AppState, tab: string) {
  return panelOf(state, tab).jobCtx;
}

/* The sync settings the core takes ({cap, sync, level}) for `tab`'s panel (job-sync-panel.js syncSettings). A new object on
   each call. */
export function syncSettingsOf(state: AppState, tab: string) {
  return syncSettings(panelOf(state, tab));
}

/* The saved fields, as the old store's persisted() gave them: each tab's panel inside its group (piece for the math tab), then
   Substat tiers' job. A new object that shares the arrays inside with the state; nothing is written to the state. */
export function persisted(state: AppState) {
  const { sheetFigures, piece, browse, tiers, panels } = state.settings;
  return {
    sheetFigures,
    piece: { ...panels.math, ...piece },
    browse: { ...panels.browse, ...browse },
    tiers: { job: tiers.job },
  };
}

/* The saved sheets as last read or edited: {available, sheets, unreadable, indexProblem} (storage.js loadSheets' shape), plain
   data. */
export function sheetList(state: AppState): SheetsData {
  return state.sheets.data;
}

/* The saved sheet with `id`, or null. */
export function sheetById(state: AppState, id: string | null) {
  return state.sheets.data.sheets.find(sheet => sheet.id === id) ?? null;
}

/* The open sheet (screens 'sheet' and 'set'), or null. */
export function currentSheet(state: AppState) {
  return state.sheets.screen === 'sheets' ? null : sheetById(state, state.sheets.sheetId);
}

/* The open sheet's gear set with `id`, or null. */
export function setOf(state: AppState, id: string | null) {
  return currentSheet(state)?.sets.find(gearSet => gearSet.id === id) ?? null;
}

/* The open gear set (screen 'set'), or null. */
export function currentSet(state: AppState) {
  return state.sheets.screen === 'set' ? setOf(state, state.sheets.setId) : null;
}

/* The note after the last action ('' when none): the page clears it after a few seconds. */
export function noteOf(state: AppState): string {
  return state.sheets.noteText;
}

/* The address (a hash) of the Sheets screen of `sheetId` and `setId`: the list with neither, the sheet's page with a sheet, the
   gear set's page with both. For the links of the lists and the breadcrumb. */
export function sheetHref(sheetId: string | null = null, setId: string | null = null): string {
  if (!sheetId) return formatRoute({ tab: 'sheets', screen: 'sheets' });
  return formatRoute(setId ? { tab: 'sheets', screen: 'set', sheetId, setId } : { tab: 'sheets', screen: 'sheet', sheetId });
}

/* The state of gear set `setId`'s page, or a frozen page at rest when none is open (the same object each time). */
export function setPageOf(state: AppState, setId: string | null): SetPageState {
  return (setId !== null && state.setPages[setId]) || NO_SET_PAGE;
}

/* What `page` holds that leaving would lose: 'draft' (a manual draft), 'running' (an Auto-fill), 'result' (an Auto-fill result
   waiting), or null for none. The leave question asks it of its own page. */
export function unsettledKind(page: SetPageState): 'draft' | 'running' | 'result' | null {
  if (page.draft !== null) return 'draft';
  if (page.fill === 'running') return 'running';
  return page.fill === 'waiting' ? 'result' : null;
}

/* Whether any gear set page holds work a reload, a closed tab or a move off the page would lose: a manual draft, a running
   Auto-fill or a result waiting. The leave guard and the reload and close guard (router/unload-guard.js) both ask it. A page is
   in the state only while it is open, so a page left holds nothing. */
export function unsettled(state: AppState): boolean {
  return Object.values(state.setPages).some(page => unsettledKind(page) !== null);
}

/* The screen the stores show, as a route without the settings query (router/routes.js): the tab being opened counts as open, a
   sheet or set that an address named and is not saved counts as open too ("not found" keeps its address). The router adds the
   query of the Gear browser and the math views. A new object each call. */
export function routeOf(state: AppState) {
  const { screen, sheets } = state;
  const tab = screen.pendingTab ?? screen.tab;
  if (tab === 'browse') return { tab };
  if (tab === 'math') return { tab, mathTab: screen.mathTab };
  const { missing } = sheets;
  if (missing)
    return missing.setId
      ? { tab, screen: 'set', sheetId: missing.sheetId, setId: missing.setId }
      : { tab, screen: 'sheet', sheetId: missing.sheetId };
  if (sheets.screen === 'set') return { tab, screen: 'set', sheetId: sheets.sheetId, setId: sheets.setId };
  if (sheets.screen === 'sheet') return { tab, screen: 'sheet', sheetId: sheets.sheetId };
  return { ...DEFAULT_ROUTE };
}
