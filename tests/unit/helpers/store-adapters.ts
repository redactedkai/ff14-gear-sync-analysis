/* Stand-ins that give the page's store (src/ui/store/) the interface of the app store and the Sheets store the tests were
   written against, so those tests run against the actions unchanged: the
   fields a test reads and writes directly (`store.cap = 200`, `store.browse.q = 'x'`) go to the state, the methods to the
   actions. Test glue, not product code. */
import { restoreState } from '../../../src/ui/state.js';
import { defaultStorage } from '../../../src/ui/sheets/storage.js';
import { readSheets } from '../../../src/ui/sheets/store-shared.js';
import { MAX_REAL } from '../../../src/core/tables.js';
import {
  PANEL_KEYS,
  createAppStore as createStore,
  jobCtxOf,
  panelOf,
  persisted,
  routeOf,
  sheetById,
  sheetList,
  currentSheet,
  currentSet,
  setOf,
} from '../../../src/ui/store/app-state.ts';
import type { AppStore, RestoredState } from '../../../src/ui/store/app-state.ts';
import { createAppActions } from '../../../src/ui/store/app-actions.ts';
import { createSheetsActions } from '../../../src/ui/store/sheets-actions.ts';
import type { LeaveGuard, SheetsActionOptions } from '../../../src/ui/store/sheets-actions.ts';

/* The saved sheets of a page with no storage: none. */
const NO_SHEETS = { available: false, sheets: [], unreadable: [], indexProblem: null };

/* A saved `piece` or `browse` group: the tab's panel fields and its own fields in one object, over the two places the
   state holds them. */
function mergedGroup(panel: Record<string, unknown>, own: Record<string, unknown>): Record<string, unknown> {
  const holder = (key: string | symbol) => (typeof key === 'string' && (PANEL_KEYS as readonly string[]).includes(key) ? panel : own);
  return new Proxy(own, {
    get: (_target, key) => holder(key)[key as string],
    set: (_target, key, value) => {
      holder(key)[key as string] = value;
      return true;
    },
    has: (_target, key) => key in panel || key in own,
    ownKeys: () => [...Object.keys(panel), ...Object.keys(own)],
    getOwnPropertyDescriptor: (_target, key) => {
      const source = key in panel ? panel : own;
      return key in source ? { value: source[key as string], writable: true, enumerable: true, configurable: true } : undefined;
    },
  });
}

/* The old app store over the new one, for a state `restored` (state.js restoreState). The top-level job, cap, sync and level
   are the open tab's panel (the Gear browser's while the Sheets tab, which has none, is open: where the old restore put them). */
export function createAppStore(restored: unknown) {
  const store: AppStore = createStore(restored as RestoredState, NO_SHEETS);
  const actions = createAppActions(store);
  const { state } = store;
  const openPanel = () => state.settings.panels[state.screen.tab === 'math' ? 'math' : 'browse'];
  const panelField = (key: (typeof PANEL_KEYS)[number]) => ({
    get: () => openPanel()[key],
    set: (value: unknown) => {
      (openPanel() as unknown as Record<string, unknown>)[key] = value;
    },
    enumerable: true,
  });
  const adapter = {
    store,
    actions,
    maxReal: MAX_REAL,
    get tab() {
      return state.screen.tab;
    },
    get mathTab() {
      return state.screen.mathTab;
    },
    get pendingTab() {
      return state.screen.pendingTab;
    },
    get jobCtx() {
      return jobCtxOf(state, state.screen.tab === 'math' ? 'math' : 'browse');
    },
    get gcd() {
      return state.math.gcd;
    },
    get tiers() {
      const { settings, math } = state;
      return {
        get job() {
          return settings.tiers.job;
        },
        set job(value: string) {
          settings.tiers.job = value;
        },
        get level() {
          return math.tiersLevel;
        },
        set level(value: number | null) {
          math.tiersLevel = value;
        },
      };
    },
    get piece() {
      return mergedGroup(
        state.settings.panels.math as unknown as Record<string, unknown>,
        state.settings.piece as unknown as Record<string, unknown>,
      );
    },
    get browse() {
      return mergedGroup(
        state.settings.panels.browse as unknown as Record<string, unknown>,
        state.settings.browse as unknown as Record<string, unknown>,
      );
    },
    panel: (tab: string) => panelOf(state, tab),
    persisted: () => persisted(state),
    route: () => routeOf(state),
    setJob: actions.setJob,
    setTiersJob: actions.setTiersJob,
    followLevelSync: actions.followLevelSync,
    setPanel: actions.setPanel,
    resetAll: actions.resetAll,
    openTab: actions.openTab,
    showTab: actions.showTab,
    showSub: actions.showSub,
  };
  for (const key of PANEL_KEYS) {
    Object.defineProperty(adapter, key, panelField(key));
  }
  return adapter as typeof adapter & Record<(typeof PANEL_KEYS)[number], unknown>;
}

/* A sheets store for a test: `createSheetStore({storage, now, makeId})` builds the app store, with the sheets actions bound to it. */
export function createSheetStore(options: SheetsActionOptions = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const store: AppStore = createStore(restoreState(null) as RestoredState, storage ? readSheets(storage) : NO_SHEETS);
  const actions = createSheetsActions(store, { ...options, storage });
  const sheets = () => store.state.sheets;
  return {
    store,
    actions,
    get rev() {
      return store.revs.sheets;
    },
    get screen() {
      return sheets().screen;
    },
    get sheetId() {
      return sheets().sheetId;
    },
    get setId() {
      return sheets().setId;
    },
    get missing() {
      return sheets().missing;
    },
    get saveMessage() {
      return sheets().saveMessage;
    },
    get note() {
      return sheets().noteText;
    },
    set note(text: string) {
      actions.setNote(text);
    },
    get noteSeq() {
      return sheets().noteSeq;
    },
    get busy() {
      return sheets().busy;
    },
    set busy(busy: boolean) {
      actions.setBusy(busy);
    },
    set leaveGuard(guard: LeaveGuard | null) {
      actions.setLeaveGuard(guard);
    },
    list: () => sheetList(store.state),
    sheet: (id: string) => sheetById(store.state, id),
    get currentSheet() {
      return currentSheet(store.state);
    },
    get currentSet() {
      return currentSet(store.state);
    },
    set: (id: string) => setOf(store.state, id),
    ...actions,
  };
}
