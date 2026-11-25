// A short window: the "Gear categories" menu (in the Auto-fill settings) scrolls with the wheel and shows its last row.

import { check, expect, placedByZag, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { showTab } from '../../lib/nav.mjs';
import { openSageSet, seedSheet } from '../../lib/sheets.mjs';

// shorter than the Gear categories menu (318 px, one height on every tab) and the room around its button
const SHORT_WINDOW = { width: 960, height: 300 };

/** The rows' furthest bottom edge below the box's own bottom edge, in px (<= 0: every row is inside the box). `rowSel`: the rows inside `boxSel`. */
const rowsBelowBox = (pg, boxSel, rowSel) =>
  pg.evaluate(
    ([box, rows]) => {
      const bottom = document.querySelector(box).getBoundingClientRect().bottom;
      return Math.round(Math.max(...[...document.querySelectorAll(rows)].map(row => row.getBoundingClientRect().bottom)) - bottom);
    },
    [boxSel, rowSel],
  );

/** Wheel over `boxSel` (a scrolling pop-up that must not fit the window): its scrollTop moves off 0 and, wheeled on, its last
 * row (`rowSel`) ends inside the box. The wheel is the owner's way in; the pop-up's own scroll must not re-place it back to the top. */
async function wheelToLastRow(pg, boxSel, rowSel, where) {
  const sizes = () =>
    pg.evaluate(sel => {
      const box = document.querySelector(sel);
      return { scrollTop: Math.round(box.scrollTop), scrollHeight: box.scrollHeight, clientHeight: box.clientHeight };
    }, boxSel);
  const start = await sizes();
  check(
    start.scrollHeight > start.clientHeight + 1,
    `${where}: the window is not short enough, the pop-up does not scroll: ${JSON.stringify(start)}`,
  );
  const area = await pg.locator(boxSel).boundingBox();
  await pg.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await pg.mouse.wheel(0, 120);
  await poll(`${where}: one wheel tick moves the pop-up's scroll off the top`, async () => {
    const got = await sizes();
    return { ok: got.scrollTop > 0, got };
  });
  // wheel on to the end, a tick at a time (more ticks would scroll the page behind, which moves the pop-up with its button)
  for (let tick = 0; tick < 30; tick++) {
    const got = await sizes();
    if (got.scrollTop + got.clientHeight >= got.scrollHeight - 1) {
      break;
    }
    await pg.mouse.wheel(0, 60);
    await poll(`${where}: the wheel tick scrolled the pop-up`, async () => {
      const now = await sizes();
      return { ok: now.scrollTop !== got.scrollTop, got: now.scrollTop };
    });
  }
  await poll(`${where}: the last row ends inside the pop-up after wheeling to the end`, async () => {
    const got = await rowsBelowBox(pg, boxSel, rowSel);
    return { ok: got <= 0, got };
  });
}

/** In a window too short for the whole menu, the Gear categories menu in a set's Auto-fill settings (where it is fixed to the window)
 * can be scrolled with the wheel to its last row. */
export async function checkPopoverScroll(pg) {
  await pg.setViewportSize(SHORT_WINDOW);
  await showTab(pg, 'browse');
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#s-from');
  await expect(pg.locator('#s-from-menu')).toBeVisible();
  await placedByZag(pg, '#s-from-menu');
  await wheelToLastRow(pg, '#s-from-menu', '#s-from-menu .multi-opt', 'Auto-fill settings Gear categories menu');
  await pg.keyboard.press('Escape');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toBeHidden();
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
