/* The Sheets store as the page's templates and components read it (`$store.sheets`): the members the old Alpine Sheets store had,
   over the store's `sheets` slice. A getter reads the slice's revision, so what shows a sheet is run again after any action on the
   Sheets tab, and hands out the state itself (plain data a reader may look at and nothing may change); a method calls an action
   (sheets-actions.ts: the rules, the saving, the edit lock, the leave guard). Nothing here can be assigned to. */
import { currentSet, currentSheet, setOf, sheetById, sheetHref, sheetList } from './app-state.ts';
import type { AppStore } from './app-state.ts';
import type { SliceRevisions } from './app-facade.ts';
import type { SheetsActions } from './sheets-actions.ts';

/* The facade of `store` and its `actions` (createSheetsActions); `revisions` as in app-facade.ts. */
export function createSheetsFacade(store: AppStore, actions: SheetsActions, revisions: SliceRevisions) {
  const { state } = store;
  return {
    ...actions,

    /* How many actions have changed the Sheets tab: a view that caches by it (set-page/view.js) is built again after each. */
    get rev() {
      return revisions.sheets;
    },
    /* The screen the Sheets tab shows: 'sheets' (the manager), 'sheet' or 'set'. */
    get screen() {
      void revisions.sheets;
      return state.sheets.screen;
    },
    /* The open sheet's id, or null. */
    get sheetId() {
      void revisions.sheets;
      return state.sheets.sheetId;
    },
    /* The open gear set's id, or null. */
    get setId() {
      void revisions.sheets;
      return state.sheets.setId;
    },
    /* The sheet or gear set an address named that is not saved, {sheetId, setId}, or null. */
    get missing() {
      void revisions.sheets;
      return state.sheets.missing;
    },
    /* The message of the last failed save ('' when every edit is saved). */
    get saveMessage() {
      void revisions.sheets;
      return state.sheets.saveMessage;
    },
    /* The note after the last action ('' when none): the page clears it after a few seconds. */
    get note() {
      void revisions.sheets;
      return state.sheets.noteText;
    },
    /* How many notes have been set, an identical one counted too. */
    get noteSeq() {
      void revisions.sheets;
      return state.sheets.noteSeq;
    },
    /* Whether an Auto-fill runs, so every edit is refused. */
    get busy() {
      void revisions.sheets;
      return state.sheets.busy;
    },

    /* ---- reading the sheets ---- */

    /* What the manager lists: {available, sheets, unreadable, indexProblem}. */
    list() {
      void revisions.sheets;
      return sheetList(state);
    },
    /* The saved sheet with `id`, or null. */
    sheet(id: string | null) {
      void revisions.sheets;
      return sheetById(state, id);
    },
    /* The open sheet (screens 'sheet' and 'set'), or null. */
    get currentSheet() {
      void revisions.sheets;
      return currentSheet(state);
    },
    /* The open gear set (screen 'set'), or null. */
    get currentSet() {
      void revisions.sheets;
      return currentSet(state);
    },
    /* The open sheet's gear set with `id`, or null. */
    set(id: string | null) {
      void revisions.sheets;
      return setOf(state, id);
    },
    /* The address (a hash) of the screen of `sheetId` and `setId`, for the links of the lists and the breadcrumb. */
    href: sheetHref,
  };
}

/* The Sheets store's facade. */
export type SheetsFacade = ReturnType<typeof createSheetsFacade>;
