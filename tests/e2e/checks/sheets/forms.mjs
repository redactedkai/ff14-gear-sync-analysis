// The Sheets tab: the forms and the cap.

import { NARROW, STORE_KEY } from '../../lib/constants.ts';
import { check, expect, poll } from '../../lib/expect.ts';
import { focusedId, hasHScroll, setNumber, waitSaved } from '../../lib/nav.ts';
import { seedSheet } from '../../lib/sheets.ts';

/** The Sheets tab's dialogs and menus as a user types into them: New sheet shows the range texts (1–100, 1–795) and the
 * default name for the job, a blank name is refused with its reason at the Name label, the box stays empty, and the dialog stays
 * open; Copy sheet refuses a blank name the same way; a dialog's first box takes the focus and Escape gives it back to the button that opened the
 * dialog; the sheet page's switch menu gives the focus to the current sheet; a new set's page shows the breadcrumb and the
 * sheet's settings read-only (item level sync off here; checkSheets has it on). At 960 px. */
export async function checkSheetForms(pg) {
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  await pg.click('#sh-new-first');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await poll('focus in the New sheet dialog', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-dlg-name', got };
  });
  await pg.click('#sh-dialog [data-job-id=WHM]');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100');
  await expect(pg.locator('#sh-dlg-level-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-dlg-cap-range')).toHaveText('1–795');
  await pg.fill('#sh-dlg-name', '   ');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dlg-name-err')).toBeVisible();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('   ');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.fill('#sh-dlg-name', 'White Mage Lv 100');
  await expect(pg.locator('#sh-dlg-name-err')).toBeHidden();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('White Mage Lv 100');
  await expect(pg.locator('#sh-level-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-cap-range')).toHaveText('1–795');

  // Copy sheet: Escape gives the focus back to the button; a blank name is refused and stays blank
  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await poll('focus in the Copy sheet dialog', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-dlg-name', got };
  });
  // the "?" panel: Escape closes it first, and the dialog on the next press
  await pg.click('#sh-dlg-help');
  await expect(pg.locator('#sh-dlg-help-panel')).toBeVisible();
  await expect(pg.locator('#sh-dlg-help')).toHaveAttribute('aria-expanded', 'true');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dlg-help-panel')).toBeHidden();
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await poll('focus back on Copy sheet after Escape', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-copy', got };
  });
  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100 (1)');
  await pg.fill('#sh-dlg-name', '');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dlg-name-err')).toBeVisible();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('');
  await pg.fill('#sh-dlg-name', 'White Mage Lv 100 (1)');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-toast')).toContainText('White Mage Lv 100 (1)');

  // the switch menu: the current sheet takes the focus; Escape closes it
  await pg.locator('#sh-list a.sname', { hasText: 'White Mage Lv 100 (1)' }).click();
  await pg.click('#sh-sheet-switch');
  await expect(pg.locator('#sh-sheet-menu')).toBeVisible();
  await poll('focus on the current sheet in the switch menu', async () => {
    const got = await pg.evaluate(() => {
      const a = document.activeElement;
      return a?.matches('#sh-sheet-menu .setitem.cur') ? a.textContent.trim() : `${a?.tagName} ${a?.id}`;
    });
    return { ok: got === 'White Mage Lv 100 (1)', got };
  });
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-sheet-menu')).toBeHidden();

  // New sheet in the switch menu goes to the manager and opens its dialog there; the draw that follows keeps it open
  await pg.click('#sh-sheet-switch');
  await pg.locator('#sh-sheet-menu .setnew').click();
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await expect(pg.locator('#sh-list')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await pg.locator('#sh-list a.sname', { hasText: 'White Mage Lv 100 (1)' }).click();

  // a new set's page: the breadcrumb and the sheet's settings
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .setcrumb')).toContainText('White Mage Lv 100 (1)');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await expect(pg.locator('#sh-set-settings')).toHaveTextParts(['White Mage', 100]);
  check(!(await hasHScroll(pg)), `Sheets: a new set's page scrolls sideways at ${NARROW.width} px`);
  // another set gets a page of its own: the element is made again, so nothing of the first set's page stays
  await pg.evaluate(() => document.querySelector('gsa-set-page').setAttribute('data-first-set', ''));
  await pg.click('#sh-set-switch');
  await pg.locator('#sh-set-menu .setnew').click();
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 2');
  check(
    await pg.evaluate(() => !document.querySelector('gsa-set-page').hasAttribute('data-first-set')),
    "the second set reuses the first set's page",
  );
  // the set switcher's rows are real links: the first goes to the sheet's page
  await pg.click('#sh-set-switch');
  await pg.locator('#sh-set-menu .setall').click();
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** A sheet's item level cap follows its level on the sheet's page, by the page's own store and with its note: a saved cap above what
 * its level allows is repaired as it is read (level 70 with cap 500 is read as 405), a cap is lowered when the level changes (50: 135;
 * 40: 43) and never raised again, and a cap typed too high is lowered once it commits. The field's own rules (the errors, the
 * ranges, the up arrow at the limit, the settings row keeping its shape) are `tests/stories/sheets/sheet-page.spec.ts`'s and
 * `tests/stories/app/cap-field.spec.ts`'s; the manager's Patch column is `views/sheet-manager`'s. */
export async function checkSheetCap(pg) {
  // saved at level 70 with cap 500: read as 405, the best gear made for level 70 (its weapons)
  const sheet = { v: 1, id: 's_cap', name: 'Cap', description: '', job: 'SGE', level: 70, sync: { on: true, cap: 500 }, sets: [] };
  await seedSheet(pg, { ...sheet, gameData: { commit: 'd9582a6', date: '2026-09-30' }, createdAt: 0, updatedAt: 0 });
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'Cap' }).click();
  await expect(pg.locator('#sh-cap')).toHaveValue('405');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden(); // repaired on reading, with no note
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await setNumber(pg, '#sh-cap', '123');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden();
  await setNumber(pg, '#sh-level', '40');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([43, 40]);
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await pg.fill('#sh-cap', '999');
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([135, 50]);
  await waitSaved(pg, 's => true');
  check(
    await pg.evaluate(key => JSON.parse(localStorage.getItem(`${key}:sheet:s_cap`)).sync.cap === 135, STORE_KEY),
    'Sheets: the lowered cap was not saved',
  );
  await pg.click('[data-tab=browse]');
}

/* A Sage sheet (level 100, synced to 123) with one set of crafted item level 115 pieces (tests/unit/helpers/
   sheet-fixtures.js sageSet): the weapon, hands and feet rows empty, every other row pinned, and notes. */
