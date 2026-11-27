// Corner radii of the Sheets surfaces (docs/engineering/ui.md, "Corner radii"): the three surfaces no screenshot baseline shows.
//
// The radii of the manager, the sheet page, the set page and its menus, the dialogs and the Auto-fill settings are the baselines'
// now (tests/visual, dark, 1440 and 960 px: 02-sheets-manager, 03-sheet-page, 04-set-page, 06-set-food-menu, 07-set-pick-menu,
// 12-browse-exp-menu, 27-sheets-new-dialog, 29-sheets-delete-question, 31-set-settings-popover, 33-set-materia-menu). What is left
// here is what no view draws: the breadcrumb menu (the baselines draw none open), the scrollbar thumbs (a full-page shot draws no
// scrollbar) and the stuck column-name row (the shots draw sticky parts in place, so its arc is never stuck).

import { PAGE } from '../../lib/constants.ts';
import { check, expect, sleep } from '../../lib/expect.ts';
import { FILL_SHEET, SET_SHEET } from '../../lib/fixtures.ts';
import { newPage, waitReady } from '../../lib/nav.ts';
import { seedSheets } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

const FOUR = '4px 4px 4px 4px'; // the one radius: fields, buttons, panels, tables, menus, dialogs

/* surface, selector (first match), computed corners (top-left, top-right, bottom-right, bottom-left). The values are
   B17's (docs/scratchpad/sheet-flow/proto-b17-settings), measured in a browser; docs/engineering/ui.md lists them. */

const RADII = {
  sheetMenu: [
    ['Breadcrumb menu box', '#sh-sheet-menu', FOUR],
    ['Breadcrumb menu row', '#sh-sheet-menu .setitem', FOUR],
  ],
};

/** The four computed corner radii of the first element matching `selector`, as "tl tr br bl". */
const radiiAt = (pg: Page, selector: string) =>
  pg.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) {
      return 'not found';
    }
    const cs = getComputedStyle(el);
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' ');
  }, selector);

/** Check every row of RADII[screen] on the open screen. */
async function checkRadiiOf(pg: Page, screen) {
  for (const [surface, selector, want] of RADII[screen]) {
    const got = await radiiAt(pg, selector);
    check(got === want, `radius: ${surface} (${selector}) is ${got}, not ${want}`);
  }
}

/** Colour of the device pixels at `points` ([x, y] in device pixels of `png`), read through a canvas on `reader`. */
async function pixelsOf(reader, png, points) {
  return await reader.evaluate(
    async ([base64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
    },
    [png.toString('base64'), points],
  );
}

/** The rounded corners of the set table, at the owner's real scale (2x device pixels, a 1920 x 950 window, dark): the
 * stuck column-name row has its own rounded top corners (cell borders, not collapsed) and a page-coloured wedge in each
 * corner, so the rows scrolling under it never show their square side borders through the curve; the table's bottom
 * corners are rounded; every surface has the documented radius. Each assertion fails when its CSS is taken out (verified
 * on a broken copy of the page). */
export async function checkRadii(pg: Page) {
  const ctx = await pg
    .context()
    .browser()
    .newContext({ viewport: { width: 1920, height: 950 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await newPage(ctx);
  const reader = await ctx.newPage();
  try {
    await page.goto(PAGE);
    await waitReady(page);
    await seedSheets(page, [SET_SHEET, { ...FILL_SHEET, id: 's_b', name: 'Second sheet' }]);
    await page.click('[data-tab=sheets]');
    await expect(page.locator('#sh-list')).toBeVisible();
    await page.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
    await expect(page.locator('#sh-sheet')).toBeVisible();
    await page.click('#sh-sheet-switch');
    await expect(page.locator('#sh-sheet-menu')).toBeVisible();
    await checkRadiiOf(page, 'sheetMenu');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
    await expect(page.locator('#sh-gear')).toBeVisible();
    // the scrollbar thumbs
    const thumb = await page.evaluate(() => {
      // every style rule, also those inside a cascade layer block (the page's rules are all in one)
      const styleRules = rules =>
        [...rules].flatMap(rule => {
          if (rule.selectorText !== undefined) {
            return [rule];
          }
          return rule.cssRules ? styleRules(rule.cssRules) : [];
        });
      return [...document.styleSheets]
        .flatMap(sheet => {
          try {
            return styleRules(sheet.cssRules); // the Google Fonts sheet is cross-origin: no rules to read
          } catch {
            return [];
          }
        })
        .filter(r => r.selectorText?.endsWith('::-webkit-scrollbar-thumb'))
        .map(r => r.style.borderRadius)
        .filter(Boolean);
    });
    check(thumb.length > 0 && thumb.every(r => r === '4px'), `radius: the scrollbar thumb is ${thumb.join(', ')}, not 4px`);

    // the stuck column-name row, at the bottom of the page (the window is shorter than the page, so it sticks)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(200);
    const head = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#sh-gear thead th')];
      const box = el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      };
      return {
        first: box(cells[0]),
        last: box(cells.at(-1)),
        // stuck: scrolled, and the cell's top edge is exactly the page header's bottom edge (not a pixel under it)
        stuckGap: cells[0].getBoundingClientRect().top - document.querySelector('#sh-set .shead').getBoundingClientRect().bottom,
        scrolled: scrollY > 0,
        page: getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(Number),
      };
    });
    check(
      head.scrolled && Math.abs(head.stuckGap) < 0.05,
      `radius: the gear table's column-name row is not stuck exactly under the page header at the page bottom (gap ${head.stuckGap} px)`,
    );
    // the pixels outside the arc are the page colour, not a row border showing through
    for (const [corner, x0, y0, flip] of [
      ['top-left', head.first.left, head.first.top, false],
      ['top-right', head.last.right - 4, head.first.top, true],
    ]) {
      const png = await page.screenshot({ clip: { x: x0, y: y0, width: 4, height: 4 } }); // 8 x 8 device pixels
      const points = [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const cx = (i + 0.5) / 2; // the pixel centre in css px, from the clip's left edge
          const dx = flip ? cx : 4 - cx; // its distance from the arc's centre: 4 css px in from the edge, 4 down
          const dy = 4 - (j + 0.5) / 2;
          if (Math.hypot(dx, dy) > 4.5) {
            points.push([i, j]);
          }
        }
      }
      const colours = await pixelsOf(reader, png, points);
      const off = colours.filter(c => c.some((v, k) => Math.abs(v - head.page[k]) > 3));
      check(
        points.length >= 6 && off.length === 0,
        `radius: stuck header ${corner} corner: ${off.length} of ${points.length} pixels outside the arc are not the page colour (${JSON.stringify(off[0])}, want ${JSON.stringify(head.page)})`,
      );
    }
  } finally {
    await ctx.close();
  }
}
