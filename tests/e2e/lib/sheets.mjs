// Helpers that seed saved sheets into localStorage, open a set, and read the sheet list.

import { STORE_KEY } from './constants.mjs';
import { expect } from './expect.mjs';
import { SET_SHEET } from './fixtures.mjs';
import { waitReady, waitStateSaved } from './nav.mjs';

/** Store `sheet` (a saved sheet, the shape src/ui/sheets/storage.js reads) as the only one, and reload on it. */
export async function seedSheet(pg, sheet) {
  await seedSheets(pg, [sheet]);
}

/** Store `sheets` (saved sheets) in that order, and reload on them; `broken` (record text by sheet id) are stored in the
 * order too, for records that cannot be read. */
export async function seedSheets(pg, sheets, broken = {}) {
  await waitStateSaved(pg);
  await pg.evaluate(
    ([key, list, bad]) => {
      for (const s of list) localStorage.setItem(`${key}:sheet:${s.id}`, JSON.stringify(s));
      for (const [id, text] of Object.entries(bad)) localStorage.setItem(`${key}:sheet:${id}`, text);
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [...list.map(s => s.id), ...Object.keys(bad)] }));
    },
    [STORE_KEY, sheets, broken],
  );
  await reloadAtSheets(pg);
  await waitReady(pg);
}

/** Reload the page on the Sheets list. The page reopens on the address it was left on (a sheet or set page stays open), so a check
 * that wants the list first starts from `#/sheets`, as a fresh visit does. */
export async function reloadAtSheets(pg) {
  await pg.evaluate(() => history.replaceState(null, '', '#/sheets'));
  await pg.reload();
}

/** Open the set named `setName` of the sheet named `sheetName` from the Sheets tab. */
export async function openSet(pg, sheetName, setName) {
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: sheetName }).click();
  await pg.locator('#sh-sets a.sname', { hasText: setName }).click();
  await expect(pg.locator('#sh-gear')).toBeVisible();
}

/** A list's rows on the Sheets tab: the names in its first column, in order. */
export const sheetNames = (pg, table) => pg.locator(`${table} tbody tr a.sname`).allInnerTexts();

/** A button of a list row's actions (`action`: open, edit, copy or delete, its data-action), by the row's place (1 is the first). */
export const rowAction = (pg, table, row, action) => pg.locator(`${table} tbody tr:nth-of-type(${row}) .rowacts [data-action="${action}"]`);

/** Open the seeded Sage set's page from the Sheets tab. */
export async function openSageSet(pg) {
  await openSet(pg, SET_SHEET.name, 'Mine');
}

/** The set page's Apply button names `count` changes (the number only, not its wording). */
export const expectApplyCount = (pg, count) => expect(pg.locator('#sh-apply')).toHaveNumber(count);

/** Table row `row` of a set page holds no piece (`empty`) or holds one: read from the button's data-empty, not its words. */
export const expectPieceEmpty = (pg, row, empty = true) =>
  expect(pg.locator(`#sh-gear tr[data-row="${row}"] [data-pick]`)).toHaveAttribute('data-empty', String(empty));

/** The Food button of a set page shows no meal (`empty`) or a meal, by its data-empty. */
export const expectMealEmpty = (pg, empty = true) => expect(pg.locator('#sh-meal-btn')).toHaveAttribute('data-empty', String(empty));

/** The label of the figures switch's radio with this value ("effects" or "points"), to click: the value, not the words. */
export const figuresRadio = value => `#sh-figures label:has(input[value="${value}"])`;
