// A set page's Stat Total row: its item level cell is the average item level of the worn pieces.

import { NARROW } from '../../lib/constants.ts';
import { check, expect } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { expectApplyCount, openSet, seedSheet } from '../../lib/sheets.ts';

/** The Sage set "Mine" (eight pieces of item level 115, no weapon, no hands or feet) shows ~77 in the Stat Total row's item
 * level cell (the tilde marks an average; the cell's aria-label is "Average item level 77"): 8 x 115 = 920, over 12 slots = 76.67,
 * as a whole number. The number fits its cell at 960 px. Picking a hands
 * piece by hand (a draft) raises it to round((920 + the piece's item level) / 12), the piece's level read from its row. */
export async function checkAverageIlvl(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, SET_SHEET);
  await openSet(pg, SET_SHEET.name, 'Mine');
  const total = pg.locator('#sh-total [data-col="ilvl"]');
  await expect(total).toHaveText('~77');
  await expect(total).toHaveAttribute('aria-label', 'Average item level 77');

  // the number is not cut off or wrapped inside its cell
  const fit = await total.evaluate(cell => ({ over: cell.scrollWidth > cell.clientWidth, lines: cell.getClientRects().length }));
  check(!fit.over, 'Set page: the Total row item level overflows its cell at 960 px');

  // a hands piece picked by hand changes it
  await pg.locator('#sh-gear tr[data-row="4"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  const pickedLevel = Number(await pg.locator('#sh-gear tr[data-row="4"] [data-col="ilvl"]').textContent());
  check(pickedLevel > 0, `Set page: the picked hands piece shows no item level (${pickedLevel})`);
  await expect(total).toHaveText('~' + String(Math.round((920 + pickedLevel) / 12)));
  await pg.click('#sh-discard');
  await expect(total).toHaveText('~77');
}
