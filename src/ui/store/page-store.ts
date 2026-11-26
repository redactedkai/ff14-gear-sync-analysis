/* The page's store, put together: the state of a restored page and the saved sheets, the actions over it and the two facades the
   screens read (`app`, `sheets`). main.js makes one for the page; the unit tests of the elements
   make one over a stand-in storage. */
import { defaultStorage } from '../sheets/storage.js';
import { readSheets } from '../sheets/store-shared.js';
import { createAppActions } from './app-actions.ts';
import type { AppActionOptions } from './app-actions.ts';
import { createAppFacade } from './app-facade.ts';
import { createAppStore } from './app-state.ts';
import type { RestoredState, SheetsData } from './app-state.ts';
import { createSetPageActions } from './set-page-actions.ts';
import { createSheetsActions } from './sheets-actions.ts';
import type { SheetsActionOptions } from './sheets-actions.ts';
import { createSheetsFacade } from './sheets-facade.ts';

/* The saved sheets of a page with no storage: none, and none can be saved. */
const NO_SHEETS: SheetsData = { available: false, sheets: [], unreadable: [], indexProblem: null };

/* What a page store is made from. restored: state.ts restoreState of what was saved and the screen the address names;
   storage, now, makeId: the sheets' storage (the browser's by default; null for none), the clock and the id maker; frame: the
   frame scheduler (app-actions.ts). */
export interface PageStoreOptions extends AppActionOptions, SheetsActionOptions {
  restored: RestoredState;
}

/* The page's store: {store, appActions, sheetsActions, setPageActions, app (the app facade), sheets (the sheets facade)}. */
export function createPageStore(options: PageStoreOptions) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const store = createAppStore(options.restored, storage ? (readSheets(storage) as SheetsData) : NO_SHEETS);
  const appActions = createAppActions(store, options);
  const sheetsActions = createSheetsActions(store, { ...options, storage });
  const setPageActions = createSetPageActions(store);
  return {
    store,
    appActions,
    sheetsActions,
    setPageActions,
    app: createAppFacade(store, appActions, store.revs),
    sheets: createSheetsFacade(store, sheetsActions, store.revs, setPageActions),
  };
}

/* `facade` frozen, for the page to hand to its screens: nothing can be assigned to it, defined on it, deleted from it or added
   to it later, so a console command cannot shadow or remove what a screen reads (`Object.defineProperty(app, 'job', ...)`,
   `delete app.browse`). The facades are read-only objects already: their getters read the store's revisions. Only the page
   seals them: the unit tests add stand-ins to the facades they build. */
export function sealFacade<Facade extends object>(facade: Facade): Readonly<Facade> {
  return Object.freeze(facade);
}

/* A page store. */
export type PageStore = ReturnType<typeof createPageStore>;
