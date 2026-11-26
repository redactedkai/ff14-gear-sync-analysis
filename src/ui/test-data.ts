/* TEMPORARY testing control (the "test data" button next to the DEV badge, drawn by elements/app/app-root.ts): the
   example sheets as saved records (test-sheets.json: a Sage sheet, UwU for White Mage, and UwU for a tank, melee,
   Dexterity and caster job; made with the real optimizer by docs/scratchpad/test-data/gen.mjs and gen-roles.mjs). Delete this file, the JSON, the button and `loadTestData` in elements/app/app-root-model.ts when the
   sheets are tested by hand no more. */
import EXAMPLE_SHEETS from './test-sheets.json' with { type: 'json' };
import type { SheetsFacade } from './store/sheets-facade.ts';
import type { SavedSheet } from './sheets/saved-types.ts';

/* Puts the example sheets into `sheetStore` (the sheets facade: commitSheet), saved like any edit: a sheet with the same id is replaced,
   the others stay; new ones go to the top in the file's order. Returns the number of sheets loaded. */
export function loadExampleSheets(sheetStore: Pick<SheetsFacade, 'commitSheet'>): number {
  for (const sheet of [...EXAMPLE_SHEETS].reverse()) {
    sheetStore.commitSheet(structuredClone(sheet) as SavedSheet, { touch: false });
  }
  return EXAMPLE_SHEETS.length;
}
