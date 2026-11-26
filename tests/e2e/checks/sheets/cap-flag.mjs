// The Sheets tab: the flag in the Copy sheet dialog's Item level label line (a lowered cap, text that is no cap).

import { NARROW } from '../../lib/constants.mjs';
import { expect } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { seedSheet } from '../../lib/sheets.mjs';
import { capLineShape, checkCapLineStable } from '../../lib/shared-checks.mjs';

// the New and Copy sheet dialog's cap field: its label line, the two inputs, and the boxes beside it
const DIALOG_CAP = {
  line: '#sh-dialog .capline',
  cap: '#sh-dlg-cap',
  level: '#sh-dlg-level',
  others: ['#sh-dlg-level', '#sh-dlg-sync', '#sh-dlg-ok'],
};

// Warrior, one gear set holding the Ironworks head piece (game id 9901), level 100, item level sync on at a cap of 660
const WAR_SHEET = { ...pieceSheet('s_capflag', 'Flag check', 'WAR', 2, 9901, []), sync: { on: true, cap: 660 } };

/** The Copy sheet dialog's Item level field at 960 px: a lowered cap's flag (the dialog shows no error) and text that is no cap
 * move nothing (the label stays one line, the input stays where it was and as big, level with the Level input, no box beside it
 * moves: capLineShape, checkCapLineStable). The sheet page's settings row is `tests/stories/sheets/sheet-page.spec.ts`'s and the
 * field's own states `tests/stories/app/cap-field.spec.ts`'s; the dialog has no story with its cap field yet. */
export async function checkCapFlag(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, WAR_SHEET);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'Flag check' }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();

  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dlg-cap')).toBeVisible();
  const plainDialog = await capLineShape(pg, DIALOG_CAP);
  await pg.fill('#sh-dlg-level', '69'); // level 69 allows at most 288, so 795 is lowered
  await pg.fill('#sh-dlg-cap', '795');
  await pg.locator('#sh-dlg-cap').blur();
  await expect(pg.locator('#sh-dialog .f-flag')).toBeVisible();
  await checkCapLineStable(pg, "the dialog's lowered cap", plainDialog, await capLineShape(pg, DIALOG_CAP));
  await pg.fill('#sh-dlg-cap', '0');
  await checkCapLineStable(pg, "the dialog's cap that is no cap", plainDialog, await capLineShape(pg, DIALOG_CAP));
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toBeHidden();
}
