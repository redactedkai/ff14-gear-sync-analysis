// The Sheets tab: a click anywhere on a row of the sheet list or of a sheet's gear sets opens it.

import { NARROW } from '../../lib/constants.mjs';
import { check, expect, same } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { seedSheets, sheetNames } from '../../lib/sheets.mjs';

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

/** A click anywhere on a row of a sheet's gear set list opens the set: a figure cell, the note line, the origin line, the empty end of the Edit / Copy / Delete line and the gap between the handle
 * and the name each open that row's set; the Edit details button, the drag handle and a drag that selects text in the row do not; the name
 * link still opens it from the keyboard (focus the link, press Enter); and after sorting by main stat a figure cell opens
 * the set of its own row, not the one at that place in the saved order. At 960 px. */
export async function checkOpenRow(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheets(pg, [ROW_SHEET, OTHER_SHEET]);
  await pg.click('[data-tab=sheets]');

  await pg.locator('#sh-list a.sname', { hasText: 'Row sheet' }).click();
  await expect(pg.locator('#sh-sheet')).toBeVisible();

  // 1. every part of a row opens its set
  const setRow = name => pg.locator('#sh-sets tbody tr', { has: pg.locator('a.sname', { hasText: name }) });
  const expectSetPage = async (where, name) => {
    await expect(pg.locator('#sh-gear')).toBeVisible();
    const open = (await pg.locator('.setcrumb .crumbhere').textContent()).trim();
    check(open === name, `${where}: the set page of "${open}" opened, expected "${name}"`);
    await pg.locator('.setcrumb a.clipname').click(); // back to the sheet's list
    await expect(pg.locator('#sh-sets')).toBeVisible();
  };
  const expectListStays = async where => {
    await pg.waitForTimeout(150); // a set page that opens late would show by now
    check(await pg.locator('#sh-sets').isVisible(), `${where}: the click opened a set, expected the list to stay`);
  };
  // a click at a place inside `locator`'s box, by its size
  const clickAt = async (locator, place) => {
    const box = await locator.boundingBox();
    const { x, y } = place(box);
    await pg.mouse.click(box.x + x, box.y + y);
  };

  await inCell(setRow('Alpha'), 3).click();
  await expectSetPage('a figure cell', 'Alpha');
  await setRow('Beta').locator('td.n').last().click();
  await expectSetPage('the last figure cell', 'Beta');
  await setRow('Alpha').locator('.setnotes').click();
  await expectSetPage('the note line', 'Alpha');
  await setRow('Gamma').locator('.sorigin').last().click();
  await expectSetPage('the origin line', 'Gamma');
  await clickAt(setRow('Gamma').locator('.rowacts'), box => ({ x: box.width - 3, y: box.height / 2 }));
  await expectSetPage('the empty end of the Edit / Copy / Delete line', 'Gamma');
  await clickAt(setRow('Beta').locator('td').first(), () => ({ x: 31, y: 10 }));
  await expectSetPage('the gap between the handle and the name', 'Beta');

  // 2. what must not open it
  await setRow('Beta').locator('.rowacts [data-action="edit"]').click();
  await expectListStays('the Edit button');
  await pg.keyboard.press('Escape');
  await setRow('Beta').locator('.draghandle').click();
  await expectListStays('the drag handle');
  const note = setRow('Alpha').locator('.setnotes');
  const noteBox = await note.boundingBox();
  await pg.mouse.move(noteBox.x + 1, noteBox.y + noteBox.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(noteBox.x + 40, noteBox.y + noteBox.height / 2, { steps: 4 });
  await pg.mouse.up();
  check((await pg.evaluate(() => String(getSelection()))).length > 0, 'the drag over the note selected some text');
  await expectListStays('a drag that selects text');
  await pg.mouse.click(5, 5); // clear the selection

  // 3. the link opens a set from the keyboard
  await setRow('Gamma').locator('a.sname').focus();
  await pg.keyboard.press('Enter');
  await expectSetPage('the name link with Enter', 'Gamma');

  // 4. sorted by main stat the order is Alpha, Gamma, Beta: each figure opens its own row's set
  await pg.click('#sh-sets [data-sort="main"]');
  check(same(await sheetNames(pg, '#sh-sets'), ['Alpha', 'Gamma', 'Beta']), `the sorted order: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets tbody tr:nth-of-type(2) td.n').first().click();
  await expectSetPage('a figure cell of the second row of the sorted list', 'Gamma');
}

/** A click anywhere on a row of the sheet list opens the sheet: the job cell, a figure cell, the description line and the
 * empty end of the Open / Edit / Copy / Delete line each open that row's sheet; the Open button still opens it, the Edit
 * button opens its form instead, the drag handle and a drag that selects text in the row open nothing; the name link opens
 * it from the keyboard (focus the link, press Enter). At 960 px. */
export async function checkOpenSheetRow(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheets(pg, [ROW_SHEET, OTHER_SHEET]);
  await pg.click('[data-tab=sheets]');
  const sheetRow = name => pg.locator('#sh-list tbody tr', { has: pg.locator('a.sname', { hasText: name }) });
  const expectSheetPage = async (where, name) => {
    await expect(pg.locator('#sh-sheet')).toBeVisible();
    const open = (await pg.locator('.setcrumb .crumbhere').textContent()).trim();
    check(open === name, `${where}: the sheet "${open}" opened, expected "${name}"`);
    await pg.locator('.setcrumb a').first().click(); // the first crumb: back to the list of sheets
    await expect(pg.locator('#sh-list')).toBeVisible();
  };
  const expectListStays = async where => {
    await pg.waitForTimeout(150); // a sheet page that opens late would show by now
    check(await pg.locator('#sh-list').isVisible(), `${where}: the click opened a sheet, expected the list to stay`);
  };

  await inCell(sheetRow('Row sheet'), 1).click();
  await expectSheetPage('the job cell', 'Row sheet');
  await inCell(sheetRow('Other sheet'), 3).click();
  await expectSheetPage('the set count cell', 'Other sheet');
  await sheetRow('Other sheet').locator('td').last().click();
  await expectSheetPage('the last cell', 'Other sheet');
  await sheetRow('Row sheet').locator('.sorigin').click();
  await expectSheetPage('the description line', 'Row sheet');
  const actions = await sheetRow('Other sheet').locator('.rowacts').boundingBox();
  await pg.mouse.click(actions.x + actions.width - 3, actions.y + actions.height / 2);
  await expectSheetPage('the empty end of the Open / Edit / Copy / Delete line', 'Other sheet');
  await sheetRow('Row sheet').locator('.rowacts [data-action="open"]').click();
  await expectSheetPage('the Open button', 'Row sheet');

  // what must not open it
  await sheetRow('Row sheet').locator('.rowacts [data-action="edit"]').click();
  await expectListStays('the Edit button');
  await pg.keyboard.press('Escape');
  await sheetRow('Row sheet').locator('.draghandle').click();
  await expectListStays('the drag handle');
  const line = sheetRow('Row sheet').locator('.sorigin');
  const lineBox = await line.boundingBox();
  await pg.mouse.move(lineBox.x + 1, lineBox.y + lineBox.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(lineBox.x + 40, lineBox.y + lineBox.height / 2, { steps: 4 });
  await pg.mouse.up();
  check((await pg.evaluate(() => String(getSelection()))).length > 0, 'the drag over the description selected some text');
  await expectListStays('a drag that selects text');
  await pg.mouse.click(5, 5); // clear the selection

  // the link opens a sheet from the keyboard
  await sheetRow('Other sheet').locator('a.sname').focus();
  await pg.keyboard.press('Enter');
  await expectSheetPage('the name link with Enter', 'Other sheet');
}
