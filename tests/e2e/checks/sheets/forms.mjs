// The Sheets tab: the forms and the cap.

import { NARROW, STORE_KEY } from '../../lib/constants.mjs';
import { check, expect, poll } from '../../lib/expect.mjs';
import { afterFrames, focusedId, hasHScroll, setNumber, waitSaved } from '../../lib/nav.mjs';
import { seedSheet } from '../../lib/sheets.mjs';

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
  await expect(pg.locator('#sh-dialog label:has(#sh-dlg-level) .f-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-dialog label:has(#sh-dlg-cap) .f-range')).toHaveText('1–795');
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
  await expect(pg.locator('#sh-sheet-menu')).toHaveCount(0);

  // a new set's page: the breadcrumb and the sheet's settings
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .setcrumb')).toContainText('White Mage Lv 100 (1)');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await expect(pg.locator('#sh-set-settings')).toHaveTextParts(['White Mage', 100]);
  check(!(await hasHScroll(pg)), `Sheets: a new set's page scrolls sideways at ${NARROW.width} px`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** A sheet's item level cap follows its level by the Job and sync panel's rule and with its note (checkCapValidation's
 * checks, on the sheet's page): the ranges, an error for text that is no item level (the sheet keeps its cap), a cap
 * lowered when the level changes and never raised, a cap typed too high lowered, the note staying put under the up
 * arrow at the limit, and a saved cap above what its level allows repaired as it is read. */
export async function checkSheetCap(pg) {
  // saved at level 70 with cap 500: read as 405, the best gear made for level 70 (its weapons)
  const sheet = { v: 1, id: 's_cap', name: 'Cap', description: '', job: 'SGE', level: 70, sync: { on: true, cap: 500 }, sets: [] };
  await seedSheet(pg, { ...sheet, gameData: { commit: 'd9582a6', date: '2026-09-30' }, createdAt: 0, updatedAt: 0 });
  await pg.click('[data-tab=sheets]');
  // the manager's Patch column: the patch of the data the sheet was stamped with (2026-09-30: after 7.56, before 7.57), the data on hover
  const capRow = pg.locator('#sh-list tbody tr', { has: pg.locator('a.sname', { hasText: 'Cap' }) });
  await expect(pg.locator('#sh-list thead th').last()).toHaveText('Patch');
  await expect(capRow.locator('td').last()).toHaveText('7.56');
  await expect(capRow.locator('td').last()).toHaveAttribute('title', 'Game data d9582a6, 2026-09-30');
  await pg.locator('#sh-list a.sname', { hasText: 'Cap' }).click();
  await expect(pg.locator('#sh-cap')).toHaveValue('405');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden(); // repaired on reading, with no note
  // the ranges next to the labels
  await expect(pg.locator('#sh-level-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-cap-range')).toHaveText('1–795');
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await setNumber(pg, '#sh-cap', '123');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden();
  // not a whole item level: an error, and the sheet keeps its last cap
  await pg.fill('#sh-cap', '0');
  await expect(pg.locator('#sh-cap-error')).toHaveNumber(795);
  await pg.locator('#sh-cap').dispatchEvent('change');
  await pg.fill('#sh-cap', '123');
  await expect(pg.locator('#sh-cap-error')).toBeHidden();
  await waitSaved(pg, 's => true');
  check(
    await pg.evaluate(key => JSON.parse(localStorage.getItem(`${key}:sheet:s_cap`)).sync.cap === 123, STORE_KEY),
    'Sheets: the cap field took 0',
  );
  // the cap follows the level: at level 40 cap 123 is lowered to 43, the best gear made for level 40; back at level 50
  // it stays 43 (never raised), with no error either way
  await setNumber(pg, '#sh-level', '40');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await expect(pg.locator('#sh-cap-error')).toBeHidden();
  await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([43, 40]);
  check(await pg.locator('#sh-cap').evaluate(e => e.classList.contains('lowered')), 'Sheets: the lowered cap field does not flash');
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden(); // the note goes with the next change
  // a cap entered above what the level allows is lowered once it commits; above the highest real item level too
  for (const typed of ['500', '999']) {
    await pg.fill('#sh-cap', typed);
    await expect(pg.locator('#sh-cap')).toHaveValue('135');
    await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([135, 50]);
    await expect(pg.locator('#sh-cap-error')).toBeHidden();
  }
  // the up arrow at the limit: each press is lowered again, and the note stays put rather than hiding and showing
  await pg.evaluate(() => {
    window.__noteHidden = 0;
    const note = document.querySelector('#sh-cap-lowered');
    new MutationObserver(() => {
      if (note.style.display === 'none') {
        window.__noteHidden++;
      }
    }).observe(note, { attributes: true, attributeFilter: ['style'] });
  });
  await pg.locator('#sh-cap').focus();
  for (let i = 0; i < 5; i++) {
    await pg.keyboard.press('ArrowUp');
    await afterFrames(pg);
  }
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await expect(pg.locator('#sh-cap-lowered')).toHaveTextParts([135, 50]);
  check((await pg.evaluate(() => window.__noteHidden)) === 0, 'Sheets: the lowered note hides and shows again on the up arrow');
  await pg.click('[data-tab=browse]');
}

/* A Sage sheet (level 100, synced to 123) with one set of crafted item level 115 pieces (tests/unit/helpers/
   sheet-fixtures.js sageSet): the weapon, hands and feet rows empty, every other row pinned, and notes. */
