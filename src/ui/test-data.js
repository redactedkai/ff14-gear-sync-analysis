/* TEMPORARY testing control (the "test data" button next to the DEV badge, scripts/build/build.mjs buildMarks): the
   prototype's two example sheets as saved records (test-sheets.json, made by docs/scratchpad/a4-sheet/test-data/gen.mjs
   with the real optimizer). Delete this file, the JSON, the button and `loadTestData` in components/page.js when the
   sheets are tested by hand no more. */
import EXAMPLE_SHEETS from './test-sheets.json' with { type: 'json' };

/* Puts the example sheets into `sheetStore` (sheet-store.js), saved like any edit: a sheet with the same id is replaced,
   the others stay; new ones go to the top in the prototype's order. Returns the number of sheets loaded. */
export function loadExampleSheets(sheetStore) {
  for (const sheet of [...EXAMPLE_SHEETS].reverse()) sheetStore.commit(structuredClone(sheet), { touch: false });
  return EXAMPLE_SHEETS.length;
}
