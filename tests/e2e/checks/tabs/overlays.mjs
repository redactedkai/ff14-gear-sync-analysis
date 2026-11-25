// The menus and popovers of the page share one overlay manager (ui/overlays.js): Escape closes the topmost one with the focus back on its
// button, a press outside or Tab out closes it, ArrowDown opens it, one is open at a time, and a change of screen closes every one.

import { check, expect, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { focusedId, showMath, showTab } from '../../lib/nav.mjs';
import { rowAction, seedSheet } from '../../lib/sheets.mjs';

/** One overlay of the math tab's bar: its button, what it opens, and the focus where Escape leaves it. */
const MATH_BAR_OVERLAYS = [
  { name: 'Job menu', button: '#m-job-btn', panel: '#m-job-menu' },
  { name: 'Substats & materia popover', button: '#p-piece-chip', panel: '#p-piece-pop' },
  { name: 'Sync settings popover', button: '#p-sync-chip', panel: '#p-sync-pop' },
];

/** Waits until the focus is on the element with id `id` (the manager puts it back on the opener at once; a frame can pass first). */
const focusIsOn = (pg, id, what) =>
  poll(what, async () => {
    const got = await focusedId(pg);
    return { ok: got === id, got: `the focus is on '${got}'` };
  });

/** Each overlay of the math bar: ArrowDown on its button opens it, Escape closes it with the focus back on the button, Tab out
 * closes it, and a press outside closes it. */
export async function checkOverlayKeys(pg) {
  await showMath(pg, 'piece');
  for (const { name, button, panel } of MATH_BAR_OVERLAYS) {
    await pg.focus(button);
    await pg.keyboard.press('ArrowDown');
    await expect(pg.locator(panel)).toBeVisible();
    await pg.keyboard.press('Escape');
    await expect(pg.locator(panel)).toBeHidden();
    await focusIsOn(pg, button.slice(1), `${name}: the focus back on its button after Escape`);

    await pg.click(button);
    await expect(pg.locator(panel)).toBeVisible();
    await pg.mouse.click(5, 300); // the page outside the bar
    await expect(pg.locator(panel)).toBeHidden();
    check(
      (await focusedId(pg)) !== button.slice(1),
      `${name}: a press outside left the focus on its button instead of where the press went`,
    );
  }
  // Tab out of the Job menu: the focus leaves the menu and its button, so the menu closes
  await pg.focus('#m-job-btn');
  await pg.keyboard.press('ArrowDown');
  await expect(pg.locator('#m-job-menu')).toBeVisible();
  // Zag moves the focus into the menu a frame after showing it: leave only once it is there
  await pg.waitForFunction(() => document.querySelector('#m-job-menu')?.contains(document.activeElement));
  await pg.focus('#p-slot');
  await expect(pg.locator('#m-job-menu')).toBeHidden();
}

/** One overlay is open at a time, and every one closes with a change of sub-tab or tab. */
export async function checkOverlaysOneAtATimeAndScreenChange(pg) {
  await showMath(pg, 'piece');
  await pg.click('#m-job-btn');
  await expect(pg.locator('#m-job-menu')).toBeVisible();
  await pg.click('#p-sync-chip');
  await expect(pg.locator('#p-sync-pop')).toBeVisible();
  await expect(pg.locator('#m-job-menu')).toBeHidden();
  // a change of sub-tab
  await pg.click('[data-sub=tiers]');
  await expect(pg.locator('#p-sync-pop')).toBeHidden();
  // the Substat tiers "?" note and the Job menu are never open together
  await pg.click('#t-table [data-help="crit"]');
  await expect(pg.locator('#t-pop')).toBeVisible();
  await pg.focus('#m-job-btn');
  await pg.keyboard.press('ArrowDown');
  await expect(pg.locator('#m-job-menu')).toBeVisible();
  await expect(pg.locator('#t-pop')).toBeHidden();
  await pg.keyboard.press('Escape');
  // the note: Escape closes it with the focus on its "?", and a change of tab closes it
  await pg.click('#t-table [data-help="crit"]');
  await expect(pg.locator('#t-pop')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#t-pop')).toBeHidden();
  check(
    await pg.evaluate(() => document.activeElement?.dataset.help === 'crit'),
    'the Substat tiers note: the focus is not back on its "?" after Escape',
  );
  await pg.keyboard.press('Tab'); // the note is closed: nothing to close, the focus just moves on
  await pg.click('#t-table [data-help="crit"]');
  await expect(pg.locator('#t-pop')).toBeVisible();
  await showTab(pg, 'browse');
  await showTab(pg, 'math');
  await expect(pg.locator('#t-pop')).toBeHidden();
}

/** The math tab's "?" help is modal: the focus goes into it, Tab stays inside it, and Escape closes it with the focus back on the "?". */
export async function checkHelpIsModal(pg) {
  await showMath(pg, 'piece');
  await pg.click('#m-help');
  await expect(pg.locator('#m-help-pop')).toBeVisible();
  await focusIsOn(pg, 'm-help-pop', 'the help: the focus moves into it when it opens');
  for (let i = 0; i < 8; i++) {
    await pg.keyboard.press('Tab');
  }
  check(await pg.evaluate(() => Boolean(document.activeElement?.closest('#m-help-pop'))), 'the help: Tab left it for the page behind');
  for (let i = 0; i < 8; i++) {
    await pg.keyboard.press('Shift+Tab');
  }
  check(
    await pg.evaluate(() => Boolean(document.activeElement?.closest('#m-help-pop'))),
    'the help: Shift+Tab left it for the page behind',
  );
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#m-help-pop')).toBeHidden();
  await focusIsOn(pg, 'm-help', 'the help: the focus back on its "?" after Escape');
}

/** A note set while the Sheets tab is left is still seen: the toast is outside the tabs (deleting a sheet says so). A failed save's
 * message shows until a save works. */
export async function checkNoteSurvivesTabChange(pg) {
  await seedSheet(pg, SET_SHEET);
  await showTab(pg, 'sheets');
  await rowAction(pg, '#sh-list', 1, 'delete').click();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await showTab(pg, 'math');
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await expect(pg.locator('#sh-toast')).toHaveCount(1);

  // the message of a failed save is pinned (not timed) until a save works
  await seedSheet(pg, SET_SHEET);
  await pg.evaluate(id => {
    location.hash = `#/sheets/${id}`;
  }, SET_SHEET.id);
  await expect(pg.locator('#sh-level')).toBeVisible();
  await pg.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage is full');
    };
  });
  await pg.fill('#sh-level', '51');
  await pg.locator('#sh-level').blur();
  await expect(pg.locator('#sh-save-error')).toBeVisible();
  await pg.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
  });
  await pg.fill('#sh-level', '52');
  await pg.locator('#sh-level').blur();
  await expect(pg.locator('#sh-save-error')).toBeHidden();
}
