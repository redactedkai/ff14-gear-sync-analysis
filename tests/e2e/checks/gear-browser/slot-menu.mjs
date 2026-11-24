// Gear browser: the Slot menu on the title line, one round bar with the name search.

import { check, expect } from '../../lib/expect.mjs';
import { chooseSlot, fillBrowser, focusedId, hasHScroll, showTab } from '../../lib/nav.mjs';

/** The widths of the Slot button and of its open menu, the rows' fit, and where the menu is, in px. */
const menuFit = pg =>
  pg.evaluate(() => {
    const button = document.querySelector('#b-slot').getBoundingClientRect();
    const menu = document.querySelector('#b-slots').getBoundingClientRect();
    const card = document.querySelector('#tab-browse .panel').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#b-slots .multi-opt')];
    return {
      buttonWidth: button.width,
      menuWidth: menu.width,
      menuLeft: menu.left - button.left,
      menuRight: menu.right,
      cardRight: card.right,
      rowsClipped: rows.some(row => row.scrollWidth > row.clientWidth),
      searchWidth: document.querySelector('#b-q').getBoundingClientRect().width,
    };
  });

/** The Slot menu: one bar with the search (one border, on the bar); the open menu is exactly as wide as the Slot button at every
 * window width from 960 px up, also when every number is 88,888 (nothing clipped, nothing moves), and stays inside the card and
 * the window; a choice closes the menu, names the slot on the button and goes back to page 1's list; Escape and a click
 * outside close it; a slot with no match is greyed out and cannot be picked. Leaves the browser's filters at their defaults. */
export async function checkSlotMenu(pg) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');
  await expect(pg.locator('#b-slot')).toHaveText('Any slot');

  // one bar: the border is the bar's, not the search box's
  const borders = await pg.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('#tab-browse .searchbar')).borderTopWidth,
    search: getComputedStyle(document.querySelector('#b-q')).borderTopWidth,
    button: getComputedStyle(document.querySelector('#b-slot')).borderTopWidth,
  }));
  check(
    borders.bar === '1px' && borders.search === '0px' && borders.button === '0px',
    `the search bar's borders: ${JSON.stringify(borders)}, expected 1px on the bar and none on the Slot button and the search box`,
  );

  // the menu is as wide as its button at every width, with real numbers and with the widest ones
  const normal = pg.viewportSize();
  for (const [width, height] of [
    [960, 900],
    [1280, 900],
    [1920, 1080],
  ]) {
    await pg.setViewportSize({ width, height });
    await pg.click('#b-slot');
    await expect(pg.locator('#b-slots')).toBeVisible();
    const real = await menuFit(pg);
    check(
      Math.abs(real.menuWidth - real.buttonWidth) < 0.5 && Math.abs(real.menuLeft) < 1 && !real.rowsClipped,
      `at ${width} px the Slot menu and its button differ: ${JSON.stringify(real)}`,
    );
    // every number 88,888 (put back after): the rows still fit and neither width changes
    const was = await pg.evaluate(() =>
      [...document.querySelectorAll('#b-slots .n')].map(number => {
        const text = number.textContent;
        number.textContent = '88,888';
        return text;
      }),
    );
    const widest = await menuFit(pg);
    await pg.evaluate(texts => {
      document.querySelectorAll('#b-slots .n').forEach((number, i) => {
        number.textContent = texts[i];
      });
    }, was);
    check(
      Math.abs(widest.menuWidth - real.menuWidth) < 0.5 &&
        Math.abs(widest.buttonWidth - real.buttonWidth) < 0.5 &&
        !widest.rowsClipped &&
        widest.menuRight <= Math.min(widest.cardRight, width) + 1,
      `at ${width} px the Slot menu with every number 88,888 is ${JSON.stringify(widest)}, with the real ones ${JSON.stringify(real)}`,
    );
    check(!(await hasHScroll(pg)), `the Gear browser scrolls sideways at ${width} px with the Slot menu open`);
    check(real.searchWidth >= 300, `the name search is only ${Math.round(real.searchWidth)} px wide at ${width} px`);

    // the menu stays above the table under the pointer: moving over a row lights it, which draws the menu again, and every row, the
    // ones over the table's sticky header included, is still the top element at its centre
    await pg.hover('#b-slots [data-slot="head"]');
    await expect(pg.locator('#b-slots [data-slot="head"]')).toHaveAttribute('data-highlighted', ''); // the menu has been drawn again
    const covered = await pg.evaluate(() => {
      const header = document.querySelector('#gear-table thead').getBoundingClientRect();
      const rows = [...document.querySelectorAll('#b-slots .multi-opt')].map(row => row.getBoundingClientRect());
      return {
        overHeader: rows.filter(
          row => row.top < header.bottom && row.bottom > header.top && row.left < header.right && row.right > header.left,
        ).length,
        behind: rows.filter(row => !document.elementFromPoint(row.left + row.width / 2, row.top + row.height / 2)?.closest('#b-slots'))
          .length,
      };
    });
    check(
      covered.overHeader > 0,
      `at ${width} px no row of the open Slot menu lies over the table's header, so the stacking check proves nothing`,
    );
    check(
      covered.behind === 0,
      `at ${width} px ${covered.behind} rows of the open Slot menu are behind the table after the pointer moved over a row`,
    );

    // Escape closes it and gives the focus back to the button
    await pg.keyboard.press('Escape');
    await expect(pg.locator('#b-slots')).toBeHidden();
    check((await focusedId(pg)) === 'b-slot', 'Escape did not put the focus back on the Slot button');
  }
  await pg.setViewportSize(normal);

  // a choice: the button names the slot, the menu closes with the focus on the button, the choice is marked
  await chooseSlot(pg, 'ring');
  await expect(pg.locator('#b-slot')).toHaveText('Ring');
  await expect(pg.locator('#b-slots')).toBeHidden();
  check((await focusedId(pg)) === 'b-slot', 'a choice did not put the focus back on the Slot button');
  await expect(pg.locator('#b-slots [data-slot="ring"]')).toHaveAttribute('aria-checked', 'true');
  await expect(pg.locator('#b-slots [data-slot="any"]')).toHaveAttribute('aria-checked', 'false');

  // a click outside closes it
  await pg.click('#b-slot');
  await expect(pg.locator('#b-slots')).toBeVisible();
  await pg.click('#tab-browse h2');
  await expect(pg.locator('#b-slots')).toBeHidden();
  await chooseSlot(pg, 'any');

  // a slot with no match under the filters is greyed out and cannot be picked (item level 795 is only weapons)
  await fillBrowser(pg, 795, 795, '');
  await expect(pg.locator('#b-slots [data-slot="ring"]')).toBeDisabled();
  await expect(pg.locator('#b-slots [data-slot="weapon"]')).toBeEnabled();
  await pg.click('#b-reset');
  await expect(pg.locator('#b-slot')).toHaveText('Any slot');
}
