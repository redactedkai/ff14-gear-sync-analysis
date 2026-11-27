// The five viewports, and the rules that switch at a width.

import { openViewSet, viewSheets } from './screens.ts';
import { shot } from '../../lib/constants.ts';
import { check, expect, placedByZag, poll, stepRecord } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { hasHScroll, runFill, showMath } from '../../lib/nav.ts';
import { expectPieceEmpty, openSageSet, seedSheet, seedSheets, sheetNames } from '../../lib/sheets.ts';

/** Rules that switch at a width, each with a window one pixel either side (testing.md section 3.1): the set page's column
 * widths (72 px for the stat columns up to 1099 px, 80 from 1100), and Piece stats' two panels (one column up to 1299 px,
 * two from 1300). No sideways page scroll at any of the four widths. */
export async function checkBreakpoints(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const statColumn = () => pg.locator('#sh-gear thead th[data-col="crit"]').evaluate(th => Math.round(th.getBoundingClientRect().width));
  for (const [width, want] of [
    [1099, 72],
    [1100, 80],
  ]) {
    await pg.setViewportSize({ width, height: 900 });
    await poll(`a stat column ${want} px wide at ${width} px`, async () => {
      const got = await statColumn();
      return { ok: got === want, got };
    });
    check(!(await hasHScroll(pg)), `the set page scrolls sideways at ${width} px`);
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await showMath(pg, 'piece');
  const columns = () => pg.locator('.twopanel').evaluate(panel => getComputedStyle(panel).gridTemplateColumns.split(' ').length);
  for (const [width, want] of [
    [1299, 1],
    [1301, 2],
  ]) {
    await pg.setViewportSize({ width, height: 900 });
    await poll(`Piece stats in ${want} column(s) at ${width} px`, async () => {
      const got = await columns();
      return { ok: got === want, got };
    });
    check(!(await hasHScroll(pg)), `Piece stats scrolls sideways at ${width} px`);
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** The test windows of docs/engineering/testing.md section 3.1, by CSS screen: [name, width, height]. */
const VIEWPORTS = [
  ['960 floor', 960, 700],
  ['1280 x 720', 1265, 565],
  ['1536 x 864', 1521, 709],
  ['1920 x 1080', 1905, 925],
  ['2560 x 1440', 2545, 1285],
];

/** The container's maximum width in px (src/styles/base.css `.wrap`; docs/roadmap.md A14 settles it at 1280 for every tab) and
 * the page's gutter in px on each side: the body's 16 px side padding (src/styles/base.css resets the body margin). */
const WRAP_MAX = 1280;

const PAGE_SIDE_GUTTER = 16;

/** In the page: the window's and the container's widths, for the container and sideways-scroll checks. */
const probeWidths = () => {
  const root = document.documentElement;
  const wrap = document.querySelector('.wrap').getBoundingClientRect();
  return { inner: innerWidth, client: root.clientWidth, scroll: root.scrollWidth, left: wrap.left, right: wrap.right, width: wrap.width };
};

/** In the page: the boxes of a set page's sticky header, the column names row and the first body row, the window's height
 * and the scroll position. */
const probeSetBoxes = () => {
  const box = el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const names = document.querySelector('#sh-gear thead th');
  const centerHit = (el, selector) => {
    const r = el.getBoundingClientRect();
    return Boolean(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(selector));
  };
  const head = document.querySelector('#sh-set .shead');
  return {
    head: box(head),
    names: box(names),
    firstRow: box(document.querySelector('#sh-gear tbody tr')),
    headOnTop: centerHit(head, '.shead'),
    namesOnTop: centerHit(names, 'th'),
    scrollY: Math.round(scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
  };
};

/** In the page: the box of the open menu `selector` and the sticky header's bottom edge. */
const probeMenu = selector => {
  const r = document.querySelector(selector).getBoundingClientRect();
  return {
    top: r.top,
    bottom: r.bottom,
    left: r.left,
    right: r.right,
    headBottom: document.querySelector('#sh-set .shead').getBoundingClientRect().bottom,
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
  };
};

/** Assert the width rules of one screen at the window `vp` ([name, width, height]): no sideways scroll (the page's
 * scrollWidth within the window's innerWidth), and the container as wide as the documented cap allows, min(1280, the
 * page's width less its side padding), centered. */
async function checkWidths(pg, vp, screenName) {
  const w = await pg.evaluate(probeWidths);
  const where = `${vp[0]} (${vp[1]} x ${vp[2]}), ${screenName}`;
  check(w.scroll <= w.inner, `viewport ${where}: scrollWidth ${w.scroll} is more than innerWidth ${w.inner}`);
  const wantWidth = Math.min(WRAP_MAX, w.client - 2 * PAGE_SIDE_GUTTER);
  check(
    Math.abs(w.width - wantWidth) <= 1,
    `viewport ${where}: the container is ${w.width} px wide, not ${wantWidth} (cap ${WRAP_MAX}, page ${w.client})`,
  );
  check(
    Math.abs(w.left - (w.client - w.right)) <= 1,
    `viewport ${where}: the container is not centered (left ${w.left}, right gap ${w.client - w.right})`,
  );
}

/** Menus that end below the window's bottom edge at a test window today, with the row scrolled as far up as the page allows (reported to the owner, not yet changed), by
 * "<width>x<height>|<menu>": printed as "KNOWN FAILURE" lines; a menu that now fits fails the run until it is removed. */
const KNOWN_MENU_OVERFLOW = new Map();

/** Assert an open menu `selector` fits the window and stays below the sticky header (the piece menu check of checkPickMenu, here at
 * every window). */
async function checkMenuFits(pg, vp, what, selector, seen) {
  const m = await pg.evaluate(probeMenu, selector);
  const where = `${vp[0]} (${vp[1]} x ${vp[2]}), ${what}`;
  check(
    m.left >= 0 && m.right <= m.clientWidth,
    `viewport ${where}: the menu runs outside the window sideways (${Math.round(m.left)} to ${Math.round(m.right)} of ${m.clientWidth})`,
  );
  check(
    m.top >= m.headBottom - 1,
    `viewport ${where}: the menu starts at ${Math.round(m.top)}, under the sticky header that ends at ${Math.round(m.headBottom)}`,
  );
  const below = m.bottom - m.innerHeight;
  const known = KNOWN_MENU_OVERFLOW.get(`${vp[1]}x${vp[2]}|${what}`);
  if (known && below > 1) {
    seen.add(`${vp[1]}x${vp[2]}|${what}`);
    stepRecord
      .getStore()
      .known.set(
        `menu ${where}`,
        `KNOWN FAILURE (layout, ${where}): ${known}; ends at ${Math.round(m.bottom)}, the window's ${m.innerHeight}`,
      );
  } else {
    check(below <= 1, `viewport ${where}: the menu ends at ${Math.round(m.bottom)}, below the window's ${m.innerHeight}`);
  }
}

/** Scroll a set page so the row `selector` sits just under the sticky header and the column names: the most room a menu opened
 * from the row can have below it, the same at every run (a click would scroll the row to wherever it first shows). */
async function alignRowUnderHeader(pg, selector) {
  // the header's height and the column names' place settle after a window resize, so scroll again until the scroll position
  // holds still (a row near the page's end cannot reach the top: the page stops at its end, which is the most room it has)
  await pg.evaluate(async rowSelector => {
    const frames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    let stable = 0;
    for (let tries = 0; tries < 40 && stable < 3; tries++) {
      await frames();
      const before = scrollY;
      const row = document.querySelector(rowSelector).getBoundingClientRect();
      const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
      const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
      scrollBy(0, row.top - (head.bottom + names.height + 4));
      await frames();
      stable = Math.abs(scrollY - before) < 0.5 ? stable + 1 : 0;
    }
  }, selector);
}

/** Press Tab from the set page's breadcrumb until the focus is on the element `id` (at most `limit` presses), and say whether it
 * got there with the element in view (the point at its center belongs to it, not to the sticky header over it). */
async function tabTo(pg, id, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await pg.keyboard.press('Tab');
    const at = await pg.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id: el.id, shown: Boolean(hit) && el.contains(hit) };
    });
    if (at.id === id) {
      return at.shown ? 'reached' : 'hidden under another element';
    }
  }
  return `not reached in ${limit} presses`;
}

