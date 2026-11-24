/* The page's store for the unit tests of the components, the router and the sheets: the real state, actions and facades
   (src/ui/store/page-store.ts), without Alpine. The facades are what `$store.app` and `$store.sheets` are on the page. */
import { restoreState } from '../../../src/ui/state.js';
import { createPageStore } from '../../../src/ui/store/page-store.ts';

/* A page store for the restored state `restored` (state.js restoreState; the defaults when omitted), with the sheets over
   `options.storage` (a Storage stand-in; none when omitted, so nothing is saved) and the other options createPageStore takes
   (now, makeId, frame). Returns {store, app, sheets, appActions, sheetsActions}. */
export function createStores(restored = restoreState(null), options = {}) {
  return createPageStore({ storage: null, ...options, restored });
}

/* The app facade (`$store.app`) over the restored state `restored`, alone. */
export function createAppFacade(restored = restoreState(null), options = {}) {
  return createStores(restored, options).app;
}

/* The sheets facade (`$store.sheets`) over a stand-in storage and the state's defaults. `options`: {storage, now, makeId}. */
export function createSheetsFacade(options = {}) {
  return createStores(restoreState(null), options).sheets;
}
