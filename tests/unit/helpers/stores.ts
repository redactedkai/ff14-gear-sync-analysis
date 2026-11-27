/* The page's store for the unit tests of the components, the router and the sheets: the real state, actions and facades
   (src/ui/store/page-store.ts). The facades are what the screens read on the page. */
import { restoreState } from '../../../src/ui/state.ts';
import { createPageStore } from '../../../src/ui/store/page-store.ts';
import type { PageStore, PageStoreOptions } from '../../../src/ui/store/page-store.ts';
import type { SavedState } from '../../../src/ui/state.ts';

/* What a test passes besides the restored state: the page store's options without `restored`. */
export type StoreOptions = Omit<PageStoreOptions, 'restored'>;

/* A page store for the restored state `restored` (state.ts restoreState; the defaults when omitted), with the sheets over
   `options.storage` (a Storage stand-in; none when omitted, so nothing is saved) and the other options createPageStore takes
   (now, makeId, frame). Returns {store, app, sheets, appActions, sheetsActions}. */
export function createStores(restored: SavedState = restoreState(null), options: StoreOptions = {}): PageStore {
  return createPageStore({ storage: null, ...options, restored });
}

/* The app facade over the restored state `restored`, alone. */
export function createAppFacade(restored: SavedState = restoreState(null), options: StoreOptions = {}): PageStore['app'] {
  return createStores(restored, options).app;
}

/* The sheets facade over a stand-in storage and the state's defaults. `options`: {storage, now, makeId}. */
export function createSheetsFacade(options: StoreOptions = {}): PageStore['sheets'] {
  return createStores(restoreState(null), options).sheets;
}
