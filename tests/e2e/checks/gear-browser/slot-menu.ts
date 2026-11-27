// Gear browser: the Slot menu on the title line, one round bar with the name search.

import { ANY_SLOT_LABEL } from '../../../../src/ui/elements/gear-browser/slot-menu-names.ts';
import { check, expect } from '../../lib/expect.ts';
import { chooseSlot, fillBrowser, showTab } from '../../lib/nav.ts';
import type { Page } from 'playwright';

/** The Slot menu on the real page: the open menu stays above the table's sticky header after the pointer lit a row (the story has
 * no table; every row, the ones over the header included, is still the top element at its centre). The menu's width, border, keys,
 * wheel and short windows are the stories' (`tests/stories/gear-browser/slot-menu.spec.ts`); the counts' text is `views/gear`'s.
 * Leaves the browser's filters at their defaults. */
export async function checkSlotMenu(pg: Page) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');
  await expect(pg.locator('#b-slot')).toHaveText(ANY_SLOT_LABEL);

  await pg.click('#b-slot');
  await expect(pg.locator('#b-slots')).toBeVisible();
  // moving over a row lights it, which draws the menu again
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
  check(covered.overHeader > 0, "no row of the open Slot menu lies over the table's header, so the stacking check proves nothing");
  check(covered.behind === 0, `${covered.behind} rows of the open Slot menu are behind the table after the pointer moved over a row`);
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#b-slots')).toBeHidden();
}

/** The Slot menu wired to the page's store: every slot it offers (the weapon and the armor and accessory slots; the run uses Sage,
 * which has no off-hand, so that row is covered by the stories) sets the browser's slot to its own key when picked; opening the
 * Expansion menu or the Gear categories menu closes it. Leaves the browser's filters at their defaults. */
export async function checkSlotMenuPicksAndLayers(pg: Page) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');

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
}
