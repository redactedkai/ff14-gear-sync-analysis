// A set page: clicks and keys that come right after each other (a double-click on Apply, Escape as the leave question opens).

import { NARROW } from '../../lib/constants.ts';
import { check, expect } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { expectApplyCount, openSet, seedSheet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** How long, in ms, to wait for a second Auto-fill that a double-click might have started. */
const SECOND_FILL_WAIT_MS = 1500;

/** Picks the first other piece for the Hands row: a draft with changes. */
async function pickHands(pg: Page) {
  await pg.locator('#sh-gear tr[data-row="4"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
}

/** A double-click on Apply applies once: the second click of the pair lands where the Auto-fill button comes up and is
 * ignored, so no Auto-fill starts (it would end in an error on the page, since the bar had changed).  Escape pressed the
 * moment the leave question opens keeps the draft and leaves no error (the question's focus move found the question gone).
 * Page errors fail the step through the runner. */
export async function checkQuickClicks(pg: Page) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, SET_SHEET);
  await openSet(pg, SET_SHEET.name, 'Mine');

  await pickHands(pg);
  await pg.dblclick('#sh-apply');
  await pg.waitForTimeout(SECOND_FILL_WAIT_MS);
  check((await pg.locator('#sh-cancel').count()) === 0, 'Set page: a double-click on Apply started an Auto-fill');
  check((await pg.locator('#sh-apply').count()) === 0, 'Set page: a double-click on Apply left a result waiting');
  await expect(pg.locator('#sh-fill')).toBeVisible();

  // the question opened and closed at once
  await pg.locator('#sh-gear tr[data-row="6"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  // the click and the key arrive in one task, before the page has drawn the question
  await pg.evaluate(() => {
    const crumb = document.querySelector<HTMLElement>('#sh-set .setcrumb a:nth-of-type(2)');
    if (!crumb) {
      throw new Error('no breadcrumb link to the sheet');
    }
    crumb.click();
    crumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  await expect(pg.locator('#sh-leave')).toHaveCount(0);
  await expectApplyCount(pg, 1);
}
