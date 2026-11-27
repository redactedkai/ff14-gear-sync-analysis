/* The page's store for the unit tests of the components, the router and the sheets: the real state, actions and facades
   (src/ui/store/page-store.ts). The facades are what the screens read on the page. */
import { restoreState } from '../../../../src/ui/state.ts';
import { createPageStore } from '../../../../src/ui/store/page-store.ts';
import { mustFind } from './common.ts';
import type { PageStore, PageStoreOptions } from '../../../../src/ui/store/page-store.ts';
import type { SavedState } from '../../../../src/ui/state.ts';

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

/* The `id` of a new sheet or set that an action's result carries (SheetResult has it only for those actions); throws when the
   action made none. */
export const idOf = (result: { id?: string }): string => mustFind(result.id, 'the id of the new sheet or set');

/* The Sheets facade's open sheet (openSheetOf), open set (openSetOf), or saved sheet by id (savedSheet), which the test knows exists (throws otherwise). */
export const openSheetOf = (sheets: PageStore['sheets']) => mustFind(sheets.currentSheet, 'the open sheet');
export const openSetOf = (sheets: PageStore['sheets']) => mustFind(sheets.currentSet, 'the open set');
export const savedSheet = (sheets: PageStore['sheets'], id: string) => mustFind(sheets.sheet(id), `sheet ${id}`);
