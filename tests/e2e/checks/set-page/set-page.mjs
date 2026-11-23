// A set page: its table and the guard on leaving the Sheets tab with a draft.

import { NARROW, STORE_KEY, shot } from '../../lib/constants.mjs';
import { check, checkNoBadText, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { hasHScroll, waitReady, waitSaved, waitStateSaved } from '../../lib/nav.mjs';
import { expectApplyCount, openSageSet, openSet, seedSheet, reloadAtSheets } from '../../lib/sheets.mjs';

/** Leaving the Sheets tab by a tab button while a set page has a draft asks first, with the set page's own dialog:
 * Keep editing stays on the set page, Discard and leave opens the tab asked for. */
export async function checkTabGuard(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSet(pg, SET_SHEET.name, 'Mine');
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await expectApplyCount(pg, 1);
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-discard');
  await expect(pg.locator('[data-tab=math]')).toHaveAttribute('aria-current', 'page');
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#tab-browse')).toBeVisible();
}

/** A set page: the header (breadcrumb, sheet settings, notes, Auto-fill), a piece picked by hand as a draft (Discard, then
 * Apply, which pins it), a pin, the question before leaving a draft, a real Auto-fill with its Take boxes (Discard, the
 * question before leaving a result, then Apply), and a reload keeping it all; no sideways scroll at 960 px. */
export async function checkSetPage(pg) {
  await pg.setViewportSize(NARROW);
  await waitStateSaved(pg); // the shared setup is saved before the reload below, or the reload would open the defaults
  await pg.evaluate(
    ([key, sheet]) => {
      localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet));
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [sheet.id] }));
    },
    [STORE_KEY, SET_SHEET],
  );
  await reloadAtSheets(pg);
  await waitReady(pg);
  await openSageSet(pg);
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Mine');
  await expect(pg.locator('#sh-set-settings')).toHaveTextParts(['Sage', 100, 123]);
  await expect(pg.locator('#sh-set-notes')).toHaveText('Week 1: crafted body second line');
  // the weapon, hands and feet rows and the meal are open
  await expect(pg.locator('#sh-fill')).toHaveNumber(4);
  check(!(await hasHScroll(pg)), `Set page: scrolls sideways at ${NARROW.width} px`);

  // a piece picked by hand is a draft: Discard drops it, Apply saves it pinned
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  const pickHands = async () => {
    await hands.locator('[data-pick]').click();
    await expect(pg.locator('.pick-menu')).toBeVisible();
    await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
    await expectApplyCount(pg, 1);
  };
  await pickHands();
  await expect(pg.locator('#sh-fill')).toHaveCount(0); // the bar of a draft has Apply and Discard only
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await pickHands();
  // leaving with a draft asks first; Keep editing stays
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Mine');
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await expect(hands.locator('.pinic')).toHaveAttribute('aria-pressed', 'true');
  const handsName = (await hands.locator('[data-pick]').innerText()).trim();
  await expect(pg.locator('#sh-fill')).toHaveNumber(3);
  // a pin: saved at once
  await pg.locator('#sh-gear tr[data-row="2"] .pinic').click();
  await expect(pg.locator('#sh-fill')).toHaveNumber(4);
  await pg.locator('#sh-gear tr[data-row="2"] .pinic').click();

  // Auto-fill: a real search; the result waits with Take boxes; Discard keeps the set
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-discard')).toBeVisible();
  check((await pg.locator('#sh-gear .takebox').count()) >= 2, 'Set page: the Auto-fill result has no Take boxes');
  check(await hands.locator('[data-pick]').isDisabled(), 'Set page: a piece can be changed while an Auto-fill result waits');
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-toast')).toBeVisible();
  // Auto-fill again; leaving asks first (Keep reviewing); one Take box off, then Apply
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-apply')).toBeVisible();
  await pg.click('#sh-set .setcrumb a');
  await expect(pg.locator('#sh-leave-keep')).toBeVisible();
  await expect(pg.locator('#sh-leave-apply')).toHaveCount(0); // the guard of a result: nothing to apply from it
  await pg.click('#sh-leave-keep');
  const applyAll = (await pg.locator('#sh-apply').innerText()).trim();
  await pg.locator('#sh-gear .takebox input').first().uncheck();
  check((await pg.locator('#sh-apply').innerText()).trim() !== applyAll, 'Set page: a Take box off does not change Apply');
  check(!(await hasHScroll(pg)), `Set page: an Auto-fill result scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('set-page-fill.png'), fullPage: true });
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  const weapon = (await pg.locator('#sh-gear tr[data-row="0"] [data-pick]').innerText()).trim();

  // a reload keeps the set as applied
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await reloadAtSheets(pg);
  await waitReady(pg);
  await openSageSet(pg);
  await expect(hands.locator('[data-pick]')).toHaveText(handsName);
  await expect(pg.locator('#sh-gear tr[data-row="0"] [data-pick]')).toHaveText(weapon);
  await checkNoBadText(pg, 'the set page');
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

// ---------- first paint ----------

/* Run in the page before its own script (addInitScript): at every animation frame from the first, until the page has
   settled, what is about to be painted: whether the page (.wrap) shows at all, the Job and sync panel and the job it
   names, and which tab panels. Read back from window.__firstPaint. */
