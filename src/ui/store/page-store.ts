/* The page's store, put together: the state of a restored page and the saved sheets, the actions over it and the two facades the
   templates and components read (`$store.app`, `$store.sheets`). main.js makes one for the page; the unit tests of the components
   make one over a stand-in storage. */
import { defaultStorage } from '../sheets/storage.js';
import { readSheets } from '../sheets/store-shared.js';
import { createAppActions } from './app-actions.ts';
import type { AppActionOptions } from './app-actions.ts';
import { createAppFacade } from './app-facade.ts';
import type { SliceRevisions } from './app-facade.ts';
import { STATE_PARTS, initialState } from './app-state.ts';
import type { RestoredState, SheetsData } from './app-state.ts';
import { createSetPageActions } from './set-page-actions.ts';
import { createSheetsActions } from './sheets-actions.ts';
import type { SheetsActionOptions } from './sheets-actions.ts';
import { createSheetsFacade } from './sheets-facade.ts';
import { Store } from './store.ts';

/* The saved sheets of a page with no storage: none, and none can be saved. */
const NO_SHEETS: SheetsData = { available: false, sheets: [], unreadable: [], indexProblem: null };

/* What a page store is made from. restored: state.js restoreState of what was saved and the screen the address names;
   storage, now, makeId: the sheets' storage (the browser's by default; null for none), the clock and the id maker; frame: the
   frame scheduler (app-actions.ts); track: makes the object of slice revisions the facades read into one the template engine
   tracks (Alpine.reactive on the page; none in a test). */
export interface PageStoreOptions extends AppActionOptions, SheetsActionOptions {
  restored: RestoredState;
  track?: (revisions: SliceRevisions) => SliceRevisions;
}

/* The page's store: {store, appActions, sheetsActions, setPageActions, app (the facade `$store.app`), sheets (the facade `$store.sheets`)}. */
export function createPageStore(options: PageStoreOptions) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const state = initialState(options.restored, storage ? (readSheets(storage) as SheetsData) : NO_SHEETS);
  // the revisions the facades read: the template engine's own copy when `track` gives one (it starts from the store's), else the store's
  let tracked: SliceRevisions | null = null;
  const store = new Store(state, {
    parts: STATE_PARTS,
    onUpdate: (key, revision) => {
      if (tracked) {
        tracked[key] = revision;
      }
    },
  });
  if (options.track) {
    tracked = options.track({ ...store.revs });
  }
  const revisions = tracked ?? store.revs;
  const appActions = createAppActions(store, options);
  const sheetsActions = createSheetsActions(store, { ...options, storage });
  const setPageActions = createSetPageActions(store);
  return {
    store,
    appActions,
    sheetsActions,
    setPageActions,
    app: createAppFacade(store, appActions, revisions),
    sheets: createSheetsFacade(store, sheetsActions, revisions, setPageActions),
  };
}

/* `facade` frozen, for the page to register as a store (`Alpine.store`): nothing can be assigned to it, defined on it, deleted from it
   or added to it later, so a console command cannot shadow or remove what a template reads (`Object.defineProperty(app, 'job', ...)`,
   `delete app.browse`). The facades are read-only objects already: their getters read the store's revisions, which the page's
   template engine tracks, so the engine has no need to wrap them in a reactive proxy, and a frozen object is left as it is
   (the engine does not wrap an object that cannot be extended). Only the page seals them: the unit tests add stand-ins to the
   facades they build. */
export function sealFacade<Facade extends object>(facade: Facade): Readonly<Facade> {
  return Object.freeze(facade);
}

/* A page store. */
export type PageStore = ReturnType<typeof createPageStore>;
