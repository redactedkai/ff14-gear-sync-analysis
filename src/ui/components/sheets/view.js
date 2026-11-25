/* What the Sheets tab's list screens draw: the sheet manager, a sheet's page and the set page's header line, each built once
   per change of the sheets (views/sheet-manager.js, sheet-sets.js), and the sort of the sheet page's gear sets list.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets (frame.js). */
import { deepFreeze, viewCache } from '../../view-cache.ts';
import { sheetManagerView } from '../../views/sheet-manager.js';
import { notFoundView } from '../../views/sheet-text.js';
import { nextListSort, setHeaderView, sheetPageView, sortSetRows } from '../../views/sheet-sets.js';

/* Returns the part's members. */
export function viewPart() {
  const managerCache = viewCache();
  const pageCache = viewCache();
  const headerCache = viewCache();

  return {
    // how the sheet page's gear sets list is sorted: a heading's key and direction, key '' for the saved order (not saved:
    // a sheet's page opens in the saved order)
    listSort: { key: '', dir: '' },

    /* The manager (sheetManagerView), built once per change of the sheets. */
    get manager() {
      const store = this.sheets;
      const list = store.list();
      return managerCache.get(String(store.rev), () => deepFreeze(sheetManagerView(list)));
    },
    /* The "not found" screen (notFoundView) while an address names a sheet or gear set that is not saved, or null. */
    get notFound() {
      const missing = this.sheets.missing;
      return missing ? notFoundView(this.sheets.sheet(missing.sheetId)) : null;
    },
    /* The open sheet's page (sheetPageView), or null. */
    get page() {
      const sheet = this.sheets.currentSheet;
      if (!sheet) {
        return null;
      }
      return pageCache.get(`${this.sheets.rev}:${sheet.id}`, () => deepFreeze(sheetPageView(sheet)));
    },
    /* The set page's line: breadcrumb and the sheet's settings, read-only (setHeaderView), built once per change of the sheets, or null. */
    get setHeader() {
      const sheet = this.sheets.currentSheet;
      const gearSet = this.sheets.currentSet;
      if (!sheet || !gearSet) {
        return null;
      }
      return headerCache.get(`${this.sheets.rev}:${sheet.id}:${gearSet.id}`, () => deepFreeze(setHeaderView(sheet, gearSet)));
    },

    /* The list's sort in force: the heading's own while its column is on the page (the stat points view has other columns
       than the effects), else the saved order. */
    get activeSort() {
      const page = this.page;
      const key = this.listSort.key;
      if (!page || !key) {
        return { key: '', dir: '' };
      }
      const keys = this.$store.app.sheetFigures === 'points' ? page.pointKeys : page.columnKeys;
      return key === 'name' || keys.includes(key) ? this.listSort : { key: '', dir: '' };
    },
    /* The set rows to draw: the page's rows in the list's sort (the saved order with no sort). */
    get listRows() {
      return sortSetRows(this.page.rows, this.activeSort, this.$store.app.sheetFigures);
    },
    /* A heading clicked: sort by it, flip it, then back to the saved order (nextListSort). */
    sortList(key) {
      this.listSort = nextListSort(this.activeSort, key, this.$store.app.sheetFigures);
    },
    /* a heading's aria-sort: 'descending', 'ascending' or 'none' */
    listSortState(key) {
      const sort = this.activeSort;
      if (sort.key !== key) {
        return 'none';
      }
      return sort.dir === 'desc' ? 'descending' : 'ascending';
    },
  };
}
