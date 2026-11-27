// The Sheets tab: the sheet manager and a sheet's page, edge cases.

import { NARROW, STORE_KEY } from '../../lib/constants.ts';
import { check, expect, same } from '../../lib/expect.ts';
import { FILL_SHEET } from '../../lib/fixtures.ts';
import { hasHScroll, setNumber } from '../../lib/nav.ts';
import { seedSheets, sheetNames } from '../../lib/sheets.ts';

/* A saved sheet of one empty set, named "Mine", for `job` at `level` (the sheet tests that need only a sheet of a job). */
export const edgeSheet = (id, name, job, level, sync) => ({
  ...FILL_SHEET,
  id,
  name,
  job,
  level,
  sync,
  sets: [{ ...FILL_SHEET.sets[0], id: `g_${id}`, name: 'Mine' }],
});

/** The sheet manager and a sheet's page where they are easy to get wrong: a record that could not be read is listed with its
 * cause and Delete asks first (Cancel keeps it, Delete removes the record); Blue Mage (level 80) and Beastmaster (level 50)
 * show their level range on the sheet page and in the New sheet dialog, hold a typed level to it, and a saved level above
 * it opens as the cap; Copy from a set page lands on the sheet's list with the copy next to the original, and Delete from
 * a set page lands one level up, on the sheet's page. */
export async function checkSheetEdges(pg) {
  const sync = { on: false, cap: 795 };
  await seedSheets(
    pg,
    [
      edgeSheet('s_blu', 'Blue', 'BLU', 100, sync),
      edgeSheet('s_bst', 'Beast', 'BST', 50, { on: true, cap: 135 }),
      edgeSheet('s_sge', 'Sage', 'SGE', 100, sync),
    ],
    { s_broken: '{not json' },
  );
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  const stored = id => pg.evaluate(([key, sheetId]) => localStorage.getItem(`${key}:sheet:${sheetId}`), [STORE_KEY, id]);

  // 1. a record that could not be read: listed with its cause; Delete asks, Cancel keeps it, Delete removes it
  await expect(pg.locator('#sh-unreadable')).toBeVisible();
  await expect(pg.locator('#sh-unreadable')).toContainText('not valid JSON');
  await pg.locator('#sh-unreadable button', { hasText: 'Delete' }).click();
  await expect(pg.locator('#sh-dialog .question')).toBeVisible();
  await pg.click('#sh-dlg-cancel');
  check((await stored('s_broken')) === '{not json', 'Cancel in the Delete question removed the unreadable record');
  await expect(pg.locator('#sh-unreadable')).toBeVisible();
  await pg.locator('#sh-unreadable button', { hasText: 'Delete' }).click();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-unreadable')).toHaveCount(0);
  check((await stored('s_broken')) === null, 'Delete left the unreadable record in storage');
  check(
    same(await sheetNames(pg, '#sh-list'), ['Blue', 'Beast', 'Sage']),
    `sheets after deleting the record: ${await sheetNames(pg, '#sh-list')}`,
  );

  // 2. the level range of the jobs with a lower cap: Blue Mage 80 (saved above it: opens at it), Beastmaster 50
  await pg.locator('#sh-list a.sname', { hasText: 'Blue' }).click();
  await expect(pg.locator('#sh-level-range')).toHaveText('1–80');
  await expect(pg.locator('#sh-level')).toHaveValue('80');
  await setNumber(pg, '#sh-level', '99');
  await expect(pg.locator('#sh-level')).toHaveValue('80');
  await pg.click('#sh-sheet .setcrumb a');
  await pg.locator('#sh-list a.sname', { hasText: 'Beast' }).click();
  await expect(pg.locator('#sh-level-range')).toHaveText('1–50');
  await expect(pg.locator('#sh-level')).toHaveValue('50');
  await setNumber(pg, '#sh-level', '70');
  await expect(pg.locator('#sh-level')).toHaveValue('50');
  await expect(pg.locator('#sh-cap')).toHaveValue('135'); // the cap level 50 allows, unchanged
  await pg.click('#sh-sheet .setcrumb a');
  await pg.click('#sh-new');
  for (const [job, top] of [
    ['BST', '50'],
    ['BLU', '80'],
    ['WAR', '100'],
  ]) {
    await pg.click(`#sh-dialog [data-job-id=${job}]`);
    await expect(pg.locator('#sh-dlg-level-range')).toHaveText(`1–${top}`);
    await setNumber(pg, '#sh-dlg-level', '99');
    await expect(pg.locator('#sh-dlg-level')).toHaveValue(Math.min(99, Number(top)).toString());
  }
  await pg.keyboard.press('Escape');

  // 3. Copy from a set page: the sheet's list, the copy next to the original; Delete from a set page: the sheet's page
  await pg.locator('#sh-list a.sname', { hasText: 'Sage' }).click();
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
  await pg.click('#sh-set-copy');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  check(same(await sheetNames(pg, '#sh-sets'), ['Mine', 'Mine (1)']), `sets after Copy: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine (1)' }).click();
  await pg.click('#sh-set-delete');
  await expect(pg.locator('#sh-dialog .question')).toContainText('Mine (1)');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-set')).toHaveCount(0);
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Sage');
  check(same(await sheetNames(pg, '#sh-sets'), ['Mine']), `sets after Delete: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets a.sname').click();
  await pg.click('#sh-set-delete');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-no-sets')).toBeVisible();
  check(!(await hasHScroll(pg)), `Sheets: a sheet's page scrolls sideways at ${NARROW.width} px`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
