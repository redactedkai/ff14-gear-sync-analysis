// A set page: the edit lock while an Auto-fill runs, and where focus goes.

import { shot } from '../../lib/constants.mjs';
import { check, expect, poll, same } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { focusedId, runFill } from '../../lib/nav.mjs';
import { expectApplyCount, openSageSet, seedSheet } from '../../lib/sheets.mjs';

/** The edit lock while an Auto-fill runs (docs/engineering/sheets.md): on the set page every control that changes the set or its
 * sheet is off (the gear icon, the name's pencil, Copy, Delete, a piece, a pin, the Food row's button, New set in the set
 * menu), a click on a pin changes nothing, Cancel stays, and the ways off the page ask first: Keep waiting stays, Leave
 * and cancel the Auto-fill opens the sheet's page with every control on again. A held worker (HOLD_SOLVE) keeps the Auto-fill
 * running; the sheet's own level, cap, New set and reorder handles cannot be reached while it runs (leaving cancels it). */
export async function checkEditLock(pg) {
  await pg.evaluate(() => {
    window.__holdSolve = true;
  });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const locked = [
    '#sh-set-edit',
    '#sh-set-copy',
    '#sh-set-delete',
    '#sh-gear tr[data-row="4"] [data-pick]',
    '#sh-gear tr[data-row="2"] .pinic',
    '#sh-meal-btn',
  ];
  const stateOf = async () => {
    const off = [];
    for (const sel of locked) {
      if (await pg.locator(sel).isDisabled()) {
        off.push(sel);
      }
    }
    return off;
  };
  check((await stateOf()).length === 0, `at rest, controls are off: ${await stateOf()}`);

  // an Auto-fill that does not finish
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await expect(pg.locator('#sh-fill')).toHaveCount(0); // the Auto-fill button gives way to "Solving…" and Cancel
  await expect(pg.locator('#sh-settings')).toHaveCount(0); // and the gear and the goal summary leave the bar
  await expect(pg.locator('#sh-goal')).toHaveCount(0);
  const off = await stateOf();
  check(same(off, locked), `during an Auto-fill these controls stay on: ${locked.filter(sel => !off.includes(sel))}`);
  const pinned = pg.locator('#sh-gear tr[data-row="2"] .pinic');
  await pinned.click({ force: true });
  await expect(pinned).toHaveAttribute('aria-pressed', 'true'); // the click changed nothing
  await pg.click('#sh-set-switch');
  await expect(pg.locator('#sh-set-menu .setnew')).toBeDisabled();
  await pg.keyboard.press('Escape');
  await pg.screenshot({ path: shot('edit-lock.png') });

  // leaving asks; Keep waiting stays with the Auto-fill running; Leave cancels it and unlocks the sheet's page
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave-q')).toContainText('Mine');
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  // the X at the dialog's top right is Keep too
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await pg.click('#sh-leave .dlgclose');
  await expect(pg.locator('#sh-leave')).toHaveCount(0);
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await pg.click('#sh-leave-go');
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  for (const sel of [
    '#sh-level',
    '#sh-cap',
    '#sh-sync',
    '#sh-new-set',
    '#sh-edit',
    '#sh-copy',
    '#sh-delete',
    '#sh-sets .draghandle:not(.off)',
  ]) {
    await expect(pg.locator(sel).first())
      .toBeEnabled()
      .catch(() => check(false, `${sel} is off after the Auto-fill was cancelled`));
  }
  check(
    (await pg.locator('#sh-sets .draghandle').evaluateAll(hs => hs.every(h => h.draggable))) === true,
    'a reorder handle cannot be dragged after the Auto-fill was cancelled',
  );
  await pg.click('[data-tab=browse]');
}

/** Where focus goes on a set page: back to Auto-fill after Cancel, nowhere broken after leaving a running Auto-fill (no page errors:
 * the set page's late callbacks check `isConnected`), into the Auto-fill settings dialog and back to its gear button, back to
 * the sets button after Keep, and onto Apply once an Auto-fill result waits. */
