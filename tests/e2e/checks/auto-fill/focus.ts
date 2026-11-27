// A set page: the edit lock while an Auto-fill runs, and where focus goes.

import { shot } from '../../lib/constants.ts';
import { check, expect, poll } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { focusedId, runFill } from '../../lib/nav.ts';
import { openSageSet, seedSheet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** The edit lock while an Auto-fill runs, on the real page (docs/engineering/sheets.md): leaving the running set page by "Leave and
 * cancel the Auto-fill" opens the sheet's page with every control on again (level, item level, IL Sync, New set, Edit, Copy,
 * Delete and the reorder handles, which can be dragged). Which controls the lock turns off, Cancel, and the question's Keep and X
 * are `tests/stories/set-page/set-page.spec.ts`'s ("FillHeld"). A held worker (HOLD_SOLVE) keeps the Auto-fill running. */
export async function checkEditLock(pg: Page) {
  await pg.evaluate(() => {
    window.__holdSolve = true;
  });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);

  // an Auto-fill that does not finish
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.screenshot({ path: shot('edit-lock.png') });

  // leaving asks; Leave cancels it and unlocks the sheet's page
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave-q')).toContainText('Mine');
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

/** The Auto-fill settings popover's markup on the real page: Goal comes before Gear to search, and the popover has no start or
 * Save button of its own. Where the focus goes after an Auto-fill result: Apply (Discard if Apply is disabled), with a real search,
 * so the held worker lets it through. The popover's keys, focus, roles and closing are
 * `tests/stories/set-page/settings-popover.spec.ts`'s and `set-page.spec.ts`'s. */
export async function checkSetPageFocus(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);

  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  const popover = await pg.evaluate(() => {
    const box = document.querySelector('#sh-settings-dialog');
    const goal = box.querySelector('#s-goal-h');
    const gear = box.querySelector('#s-gear-h');
    return {
      goalFirst: Boolean(goal.compareDocumentPosition(gear) & Node.DOCUMENT_POSITION_FOLLOWING),
      buttons: [...box.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()),
    };
  });
  check(popover.goalFirst, 'Goal does not come before Gear to search in the Auto-fill settings');
  check(
    !popover.buttons.some((text: string) => /auto-fill|save/i.test(text) && text !== 'Close settings'),
    `the popover has no start or Save button: ${popover.buttons}`,
  );
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toBeHidden();

  // an Auto-fill result: Apply (Discard if Apply is disabled) has focus
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
