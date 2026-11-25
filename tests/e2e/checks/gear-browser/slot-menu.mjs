// Gear browser: the Slot menu on the title line, one round bar with the name search.

import { ANY_SLOT_LABEL } from '../../../../src/ui/elements/gear-browser/slot-menu-names.ts';
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
  await expect(pg.locator('#b-slot')).toHaveText(ANY_SLOT_LABEL);

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
  await expect(pg.locator('#b-slot')).toHaveText(ANY_SLOT_LABEL);
}

/** The Slot menu with the page's data: its counts have thousands separators (the view's text, not the raw number); every slot it
 * offers, off-hand and weapon included, sets the browser's slot to its own key when picked; opening the Expansion menu or the Gear
 * categories menu closes it, and one Escape closes it and nothing more. Leaves the browser's filters at their defaults. */
export async function checkSlotMenuPicksAndLayers(pg) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');

  // the counts: thousands separators as the view writes them, and at least one number is over 999
  await pg.click('#b-slot');
  const counts = await pg.locator('#b-slots .multi-opt .n').allTextContents();
  const withoutSeparator = counts.filter(text => Number(text.replaceAll(',', '')).toLocaleString('en-US') !== text);
  check(withoutSeparator.length === 0, `the Slot menu counts without thousands separators: ${withoutSeparator.join(' ')}`);
  check(
    counts.some(text => text.includes(',')),
    `no count of the Slot menu is over 999 (${counts.join(' ')}), so the separator check proves nothing`,
  );
  await pg.keyboard.press('Escape');

  // every slot the menu lists sets its own key (a row greyed out for lack of a match cannot be picked, so the step runs with
  // the filters cleared; the job's own slots are the ones listed: Sage has no off-hand, which the stories cover)
  const keys = await pg.evaluate(() => [...document.querySelectorAll('#b-slots [data-slot]')].map(row => row.dataset.slot));
  check(keys.includes('weapon') && keys.length > 5, `the Slot menu lists ${keys.join(', ')}`);
  for (const key of keys) {
    await chooseSlot(pg, key);
    await pg.waitForFunction(slot => window.gsaDebug.app.browse.type === slot, key);
  }
  await chooseSlot(pg, 'any');

  // another layer: the Expansion and the Gear categories menu close the Slot menu when they open
  for (const opener of ['#b-exp', '#b-from']) {
    await pg.click('#b-slot');
    await expect(pg.locator('#b-slots')).toBeVisible();
    await pg.click(opener);
    await expect(pg.locator('#b-slots')).toBeHidden();
    await expect(pg.locator(opener)).toHaveAttribute('aria-expanded', 'true');
    await pg.keyboard.press('Escape');
    await expect(pg.locator(opener)).toHaveAttribute('aria-expanded', 'false');
  }

  // one Escape closes the Slot menu; a second one closes nothing else and leaves the focus on the button
  await pg.click('#b-slot');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#b-slots')).toBeHidden();
  await pg.keyboard.press('Escape');
  check((await focusedId(pg)) === 'b-slot', 'a second Escape moved the focus off the Slot button');
}

/** In short windows (1366 x 650, 1280 x 500, 960 x 420) the open Slot menu stays inside the window and every row can be
 * reached by the keys (End, Home) and the wheel: the lit row lies inside the window and inside the part of the list that shows,
 * and the page does not scroll sideways. Leaves the window as it was. */
export async function checkSlotMenuShortWindow(pg) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');
  const normal = pg.viewportSize();
  // where the rows lie, in window coordinates: the list, and the row named `slot` (its data-slot code)
  const placeOf = slot =>
    pg.evaluate(code => {
      const list = document.querySelector('#b-slots');
      const row = list.querySelector(`[data-slot="${code}"]`);
      const listBox = list.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return { listTop: listBox.top, listBottom: listBox.bottom, rowTop: rowBox.top, rowBottom: rowBox.bottom };
    }, slot);
  const isSeen = (place, height) =>
    place.listTop >= 0 &&
    place.listBottom <= height + 1 &&
    place.rowTop >= place.listTop - 1 &&
    place.rowBottom <= place.listBottom + 1 &&
    place.rowTop >= 0 &&
    place.rowBottom <= height + 1;
  for (const [width, height] of [
    [1366, 650],
    [1280, 500],
    [960, 420],
  ]) {
    await pg.setViewportSize({ width, height });
    await pg.focus('#b-slot');
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => document.activeElement?.id === 'b-slots');
    const keys = await pg.evaluate(() => [...document.querySelectorAll('#b-slots [data-slot]')].map(row => row.dataset.slot));
    const [first, last] = [keys[0], keys[keys.length - 1]];
    for (const [key, slot] of [
      ['End', last],
      ['Home', first],
    ]) {
      await pg.keyboard.press(key);
      await expect(pg.locator(`#b-slots [data-slot="${slot}"]`)).toHaveAttribute('data-highlighted', '');
      await pg.waitForFunction(
        ([code, windowHeight]) => {
          const list = document.querySelector('#b-slots');
          const listBox = list.getBoundingClientRect();
          const rowBox = list.querySelector(`[data-slot="${code}"]`).getBoundingClientRect();
          return (
            rowBox.top >= listBox.top - 1 && rowBox.bottom <= listBox.bottom + 1 && listBox.top >= 0 && listBox.bottom <= windowHeight + 1
          );
        },
        [slot, height],
      );
      check(isSeen(await placeOf(slot), height), `at ${width} x ${height} ${key} lit a row the player cannot see`);
    }
    // the wheel over the list reaches the last row too
    const box = await pg.locator('#b-slots').boundingBox();
    await pg.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height, height - box.y) / 2);
    for (let notch = 0; notch < 40; notch++) {
      const atEnd = await pg.locator('#b-slots').evaluate(list => list.scrollTop + list.clientHeight >= list.scrollHeight - 1);
      if (atEnd) {
        break;
      }
      await pg.mouse.wheel(0, 100);
      await pg.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    }
    check(isSeen(await placeOf(last), height), `at ${width} x ${height} the wheel did not bring the last row into view`);
    check(
      await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      `at ${width} x ${height} the page scrolls sideways with the Slot menu open`,
    );
    await pg.keyboard.press('Escape');
    await expect(pg.locator('#b-slots')).toBeHidden();
  }
  await pg.setViewportSize(normal);
}