export async function checkSetPageFocus(pg) {
  await pg.evaluate(() => {
    window.__holdSolve = true;
  });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);

  // Cancel: focus returns to Auto-fill
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-cancel');
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await poll('focus back on Auto-fill after Cancel', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-fill', got };
  });

  // leaving a running Auto-fill: "Leave and cancel the Auto-fill" opens the sheet page with no page error
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-set .setcrumb a');
  await expect(pg.locator('#sh-leave-go')).toBeVisible();
  await pg.click('#sh-leave-go');
  await expect(pg.locator('#sh-set')).toHaveCount(0);
  await openSageSet(pg);

  // the Auto-fill settings popover: focus goes to its first select, and back to the gear button on close
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  const firstSelect = await pg.evaluate(() => document.querySelector('#sh-settings-dialog select')?.id ?? '');
  await poll('focus on the first select of the Auto-fill settings', async () => {
    const got = await focusedId(pg);
    return { ok: firstSelect !== '' && got === firstSelect, got };
  });
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  await poll('focus on the gear button after closing the Auto-fill settings', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-settings', got };
  });

  // the popover is not modal: a dialog with a name and no aria-modal, Goal before Gear to search, no start or Save button of
  // its own; the gear says whether it is open
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  const popover = await pg.evaluate(() => {
    const box = document.querySelector('#sh-settings-dialog');
    const goal = box.querySelector('#s-goal-h');
    const gear = box.querySelector('#s-gear-h');
    return {
      role: box.getAttribute('role'),
      label: box.getAttribute('aria-label'),
      modal: box.getAttribute('aria-modal'),
      backdrop: document.querySelectorAll('.dlgback').length,
      goalFirst: Boolean(goal.compareDocumentPosition(gear) & Node.DOCUMENT_POSITION_FOLLOWING),
      buttons: [...box.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()),
      expanded: document.querySelector('#sh-settings').getAttribute('aria-expanded'),
    };
  });
  check(
    popover.role === 'dialog' && popover.label === 'Auto-fill settings' && popover.modal === null,
    `popover roles: ${JSON.stringify(popover)}`,
  );
  check(
    popover.backdrop === 0 && popover.goalFirst && popover.expanded === 'true',
    `popover: no backdrop, Goal first, gear expanded: ${JSON.stringify(popover)}`,
  );
  check(
    !popover.buttons.some(text => /auto-fill|save/i.test(text) && text !== 'Close settings'),
    `the popover has no start or Save button: ${popover.buttons}`,
  );

  // Tab goes through the boxes in the order drawn (Goal, then Gear to search), and out of the popover (no trap)
  await pg.locator('#s-target').focus();
  const tabbed = [];
  for (let step = 0; step < 4; step++) {
    await pg.keyboard.press('Tab');
    tabbed.push(await focusedId(pg));
  }
  check(same(tabbed.slice(0, 3), ['s-tb1', 's-tb2', 's-gcd']), `Tab order in Goal: ${tabbed}`);
  await pg.locator('#s-from').focus();
  await pg.keyboard.press('Tab');
  const leftPopover = await pg.evaluate(() => !document.querySelector('#sh-settings-dialog').contains(document.activeElement));
  check(leftPopover, 'Tab from the last box leaves the popover');
  await pg.locator('#s-target').focus();
  await pg.keyboard.press('Shift+Tab');
  check(
    (await pg.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Close settings',
    'Shift+Tab from the first box reaches Close settings',
  );

  // inside the popover is not outside: a select, a number box, the Expansion menu and its boxes keep it open
  await pg.selectOption('#s-target', 'crit');
  await pg.click('#s-count');
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp-menu')).toBeVisible();
  await pg.locator('#s-exp-menu input').first().click();
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.locator('#s-exp-menu input').first().click(); // back to the saved state
  await pg.keyboard.press('Escape'); // closes the menu only
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#s-from');
  await expect(pg.locator('#s-from-menu')).toBeVisible();
  await pg.click('#s-from-menu .from-acts [data-action="all"]');
  await pg.click('#s-from-menu .from-acts [data-action="default"]'); // Default
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.keyboard.press('Escape');
  await pg.selectOption('#s-target', 'mind');

  // the X and the gear button close it with the focus on the gear button; a click outside closes it and leaves the focus alone
  await pg.click('#sh-settings-dialog [aria-label="Close settings"]');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  await poll('focus on the gear button after the X', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-settings', got };
  });
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  check((await focusedId(pg)) === 'sh-settings', 'the gear button closes it and keeps the focus');
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#sh-set-name');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  check((await focusedId(pg)) !== 'sh-settings', 'a click outside does not pull the focus back to the gear button');

  // a draft: the bar has Apply and Discard only (no Auto-fill, no gear, no goal)
  await pg.locator('#sh-gear tr[data-row="4"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expect(pg.locator('#sh-apply')).toBeVisible();
  for (const gone of ['#sh-fill', '#sh-settings', '#sh-goal']) {
    await expect(pg.locator(gone)).toHaveCount(0);
  }
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-fill')).toBeVisible();
  await expect(pg.locator('#sh-goal')).toBeVisible();

  // the leave question: Keep returns focus to the sets button
  await pg.locator('#sh-gear tr[data-row="4"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-leave')).toHaveCount(0);
  await poll('focus on the sets button after Keep', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-set-switch', got };
  });
  await pg.click('#sh-discard');

  // an Auto-fill result: Apply (Discard if Apply is disabled) has focus; a real search, so the held worker lets it through
  await pg.evaluate(() => {
    window.__holdSolve = false;
  });
  await runFill(pg);
  await poll('focus on Apply or Discard after an Auto-fill result', async () => {
    const got = await focusedId(pg);
    const applyOff = await pg.locator('#sh-apply').isDisabled();
    return { ok: got === (applyOff ? 'sh-discard' : 'sh-apply'), got };
  });
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}

/** Escape in the Auto-fill settings closes only the topmost open layer, and the focus goes back to the control that opened it:
 * a menu (Gear categories, Expansion) first, with the focus on its button, the popover last (focus on the gear button). */
export async function checkSettingsEscape(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  const dialog = pg.locator('#sh-settings-dialog');
  const focusOn = async (what, id) =>
    poll(`focus on ${id} ${what}`, async () => {
      const got = await focusedId(pg);
      return { ok: got === id, got };
    });

  // the Gear categories menu: Escape closes the menu only, the focus goes to its button
  await pg.click('#s-from');
  await expect(pg.locator('#s-from-menu')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#s-from-menu')).toBeHidden();
  await focusOn('after the Gear categories menu closed', 's-from');
  await expect(dialog).toBeVisible();

  // the Expansion menu: one Escape closes the menu only
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp-menu')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#s-exp-menu')).toBeHidden();
  await focusOn('after the Expansion menu closed', 's-exp');
  await expect(dialog).toBeVisible();

  // nothing inside is open: Escape closes the popover and the focus goes to the gear button
  await pg.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await focusOn('after the popover closed', 'sh-settings');
}
