/* The page's ports for the stories of the screen elements (`<gsa-app>`, `<gsa-sheets-screen>`, `<gsa-math-screen>`): a real page store
   over a stand-in storage that holds `sheets`, as main.js makes it, and the solver stand-in of the set page's story (no search is run
   here). Returns what the elements take: `{store, app, sheets, setPagePorts}`. */
import { restoreState } from '../../../src/ui/state.ts';
import { saveSheet } from '../../../src/ui/sheets/storage.ts';
import { createPageStore } from '../../../src/ui/store/page-store.ts';
import { fakeStorage } from '../../unit/helpers/sheet-fixtures.js';
import { solver } from '../set-page/set-page.story.js';

/* The highest real item level the stand-in solver and the set page are given (the page's own is read from the game data). */
const MAX_REAL_ILVL = 795;

/* The ports over a store that holds the saved sheets `sheets` and opens on the tab `tab` ('sheets', 'browse' or 'math'). */
export function pagePorts({ sheets: savedSheets = [], tab = 'sheets' } = {}) {
  const storage = fakeStorage();
  for (const sheet of savedSheets) {
    saveSheet(sheet, storage);
  }
  const { store, app, sheets } = createPageStore({ restored: restoreState(null, { tab }), storage });
  return { store, app, sheets, setPagePorts: { store, sheets, solver, maxReal: MAX_REAL_ILVL } };
}
