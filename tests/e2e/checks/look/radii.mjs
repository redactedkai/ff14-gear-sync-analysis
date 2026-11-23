// Corner radii of the Sheets surfaces (docs/engineering/ui.md, "Corner radii").

import { PAGE } from '../../lib/constants.mjs';
import { check, expect, sleep } from '../../lib/expect.mjs';
import { FILL_SHEET, SET_SHEET } from '../../lib/fixtures.mjs';
import { newPage, waitReady } from '../../lib/nav.mjs';
import { seedSheets } from '../../lib/sheets.mjs';

const FOUR = '4px 4px 4px 4px'; // the one radius: fields, buttons, panels, tables, menus, dialogs

const SQUARE = '0px 0px 0px 0px';
/* surface, selector (first match), computed corners (top-left, top-right, bottom-right, bottom-left). The values are
   B17's (docs/scratchpad/sheet-flow/proto-b17-settings), measured in a browser; docs/engineering/ui.md lists them. */

const RADII = {
  manager: [
    ['Sheets manager: New sheet button', '#sh-new', FOUR],
    ['Sheets manager: table box', '#tab-sheets .tablewrap', FOUR],
    ['Sheets manager: row link button', '#sh-list .linkbtn', FOUR],
  ],
  newSheetDialog: [
    ['Dialog box', '#sh-dialog', FOUR],
    ['Dialog: text field', '#sh-dlg-name', FOUR],
    ['Dialog: number field', '#sh-dlg-level', FOUR],
    ['Dialog: primary button', '#sh-dlg-ok', FOUR],
    ['Dialog: switch track', '#sh-dlg-sync', '12px 12px 12px 12px'],
  ],
  deleteDialog: [
    ['Question box', '#sh-dialog', FOUR],
    ['Question: danger button', '#sh-dlg-ok', FOUR],
  ],
  sheetPage: [
    ['Sheet page: settings panel', 'section.panel[aria-label="Sheet settings"]', FOUR],
    ['Sheet page: number field', '#sh-level', FOUR],
    ['Sheet page: switch track', '#sh-sync', '12px 12px 12px 12px'],
    ['Sheet page: sets table box', '.tablewrap:has(#sh-sets)', FOUR],
    ['Sheet page: breadcrumb caret', '#sh-sheet-switch', FOUR],
  ],
  sheetMenu: [
    ['Breadcrumb menu box', '#sh-sheet-menu', FOUR],
    ['Breadcrumb menu row', '#sh-sheet-menu .setitem', FOUR],
  ],
  setPage: [
    ['Set page: Auto-fill button', '#sh-fill', FOUR],
    ['Set page: Auto-fill settings gear', '#sh-settings', FOUR],
    ['Set page: Copy button', '#sh-set-copy', FOUR],
    ['Set page: stat block', '#sh-figures', FOUR],
    ['Set page: gear table box', '#tab-sheets .tablewrap.settable', FOUR],
    ['Gear table: header first cell', '#sh-gear thead th:first-child', '4px 0px 0px 0px'],
    ['Gear table: header middle cell', '#sh-gear thead th:nth-child(3)', SQUARE],
    ['Gear table: header last cell', '#sh-gear thead th:last-child', '0px 4px 0px 0px'],
    ['Gear table: body (bottom corners)', '#sh-gear tbody', '0px 0px 4px 4px'],
    ['Gear table: last row first cell', '#sh-defense td:first-child', '0px 0px 0px 4px'],
    ['Gear table: last row last cell', '#sh-defense td:last-child', '0px 0px 4px 0px'],
    ['Piece button', '#sh-gear .same-btn', FOUR],
    ['Stone chip', '#sh-gear .mchip', FOUR],
    ['Origin pill', '#sh-gear .pill', '999px 999px 999px 999px'],
  ],
  pieceMenu: [
    ['Piece menu box', '.pick-menu', FOUR],
    ['Piece menu: search box', '.pick-menu input[type="text"]', FOUR],
    ['Piece menu: row', '.pick-menu .same-item', FOUR],
  ],
  foodMenu: [
    ['Food menu box', '#sh-meal-menu', FOUR],
    ['Food menu: search box', '#sh-meal-menu input[type="text"]', FOUR],
    ['Food menu: stat pill button', '#sh-meal-menu .meal-pill', '999px 999px 999px 999px'],
  ],
  stoneMenu: [['Stone menu box', '.matpop', FOUR]],
  fillSettings: [
    ['Auto-fill settings dialog box', '#sh-settings-dialog', FOUR],
    ['Auto-fill settings: select', '#s-target', FOUR],
    ['Auto-fill settings: number field', '#s-lvl', FOUR],
    ['Auto-fill settings: menu button', '#s-exp', FOUR],
    ['Auto-fill settings: segmented control', '#sh-settings-dialog .seg', FOUR],
    ['Auto-fill settings: ? button', '#sh-settings-dialog .shelp', '50% 50% 50% 50%'],
  ],
  fillMenu: [['Auto-fill settings: menu box', '#s-exp-menu', FOUR]],
};

