/* The page's links are real links: each points at its screen (so Open in new tab and Copy link give it), a plain click moves
   inside the page, and a click the browser handles itself (Ctrl, Cmd, Shift, Alt) leaves the page as it was. */
import { check, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { showMath } from '../../lib/nav.mjs';
import { seedSheet } from '../../lib/sheets.mjs';
import { SHARED_SETUP } from '../../lib/setup.mjs';

/* How long to wait for a page the browser may open for a modified click (it opens none in some builds). */
const NEW_PAGE_WAIT_MS = 400;

/* The page's address and its open tab and sub-tab, as one text, to compare before and after a click. */
const placeOf = pg =>
  pg.evaluate(() => {
    const open = document.querySelector('[data-tab][aria-current="page"]')?.dataset.tab;
    const sub = document.querySelector('[data-sub][aria-current="page"]')?.dataset.sub;
    return `${location.hash} | tab ${open} | sub ${sub}`;
  });

/* Clicks `selector` with `modifier` held (Control or Shift) and checks that this page stays as it was. A page or window the
   browser opens for it (the new page is the browser's) is closed. */
async function checkModifiedClickStays(pg, selector, what, modifier) {
  const before = await placeOf(pg);
  const opened = pg
    .context()
    .waitForEvent('page', { timeout: NEW_PAGE_WAIT_MS })
    .then(page => page.close())
    .catch(() => {});
  await pg.locator(selector).click({ modifiers: [modifier] });
  await opened;
  check((await placeOf(pg)) === before, `a ${modifier}+click on ${what} changed this page (${before} became ${await placeOf(pg)})`);
}

/* Checks that the link `selector` points at the address `href` (a hash), the thing Open in new tab and Copy link use. */
async function checkHref(pg, selector, href, what) {
  const got = await pg.locator(selector).first().getAttribute('href');
  check(got === href, `${what} points at ${got}, not ${href}`);
}

/** Each link of the page points at its screen; a Ctrl+click or Shift+click on a tab, a sub-tab, a sheet's name, a set's name and a
 * breadcrumb leaves this page as it was; a plain click on each moves to its screen. */
export async function checkLinkClicks(pg) {
  await seedSheet(pg, SET_SHEET);
  const sheetHref = `#/sheets/${SET_SHEET.id}`;
  const setHref = `${sheetHref}/sets/${SET_SHEET.sets[0].id}`;

  // the tab bar and a sheet's name in the list
  await checkHref(pg, '[data-tab=sheets]', '#/sheets', 'the Sheets tab');
  await checkHref(pg, '[data-tab=browse]', '#/gear', 'the Gear browser tab');
  await checkHref(pg, '[data-tab=math]', '#/math/piece', 'the How the math works tab');
  await checkHref(pg, 'a.sname', sheetHref, "a sheet's name");
  await checkModifiedClickStays(pg, '[data-tab=browse]', 'the Gear browser tab', 'Control');
  await checkModifiedClickStays(pg, 'a.sname', "a sheet's name", 'Control');
  await checkModifiedClickStays(pg, 'a.sname', "a sheet's name", 'Shift');
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#tab-browse')).toBeVisible();
  await expect(pg.locator('[data-tab=browse]')).toHaveAttribute('aria-current', 'page');
  await pg.click('[data-tab=sheets]');
  await pg.locator('a.sname').click();
  await pg.waitForFunction(() => /^#\/sheets\/[^/]+$/.test(location.hash));

  // a sheet's page: its breadcrumb and a set's name
  await checkHref(pg, '#sh-sheet .setcrumb a', '#/sheets', 'the Sheets breadcrumb');
  await checkHref(pg, '#sh-sets a.sname', setHref, "a set's name");
  await checkModifiedClickStays(pg, '#sh-sheet .setcrumb a', 'the Sheets breadcrumb', 'Control');
  await checkModifiedClickStays(pg, '#sh-sheet .setcrumb a', 'the Sheets breadcrumb', 'Shift');
  await checkModifiedClickStays(pg, '#sh-sets a.sname', "a set's name", 'Control');
  await checkModifiedClickStays(pg, '#sh-sets a.sname', "a set's name", 'Shift');
  await pg.locator('#sh-sets a.sname').click();
  await expect(pg.locator('#sh-gear')).toBeVisible();

  // a set's page: both breadcrumb links
  await checkHref(pg, '.setpage .setcrumb a:nth-of-type(1)', '#/sheets', 'the Sheets breadcrumb of a set');
  await checkHref(pg, '.setpage .setcrumb a:nth-of-type(2)', sheetHref, "the sheet's breadcrumb of a set");
  for (const modifier of ['Control', 'Shift']) {
    await checkModifiedClickStays(pg, '.setpage .setcrumb a:nth-of-type(1)', 'the Sheets breadcrumb of a set', modifier);
    await checkModifiedClickStays(pg, '.setpage .setcrumb a:nth-of-type(2)', "the sheet's breadcrumb of a set", modifier);
  }
  await pg.locator('.setpage .setcrumb a:nth-of-type(2)').click();
  await pg.waitForFunction(() => /^#\/sheets\/[^/]+$/.test(location.hash));

  // the math sub-tabs
  await showMath(pg, 'piece');
  // opening the tab copies the Gear browser's Job and sync settings in, and the address names them a moment later (the router's
  // write cooldown): the page is settled once the address carries them, and only then is it compared before and after a click
  await pg.waitForFunction(
    ([cap, level]) => location.hash.includes(`il=${cap}`) && location.hash.includes(`level=${level}`),
    [SHARED_SETUP.cap, SHARED_SETUP.level],
  );
  await checkHref(pg, '[data-sub=piece]', '#/math/piece', 'the Stat Allocation sub-tab');
  await checkHref(pg, '[data-sub=gcd]', '#/math/gcd', 'the GCD Scaling sub-tab');
  await checkHref(pg, '[data-sub=tiers]', '#/math/tiers', 'the Substat tiers sub-tab');
  await checkModifiedClickStays(pg, '[data-sub=gcd]', 'the GCD Scaling sub-tab', 'Control');
  await checkModifiedClickStays(pg, '[data-sub=gcd]', 'the GCD Scaling sub-tab', 'Shift');
  await pg.click('[data-sub=gcd]');
  await expect(pg.locator('[data-sub=gcd]')).toHaveAttribute('aria-current', 'page');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
}

/** In forced colors (high contrast) the open tab and the open sub-tab keep an underline that differs from the other tabs'. */
export async function checkForcedColorsCurrentTab(pg) {
  await pg.emulateMedia({ forcedColors: 'active' });
  await showMath(pg, 'gcd');
  const underline = selector => pg.locator(selector).evaluate(link => getComputedStyle(link).borderBottomColor);
  for (const [open, other, what] of [
    ['[data-tab=math]', '[data-tab=sheets]', 'tab'],
    ['[data-sub=gcd]', '[data-sub=piece]', 'sub-tab'],
  ]) {
    const [openColor, otherColor] = [await underline(open), await underline(other)];
    check(openColor !== otherColor, `in forced colors the open ${what} has the underline of the others (${openColor})`);
  }
  await pg.emulateMedia({ forcedColors: 'none' });
}
