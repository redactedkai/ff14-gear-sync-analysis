// The Sheets tab: a click on a row of the sheet list or of a sheet's gear sets opens it.

import { NARROW } from '../../lib/constants.ts';
import { check, expect, same } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { seedSheets, sheetNames } from '../../lib/sheets.ts';

/* A saved Sage sheet of three gear sets saved in this order: "Alpha" (all 12 rows, with a note), "Beta" (no pieces) and
   "Gamma" (3 pieces). Sorted by main stat, best first, the order is Alpha, Gamma, Beta: not the saved one. */
const [FULL_SET] = SET_SHEET.sets;
const keepOnly = slots => FULL_SET.pieces.map(piece => (slots.includes(piece.gameId) ? piece : { slot: piece.slot }));
const setOf = (id, name, description, pieces) => ({ ...FULL_SET, id, name, description, pieces, pinned: { pieces: [], meal: false } });
const ROW_SHEET = {
  ...SET_SHEET,
  id: 's_rows',
  name: 'Row sheet',
  sets: [
    setOf('g_alpha', 'Alpha', 'Week 1 note', FULL_SET.pieces),
    setOf('g_beta', 'Beta', '', keepOnly([])),
    setOf('g_gamma', 'Gamma', '', keepOnly([10880, 10887, 10908])),
  ],
};
/* A second sheet, so the manager's list has two rows to tell apart. */
const OTHER_SHEET = { ...SET_SHEET, id: 's_other', name: 'Other sheet', sets: [] };

/* A point inside the row's cell: `row` a locator of the row, `cell` the cell's place (0 is the first). */
const inCell = (row, cell) => row.locator('td').nth(cell);

/** A click on a row of a sheet's gear set list opens the set on the real page, and after sorting by main stat a figure cell opens
 * the set of its own row, not the one at that place in the saved order (the one test that joins the sort and the open). Which parts
 * of a row open it, what must not (the Edit button, the drag handle, a drag that selects text) and Enter on the name link are
 * `sheet-page.spec.ts`'s and `open-row.test.js`'s. At 960 px. */
export async function checkOpenRow(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheets(pg, [ROW_SHEET, OTHER_SHEET]);
  await pg.click('[data-tab=sheets]');

  await pg.locator('#sh-list a.sname', { hasText: 'Row sheet' }).click();
  await expect(pg.locator('#sh-sheet')).toBeVisible();

  const setRow = name => pg.locator('#sh-sets tbody tr', { has: pg.locator('a.sname', { hasText: name }) });
  const expectSetPage = async (where, name) => {
    await expect(pg.locator('#sh-gear')).toBeVisible();
    const open = (await pg.locator('.setcrumb .crumbhere').textContent()).trim();
    check(open === name, `${where}: the set page of "${open}" opened, expected "${name}"`);
    await pg.locator('.setcrumb a.clipname').click(); // back to the sheet's list
    await expect(pg.locator('#sh-sets')).toBeVisible();
  };

  await inCell(setRow('Alpha'), 3).click();
  await expectSetPage('a figure cell', 'Alpha');

  // sorted by main stat the order is Alpha, Gamma, Beta: each figure opens its own row's set
  await pg.click('#sh-sets [data-sort="main"]');
  check(same(await sheetNames(pg, '#sh-sets'), ['Alpha', 'Gamma', 'Beta']), `the sorted order: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets tbody tr:nth-of-type(2) td.n').first().click();
  await expectSetPage('a figure cell of the second row of the sorted list', 'Gamma');
}

/** A click on a row of the sheet list opens the sheet on the real page (the job cell). Which parts of a row open it, what must not
 * and Enter on the name link are `sheet-manager.spec.ts`'s and `open-row.test.js`'s. At 960 px. */
export async function checkOpenSheetRow(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheets(pg, [ROW_SHEET, OTHER_SHEET]);
  await pg.click('[data-tab=sheets]');
  const sheetRow = name => pg.locator('#sh-list tbody tr', { has: pg.locator('a.sname', { hasText: name }) });
  await inCell(sheetRow('Row sheet'), 1).click();
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  const open = (await pg.locator('.setcrumb .crumbhere').textContent()).trim();
  check(open === 'Row sheet', `the job cell: the sheet "${open}" opened, expected "Row sheet"`);
}
