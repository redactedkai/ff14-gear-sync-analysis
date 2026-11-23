// The Sheets tab: the flag in the Item level field's label line (a lowered cap, text that is no cap).

import { NARROW } from '../../lib/constants.mjs';
import { check, expect, poll } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { hasHScroll } from '../../lib/nav.mjs';
import { seedSheet } from '../../lib/sheets.mjs';
import { capLineShape, checkCapLineStable } from '../../lib/shared-checks.mjs';

// the sheet page's cap field: its label line, the two inputs, and the boxes beside it; the same in the New and Copy sheet dialog
const PAGE_CAP = { line: '.sheetfields .capline', cap: '#sh-cap', level: '#sh-level', others: ['#sh-level', '#sh-sync', '#sh-clan'] };
const DIALOG_CAP = {
  line: '#sh-dialog .capline',
  cap: '#sh-dlg-cap',
  level: '#sh-dlg-level',
  others: ['#sh-dlg-level', '#sh-dlg-sync', '#sh-dlg-ok'],
};

// Warrior, one gear set holding the Ironworks head piece (game id 9901), level 100, item level sync on at a cap of 660
const WAR_SHEET = { ...pieceSheet('s_capflag', 'Flag check', 'WAR', 2, 9901, []), sync: { on: true, cap: 660 } };

/** A sheet page's Item level field at 960 px: with no note it shows its range ("1-795"); a cap above what the level allows
 * (795 at level 69) shows a lowered flag with the highest cap in its place ("Max 288", a gold triangle) and the range goes;
 * text that is no cap (0) shows an error flag with the range in it ("1-795 only", a red circle) that replaces the lowered
 * one. The whole sentence is the field's tooltip and a live region. The settings row stays one line with the Level and Item
 * level boxes 160 px wide, and no state changes the row's height or makes the page scroll sideways. The Copy sheet dialog's Item
 * level field (no error there) holds still too. For each state, the label line is one line, the input stays where it was
 * and as big, level with the Level input, and no box beside it moves (capLineShape, checkCapLineStable). */
export async function checkCapFlag(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, WAR_SHEET);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'Flag check' }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();

  const flag = pg.locator('#sh-cap').locator('xpath=ancestor::label[1]').locator('.f-flag');
  const range = pg.locator('#sh-cap-range');
  const row = pg.locator('.sheetfields');
  const rowShape = () =>
    row.evaluate(el => ({
      height: Math.round(el.getBoundingClientRect().height),
      tops: [...new Set([...el.children].map(child => Math.round(child.getBoundingClientRect().top)))].length,
      widths: ['#sh-level', '#sh-cap'].map(selector => Math.round(document.querySelector(selector).getBoundingClientRect().width)),
    }));

  // 1. no note: the range, no flag; one line of fields, two 160 px boxes
  await expect(range).toBeVisible();
  await expect(flag).toBeHidden();
  const plain = await rowShape();
  const plainCap = await capLineShape(pg, PAGE_CAP);
  check(plain.tops === 1, `the sheet page's settings row is not one line at 960 px (${plain.tops} lines)`);
  check(
    plain.widths.every(width => width === 160),
    `the Level and Item level boxes are not 160 px wide: ${plain.widths}`,
  );

  // 2. a cap above what level 69 allows: a lowered flag with the top in the range's place; the sentence is the live region
  await pg.fill('#sh-level', '69');
  await pg.fill('#sh-cap', '795');
  await pg.locator('#sh-cap').blur();
  await expect(flag).toBeVisible();
  await expect(flag).toHaveNumber(288);
  check(await flag.evaluate(el => el.classList.contains('lowered')), 'the flag of a lowered cap is not the lowered one');
  await expect(range).toBeHidden();
  await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([288, 69]);
  const lowered = await rowShape();
  await checkCapLineStable(pg, "the sheet page's lowered cap", plainCap, await capLineShape(pg, PAGE_CAP));

  // 3. text that is no cap: an error flag that names the range, and the lowered one is gone
  await pg.fill('#sh-cap', '0');
  await expect(flag).toBeVisible();
  await expect(flag).toHaveNumber(795);
  check(await flag.evaluate(el => el.classList.contains('error')), 'the flag of text that is no cap is not the error one');
  await expect(range).toBeHidden();
  await expect(pg.locator('#sh-cap-error')).toBeVisible();
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden();
  const error = await rowShape();
  await checkCapLineStable(pg, "the sheet page's cap that is no cap", plainCap, await capLineShape(pg, PAGE_CAP));

  // 4. no state moves the row or the page
  check(
    lowered.height === plain.height && error.height === plain.height,
    `the row's height changes with the flag: ${plain.height}, ${lowered.height}, ${error.height}`,
  );
  check(lowered.tops === 1 && error.tops === 1, 'the settings row wraps while a flag shows');
  await poll('no sideways scroll', async () => ({ ok: !(await hasHScroll(pg)), got: 'scrolls sideways' }));

  // 5. a valid cap brings the range back
  await pg.fill('#sh-cap', '200');
  await pg.locator('#sh-cap').blur();
  await expect(range).toBeVisible();
  await expect(flag).toBeHidden();

  // 6. the Copy sheet dialog's Item level field: a lowered cap's flag (the dialog shows no error) moves nothing
  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dlg-cap')).toBeVisible();
  const plainDialog = await capLineShape(pg, DIALOG_CAP);
  await pg.fill('#sh-dlg-cap', '795');
  await pg.locator('#sh-dlg-cap').blur();
  await expect(pg.locator('#sh-dialog .f-flag')).toBeVisible();
  await checkCapLineStable(pg, "the dialog's lowered cap", plainDialog, await capLineShape(pg, DIALOG_CAP));
  await pg.fill('#sh-dlg-cap', '0');
  await checkCapLineStable(pg, "the dialog's cap that is no cap", plainDialog, await capLineShape(pg, DIALOG_CAP));
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toBeHidden();
}
