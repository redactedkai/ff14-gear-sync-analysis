// A set page's table: the columns keep their width whatever the set holds.

import { COLUMN_WINDOWS, columnsDiffer, measureColumns } from '../../lib/columns.ts';
import { check, expect } from '../../lib/expect.ts';
import { FILL_SHEET, SET_SHEET } from '../../lib/fixtures.ts';
import { waitReady } from '../../lib/nav.ts';
import { seedSheets, reloadAtSheets } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** A set page's number columns (item level and each stat) have the same width in a filled set and an empty one, and every
 * stat column is as wide as the others, at 960, 1280 and 2560 px; the Stat Total row's four-digit numbers (the filled
 * Sage set sums to four digits) overflow no cell, and nothing scrolls sideways. */
export async function checkSetPageColumns(pg: Page) {
  const emptySheet = { ...FILL_SHEET, id: 's_empty_page', name: 'Empty page', level: 100, sync: { on: false, cap: 795 } };
  await seedSheets(pg, [SET_SHEET, emptySheet]);
  const open = async (sheetName: string, setName: string, width: number, height: number) => {
    await pg.setViewportSize({ width, height });
    await reloadAtSheets(pg);
    await waitReady(pg);
    await pg.click('[data-tab=sheets]');
    await pg.locator('#sh-list a.sname', { hasText: sheetName }).click();
    await pg.locator('#sh-sets a.sname', { hasText: setName }).click();
    await expect(pg.locator('#sh-gear')).toBeVisible();
    return measureColumns(pg, '#sh-gear');
  };
  for (const [width, height] of COLUMN_WINDOWS) {
    const filled = await open(SET_SHEET.name, 'Mine', width, height);
    const empty = await open('Empty page', 'Empty', width, height);
    const where = `a set page at ${width} px`;
    check(filled.edges.length > 5, `${where}: only ${filled.edges.length} headings`);
    const why = columnsDiffer({ ...empty, rowHeights: filled.rowHeights }, filled);
    check(!why, `${where}, filled against empty: ${why}`);
    // the stat columns (all but Slot, Item, Ilvl and the last, which has its own width) are as wide as one another
    const widths = filled.edges.slice(3, -1).map(([left, right]) => right - left);
    check(
      widths.every(w => Math.abs(w - widths[0]) <= 0.5),
      `${where}: the stat columns differ in width (${widths.map(Math.round)})`,
    );
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await reloadAtSheets(pg);
  await waitReady(pg);
  await pg.click('[data-tab=browse]');
}
