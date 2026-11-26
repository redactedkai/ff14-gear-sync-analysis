// The Sheets tab: the sheet manager.

import { NARROW, STORE_KEY, shot } from '../../lib/constants.mjs';
import { check, checkNoBadText, expect, poll, same } from '../../lib/expect.mjs';
import { hasHScroll, setNumber, waitReady, waitSaved } from '../../lib/nav.mjs';
import { figuresRadio, rowAction, sheetNames } from '../../lib/sheets.mjs';

/** A saved sheet record for White Mage holding one set with the Ironworks Magitek Cane (item level 120, a White Mage
 * weapon no other healer can wear) in its weapon row, pinned: written straight to storage, since the step needs only the
 * record (the set page picks a piece in checkSetPage and checkPickMenu). */
const CANE_SHEET = {
  v: 1,
  id: 's_cane',
  name: 'Canes',
  description: '',
  job: 'WHM',
  level: 100,
  sync: { on: false, cap: 795 },
  sets: [
    {
      id: 'g_cane',
      name: 'Cane set',
      description: '',
      pieces: ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'].map((slot, i) =>
        i === 0 ? { slot, gameId: 8645, stones: [] } : { slot },
      ),
      meal: null,
      pinned: { pieces: [0], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};

/** The Sheets tab's manager flows: the empty state, New sheet, Edit name and description, the level and sync fields,
 * New set and the set page's read-only line, set notes, reordering by keyboard and by drag, Copy sheet (and its list of
 * pieces to clear, from a seeded White Mage cane), Delete, and a reload keeping it all; no panel on the tab, no
 * sideways scroll at 960 px. */
export async function checkSheets(pg) {
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await expect(pg.locator('section[aria-label="Job and sync settings"]')).toBeHidden();
  await expect(pg.locator('#sh-empty')).toBeVisible();

  // New sheet: the name follows the job, level and sync until one is typed
  await pg.click('#sh-new-first');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.click('#sh-dialog [data-job-id=WHM]');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100');
  await setNumber(pg, '#sh-dlg-level', '50');
  await pg.locator('#sh-dlg-sync').check();
  // a cap above what the level allows is lowered with the Job and sync panel's note (level 50: item level 135)
  await setNumber(pg, '#sh-dlg-cap', '500');
  await expect(pg.locator('#sh-dlg-cap')).toHaveValue('135');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toHaveTextParts([135, 50]);
  await setNumber(pg, '#sh-dlg-cap', '130');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toBeHidden();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 50 ilvl 130');
  await pg.fill('#sh-dlg-description', 'Week 1\nsecond line');
  check(!(await hasHScroll(pg)), `Sheets: the New sheet dialog scrolls the page sideways at ${NARROW.width} px`);
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('White Mage Lv 50 ilvl 130');
  await expect(pg.locator('#sh-description')).toHaveText('Week 1 second line');
  await expect(pg.locator('#sh-no-sets')).toBeVisible();
  await expect(pg.locator('#sh-level')).toHaveValue('50');

  // Edit name and description (an emptied name is refused: unit sheets/dialogs)
  await pg.click('#sh-edit');
  await pg.fill('#sh-dlg-name', 'Heal T1');
  await pg.keyboard.press('Enter');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Heal T1');

  // level and item level sync change at once, with no question (the cap that follows the level is checkSheetCap's)
  await setNumber(pg, '#sh-level', '70');
  await setNumber(pg, '#sh-cap', '300');
  await expect(pg.locator('#sh-cap')).toHaveValue('300');
  await pg.screenshot({ path: shot('sheet-settings.png') });

  // New set opens the set page with the sheet's settings as a read-only line
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await expect(pg.locator('#sh-set-settings')).toHaveTextParts(['White Mage', 70, 300]);
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await pg.click('#sh-new-set');
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 1', 'Set 2']), `sets: ${await sheetNames(pg, '#sh-sets')}`);
  // the set's notes: edited in "Edit gear set", the first line in the list
  await rowAction(pg, '#sh-sets', 1, 'edit').click();
  await expect(pg.locator('#sh-dlg-description')).toBeVisible();
  await pg.fill('#sh-dlg-description', 'My own set\nwith a crafted body');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sets .setnotes')).toHaveText('My own set');
  // the figures switch: the effects (the default) or the stat points of the set page's Total row; the choice is kept (saved)
  const listHeads = async () => (await pg.locator('#sh-sets thead th.n').allInnerTexts()).map(text => text.trim());
  check(same(await listHeads(), ['MND', 'GCD', 'CRT', 'CRIT DMG', 'DET', 'DHT', 'PIE', 'DOT']), `effects columns: ${await listHeads()}`);
  await pg.click(figuresRadio('points'));
  check(same(await listHeads(), ['MND', 'VIT', 'CRT', 'DET', 'DHT', 'SPS', 'PIE']), `stat points columns: ${await listHeads()}`);
  await waitSaved(pg, "s => s.sheetFigures === 'points'");
  await pg.click(figuresRadio('effects'));
  await waitSaved(pg, "s => s.sheetFigures === 'effects'");
  // keyboard reorder: the handle keeps the focus and the live region says where the row went
  await pg.locator('#sh-sets tbody tr:nth-of-type(2) .draghandle').focus();
  await pg.keyboard.press('ArrowUp');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 2', 'Set 1']), `sets after the move: ${await sheetNames(pg, '#sh-sets')}`);
  const firstRow = await pg.locator('#sh-sets tbody tr:nth-of-type(1)').getAttribute('data-set');
  await poll('the moved row keeps the focus on its handle', async () => {
    const got = await pg.evaluate(() => document.activeElement?.closest('tr')?.dataset.set);
    return { ok: got === firstRow, got };
  });
  check(!(await hasHScroll(pg)), `Sheets: a sheet's page scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('sheet-page.png'), fullPage: true });

  // a second sheet goes to the top; drag the first below it
  await pg.click('#sh-sheet .setcrumb a');
  await pg.click('#sh-new');
  await pg.click('#sh-dialog [data-job-id=PLD]');
  await pg.click('#sh-dlg-ok');
  await pg.click('#sh-sheet .setcrumb a');
  check(same(await sheetNames(pg, '#sh-list'), ['Paladin Lv 100', 'Heal T1']), `sheets: ${await sheetNames(pg, '#sh-list')}`);
  await pg.locator('#sh-list tbody tr:nth-of-type(1) .draghandle').dragTo(pg.locator('#sh-list tbody tr:nth-of-type(2)'), {
    targetPosition: { x: 300, y: 60 },
  });
  await expect(pg.locator('#sh-list tbody tr:nth-of-type(1) a.sname')).toHaveText('Heal T1');

  // Copy sheet to another healer: the manager shows the copy on top
  await rowAction(pg, '#sh-list', 1, 'copy').click();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('Heal T1 (1)');
  await pg.click('#sh-dialog [data-job-id=AST]');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-toast')).toContainText('Heal T1 (1)');
  await expect(pg.locator('#sh-toast')).toHaveCount(1); // the three Sheets screens share the id: only one is on the page
  await expect(pg.locator('#sh-list tbody tr:nth-of-type(1) .jobcell')).toHaveText('Astrologian');

  // Delete asks first; the row goes
  await rowAction(pg, '#sh-list', 3, 'delete').click();
  await expect(pg.locator('#sh-dialog .question')).toContainText('Paladin Lv 100');
  // the question opens with the focus on Cancel: a stray Enter does not delete
  await pg
    .waitForFunction(() => document.activeElement?.id === 'sh-dlg-cancel', null, { timeout: 3000 })
    .catch(() => check(false, 'a delete question opens with the focus on Cancel'));
  // the X at the top right closes it like Cancel: the sheet stays
  await pg.click('#sh-dialog .dlgclose');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await rowAction(pg, '#sh-list', 3, 'delete').click();
  await expect(pg.locator('#sh-dialog .question')).toBeVisible();
  await pg.waitForFunction(() => document.activeElement?.id === 'sh-dlg-cancel', null, { timeout: 3000 }); // the dialog's keys need the focus inside it
  // Escape closes the question and the focus goes back to the Delete link that opened it
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await pg
    .waitForFunction(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.trim() === 'Delete', null, {
      timeout: 3000,
    })
    .catch(() => check(false, 'after Escape on a delete question the focus is back on the Delete link'));
  await rowAction(pg, '#sh-list', 3, 'delete').click();
  await pg.click('#sh-dlg-ok');
  check(same(await sheetNames(pg, '#sh-list'), ['Heal T1 (1)', 'Heal T1']), `sheets after Delete: ${await sheetNames(pg, '#sh-list')}`);
  check(!(await hasHScroll(pg)), `Sheets: the manager scrolls sideways at ${NARROW.width} px`);
  await checkNoBadText(pg, 'the sheet manager');

  // a reload keeps the sheets, their order, settings and sets; a record not in the order (the seeded one) comes last
  await pg.evaluate(([key, sheet]) => localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet)), [STORE_KEY, CANE_SHEET]);
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await pg.reload();
  await waitReady(pg);
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  check(
    same(await sheetNames(pg, '#sh-list'), ['Heal T1 (1)', 'Heal T1', 'Canes']),
    `sheets after reload: ${await sheetNames(pg, '#sh-list')}`,
  );
  await rowAction(pg, '#sh-list', 2, 'open').click();
  await expect(pg.locator('#sh-level')).toHaveValue('70');
  await expect(pg.locator('#sh-cap')).toHaveValue('300');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 2', 'Set 1']), `sets after reload: ${await sheetNames(pg, '#sh-sets')}`);
  await expect(pg.locator('#sh-sets .setnotes')).toHaveText('My own set');

  // Copy sheet to a job that cannot wear a piece: the form lists it and waits for the box
  await pg.click('#sh-sheet .setcrumb a');
  await rowAction(pg, '#sh-list', 3, 'copy').click();
  await pg.click('#sh-dialog [data-job-id=AST]');
  await expect(pg.locator('#sh-dlg-clear')).toHaveTextParts(['Astrologian', 1]);
  await expect(pg.locator('#sh-dlg-clear li')).toHaveTextParts(['Cane set', 'Ironworks Magitek Cane']);
  await expect(pg.locator('#sh-dlg-ok')).toBeDisabled();
  check(!(await hasHScroll(pg)), `Sheets: the Copy sheet dialog scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('sheet-copy.png') });
  await pg.locator('#sh-dlg-ack').check();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-toast')).toHaveTextParts(['Canes (1)', 1]);
  // back on the Gear browser for the runner (the shared setup's panel)
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