/** The Sheets tab's screens at the five test windows of testing.md section 3.1 (a screenshot of each to the output folder):
 * at each window the sheet manager (three sheets), a sheet's page (five sets) and a set page (every row filled by an Auto-fill, applied),
 * with its piece menu and materia menu open. Geometry only, no pixel baselines: no sideways scroll; the container as wide as the
 * 1280 px cap and the page's width allow, centered; each menu inside the window and below the sticky header; the column names
 * below the sticky header at the top and, scrolled to the bottom, the header and the column names still on top of the rows; and
 * the Tab key reaching Auto-fill, then (a piece picked by hand) Apply and Discard, each in view. */
export async function checkViewports(pg) {
  const seen = new Set(); // the known menu overflows that happened (KNOWN_MENU_OVERFLOW)
  await seedSheets(pg, viewSheets());
  await pg.setViewportSize({ width: VIEWPORTS[0][1], height: VIEWPORTS[0][2] });
  await pg.click('[data-tab=sheets]');
  // fill the Sage set once: every row has a piece, the pinned earring among them
  await openViewSet(pg, 'Sage with an earring', 'Mine');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expectPieceEmpty(pg, 6, false); // the fill left a piece on the row
  let scrolledAt = 0;

  for (const vp of VIEWPORTS) {
    const [label, width, height] = vp;
    const slug = `${width}x${height}`;
    await pg.setViewportSize({ width, height });
    const toTop = () => pg.evaluate(() => scrollTo(0, 0));

    // the sheet manager, three sheets
    await pg.click('#sh-set .setcrumb a');
    await expect(pg.locator('#sh-list')).toBeVisible();
    check((await sheetNames(pg, '#sh-list')).length === 3, `viewport ${label}: the manager lists ${await sheetNames(pg, '#sh-list')}`);
    await checkWidths(pg, vp, 'the sheet manager');
    await pg.screenshot({ path: shot(`viewport-${slug}-manager.png`) });

    // a sheet's page, five sets
    await pg.locator('#sh-list a.sname', { hasText: 'Five sets' }).click();
    await expect(pg.locator('#sh-sets')).toBeVisible();
    check((await sheetNames(pg, '#sh-sets')).length === 5, `viewport ${label}: the sheet lists ${await sheetNames(pg, '#sh-sets')}`);
    await checkWidths(pg, vp, "a sheet's page");
    await pg.screenshot({ path: shot(`viewport-${slug}-sheet.png`), fullPage: true });

    // the set page: top of the page
    await pg.click('#sh-sheet .setcrumb a');
    await openViewSet(pg, 'Sage with an earring', 'Mine');
    await toTop();
    await checkWidths(pg, vp, 'the set page');
    const top = await pg.evaluate(probeSetBoxes);
    check(
      top.names.top >= top.head.bottom - 1,
      `viewport ${label}: the column names start at ${Math.round(top.names.top)}, inside the header that ends at ${Math.round(top.head.bottom)}`,
    );
    check(
      top.firstRow.top >= top.names.bottom - 1,
      `viewport ${label}: the first row starts at ${Math.round(top.firstRow.top)}, inside the column names that end at ${Math.round(top.names.bottom)}`,
    );
    await pg.screenshot({ path: shot(`viewport-${slug}-set-page.png`) });

    // the materia menu of the earring's overmeld slot, then the piece menu of the feet row
    await alignRowUnderHeader(pg, '#sh-gear tr[data-row="7"]');
    await pg.click('[data-chip="7:2"]');
    await expect(pg.locator('.matpop')).toBeVisible();
    await placedByZag(pg, '.matpop');
    await checkMenuFits(pg, vp, 'the materia menu', '.matpop', seen);
    await checkWidths(pg, vp, 'the materia menu');
    await pg.screenshot({ path: shot(`viewport-${slug}-stone-menu.png`) });
    await pg.keyboard.press('Escape');
    await expect(pg.locator('.matpop')).toBeHidden();
    await alignRowUnderHeader(pg, '#sh-gear tr[data-row="6"]');
    await pg.locator('#sh-gear tr[data-row="6"] [data-pick]').click();
    await expect(pg.locator('.pick-menu')).toBeVisible();
    await placedByZag(pg, '.pick-menu');
    await checkMenuFits(pg, vp, 'the piece menu', '.pick-menu', seen);
    await checkWidths(pg, vp, 'the piece menu');
    await pg.screenshot({ path: shot(`viewport-${slug}-piece-menu.png`) });
    await pg.keyboard.press('Escape');
    await expect(pg.locator('.pick-menu')).toBeHidden();

    // scrolled to the bottom: the header and the column names stay on top and in place
    await pg.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await pg.evaluate(probeSetBoxes);
    if (bottom.scrollY > 0) {
      scrolledAt++;
      check(
        Math.abs(bottom.head.top) <= 1,
        `viewport ${label}: scrolled to the bottom the header is at ${Math.round(bottom.head.top)}, not 0`,
      );
      check(bottom.headOnTop, `viewport ${label}: scrolled to the bottom something covers the sticky header`);
      check(bottom.namesOnTop, `viewport ${label}: scrolled to the bottom something covers the column names`);
      check(
        Math.abs(bottom.names.top - bottom.head.bottom) <= 2,
        `viewport ${label}: scrolled to the bottom the column names are at ${Math.round(bottom.names.top)}, not below the header (${Math.round(bottom.head.bottom)})`,
      );
    } else {
      check(bottom.maxScroll <= 0, `viewport ${label}: the page could not scroll to the bottom`);
    }
    await pg.screenshot({ path: shot(`viewport-${slug}-set-page-bottom.png`) });

    // the Tab key: Auto-fill, then a piece picked by hand makes a draft with Apply and Discard
    await toTop();
    await pg.locator('#sh-set .setcrumb a').first().focus();
    const fill = await tabTo(pg, 'sh-fill');
    check(fill === 'reached', `viewport ${label}: Tab to Auto-fill: ${fill}`);
    await pg.locator('#sh-gear tr[data-row="6"] [data-pick]').click();
    await pg.locator('.pick-menu .same-item[data-game-id]:not(.on):not([disabled])').first().click();
    await expect(pg.locator('#sh-apply')).toBeVisible();
    await toTop();
    await pg.locator('#sh-set .setcrumb a').first().focus();
    const apply = await tabTo(pg, 'sh-apply');
    check(apply === 'reached', `viewport ${label}: Tab to Apply: ${apply}`);
    const discard = await tabTo(pg, 'sh-discard', 3);
    check(discard === 'reached', `viewport ${label}: Tab on to Discard: ${discard}`);
    await pg.click('#sh-discard');
    await expect(pg.locator('#sh-apply')).toHaveCount(0);
  }
  for (const wanted of KNOWN_MENU_OVERFLOW.keys()) {
    check(seen.has(wanted), `viewports: the known overflow "${wanted}" no longer happens: remove it from KNOWN_MENU_OVERFLOW`);
  }
  check(scrolledAt >= 2, `viewports: the set page scrolled at only ${scrolledAt} windows, so the sticky header was not exercised`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
