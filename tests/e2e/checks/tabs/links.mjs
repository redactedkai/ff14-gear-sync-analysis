/* The page's links are real links: a plain click moves inside the page, and a click the browser handles itself (Ctrl, Cmd,
   Shift, Alt) leaves the page as it was. */
import { check, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { showMath } from '../../lib/nav.mjs';
import { seedSheet } from '../../lib/sheets.mjs';

/* How long to wait for a page the browser may open for a modified click (it opens none in some builds). */
const NEW_PAGE_WAIT_MS = 400;

/* The page's address and its open tab and sub-tab, as one text, to compare before and after a click. */
const placeOf = pg =>
  pg.evaluate(() => {
    const open = document.querySelector('[data-tab][aria-current="page"]')?.dataset.tab;
    const sub = document.querySelector('[data-sub][aria-current="page"]')?.dataset.sub;
    return `${location.hash} | tab ${open} | sub ${sub}`;
  });

/* Clicks `selector` with the Control key held and checks that this page stays as it was. A page the browser opens for it
   (the new page is the browser's) is closed. */
async function checkCtrlClickStays(pg, selector, what) {
  const before = await placeOf(pg);
  const opened = pg
    .context()
    .waitForEvent('page', { timeout: NEW_PAGE_WAIT_MS })
    .then(page => page.close())
    .catch(() => {});
  await pg.locator(selector).click({ modifiers: ['Control'] });
  await opened;
  check((await placeOf(pg)) === before, `a Ctrl+click on ${what} changed this page (${before} became ${await placeOf(pg)})`);
}

/** A Ctrl+click on a tab, a sub-tab and a sheet's name leaves this page as it was; a plain click on each moves to its screen. */
export async function checkLinkClicks(pg) {
  await seedSheet(pg, SET_SHEET);

  // the tab bar and a sheet's name in the list
  await checkCtrlClickStays(pg, '[data-tab=browse]', 'the Gear browser tab');
  await checkCtrlClickStays(pg, 'a.sname', "a sheet's name");
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#tab-browse')).toBeVisible();
  await expect(pg.locator('[data-tab=browse]')).toHaveAttribute('aria-current', 'page');
  await pg.click('[data-tab=sheets]');
  await pg.locator('a.sname').click();
  await pg.waitForFunction(() => /^#\/sheets\/[^/]+$/.test(location.hash));

  // the math sub-tabs
  await showMath(pg, 'piece');
  await checkCtrlClickStays(pg, '[data-sub=gcd]', 'the GCD Scaling sub-tab');
  await pg.click('[data-sub=gcd]');
  await expect(pg.locator('[data-sub=gcd]')).toHaveAttribute('aria-current', 'page');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
}