/** The four computed corner radii of the first element matching `selector`, as "tl tr br bl". */
const radiiAt = (pg, selector) =>
  pg.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return 'not found';
    const cs = getComputedStyle(el);
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' ');
  }, selector);

/** Check every row of RADII[screen] on the open screen. */
async function checkRadiiOf(pg, screen) {
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
export async function checkRadii(pg) {
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
    await checkRadiiOf(page, 'manager');
    await page.click('#sh-new');
    await expect(page.locator('#sh-dialog')).toBeVisible();
    await checkRadiiOf(page, 'newSheetDialog');
    await page.click('#sh-dialog .dlgbtns > button:last-child'); // Cancel, the last button of the form (the Delete question's has an id)
    await page.locator('#sh-list tr', { hasText: 'Second sheet' }).locator('[data-action="delete"]').click();
    await expect(page.locator('#sh-dialog')).toBeVisible();
    await checkRadiiOf(page, 'deleteDialog');
    await page.click('#sh-dlg-cancel');

    await page.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
    await expect(page.locator('#sh-sheet')).toBeVisible();
    await checkRadiiOf(page, 'sheetPage');
    await page.click('#sh-sheet-switch');
    await expect(page.locator('#sh-sheet-menu')).toBeVisible();
    await checkRadiiOf(page, 'sheetMenu');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
    await expect(page.locator('#sh-gear')).toBeVisible();
    await checkRadiiOf(page, 'setPage');

    // the menus and dialogs of the set page
    await page.click('#sh-gear tbody tr:nth-child(3) .same-btn');
    await expect(page.locator('.pick-menu')).toBeVisible();
    await page.locator('.pick-menu input[type="text"]').focus();
    await checkRadiiOf(page, 'pieceMenu');
    await page.keyboard.press('Escape');
    await page.click('#sh-meal-btn');
    await expect(page.locator('#sh-meal-menu')).toBeVisible();
    await checkRadiiOf(page, 'foodMenu');
    await page.keyboard.press('Escape');
    await page.locator('#sh-gear .mchip').first().click();
    await expect(page.locator('.matpop')).toBeVisible();
    await checkRadiiOf(page, 'stoneMenu');
    await page.keyboard.press('Escape');
    await page.click('#sh-settings');
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
    await checkRadiiOf(page, 'fillSettings');
    await page.click('#s-exp');
    await expect(page.locator('#s-exp-menu')).toBeVisible();
    await checkRadiiOf(page, 'fillMenu');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sh-settings-dialog')).toHaveCount(0);

    // the scrollbar thumbs
    const thumb = await page.evaluate(() => {
      // every style rule, also those inside a cascade layer block (the page's rules are all in one)
      const styleRules = rules =>
        [...rules].flatMap(rule => {
          if (rule.selectorText !== undefined) return [rule];
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
        .filter(Boolean); // the thumb's color fallback for old browsers (fallbacks.css) sets no radius
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
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const cx = (i + 0.5) / 2; // the pixel centre in css px, from the clip's left edge
          const dx = flip ? cx : 4 - cx; // its distance from the arc's centre: 4 css px in from the edge, 4 down
          const dy = 4 - (j + 0.5) / 2;
          if (Math.hypot(dx, dy) > 4.5) points.push([i, j]);
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
