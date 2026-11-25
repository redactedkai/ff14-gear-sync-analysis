/* Story of <gsa-set-page>: a Sage set page over a real page store (the sheets slice over a stand-in storage), as the Sheets tab's wrapper
   would give it: the store, the set's id and its top line. The solver is a stand-in that answers every Gear to search count with a
   fixed line; no Auto-fill is run here (the page's smoke steps run it with the real solver). */
import { html } from 'lit';
import '../../../src/ui/elements/set-page/set-page.ts';
import { restoreState } from '../../../src/ui/state.js';
import { saveSheet } from '../../../src/ui/sheets/storage.js';
import { createPageStore } from '../../../src/ui/store/page-store.ts';
import { setHeaderView } from '../../../src/ui/views/sheet-sets.js';
import { fakeStorage, sageSet, sheetOf } from '../../unit/helpers/sheet-fixtures.js';

/* The row of the head piece and the Sage head piece the story's set holds (SAGE_IDS.head in the unit tests' fixtures). */
export const HEAD_ROW = 2;

/* The solver stand-in: counts answer at once with a line for the Gear to search count; nothing else is asked. */
const solver = {
  blocksPage: false,
  cancel: () => false,
  request: async () => ({
    result: {
      countText: 'searching 1,939 of 1,999 pieces',
      searched: 1939,
      fromCounts: null,
      gcdLabel: { name: 'Target GCD', range: '', haste: '', off: '', full: 'Target GCD' },
    },
  }),
};

export const Default = () => {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [sageSet()]), storage);
  const { store, sheets } = createPageStore({ restored: restoreState(null), storage });
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  const ports = { store, sheets, solver, maxReal: 795 };
  return html`<gsa-set-page .ports=${ports} .setId=${'g_1'} .header=${setHeaderView(sheets.currentSheet, sheets.currentSet)}></gsa-set-page>`;
};
