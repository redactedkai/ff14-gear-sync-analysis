// The "Gear categories" menu's piece counts: the number at the end of each box's title line, in the Gear browser's menu and in the
// Auto-fill settings' menu. The numbers' look (the separators, aria-hidden, one width, a gold 0, nothing dimmed, one-line titles) and the
// menu's fit in the window are `tests/stories/gear-browser/gear-categories.spec.ts`'s; what is checked here is which pieces the page
// counts (Sage's top gear by box) and what moves the numbers.

import { ACTIVITY_KEYS } from '../../lib/constants.ts';
import { check, expect, poll, same } from '../../lib/expect.ts';
import { setJob, showTab } from '../../lib/nav.ts';
import { openSet, seedSheet } from '../../lib/sheets.ts';
import { DIALOG_SHEET } from '../auto-fill/dialog.ts';
import type { Page } from 'playwright';

/** Sage's gear of item level 790 to 795 (the highest there is) by box: the Savage set (nine armor pieces and the weapon) and the
 * augmented tomestone set (nine armor pieces and a weapon, each armor piece a hunt seal upgrade and a Savage upgrade, the weapon a
 * Savage upgrade only), the Ultimate weapon and the Phantom relic weapon(s). The Gear browser also lists the relic weapon whose substats
 * the player allocates (Occultum), which Auto-fill's pool leaves out. Every other box is 0. */
const TOP_GEAR = { savage_current: 20, tomes_current: 10, hunts: 9, ultimate: 1 };

/** Every box of the open menu of `pre` ('b' the browser, 's' the Auto-fill settings): {key: {text}} read from the DOM (the tabs not
 * shown have layout too): the number at the end of its title line. */
function readBoxes(pg: Page, pre: string) {
  return pg.evaluate((menuSel: string) => {
    const result = {};
    for (const input of document.querySelectorAll(`${menuSel} input[data-activity]`)) {
      result[input.dataset.activity] = { text: input.closest('label').querySelector('.from-count').textContent.trim() };
    }
    return result;
  }, `#${pre}-from-menu`);
}

/** The numbers of the boxes as the menu prints them, as {key: text}. */
const printed = boxes => Object.fromEntries(Object.entries(boxes).map(([key, box]) => [key, box.text]));

/** Wait until every box of the menu of `pre` shows a number (the count has landed). */
async function waitForCounts(pg: Page, pre: string) {
  await poll(`the ${pre} menu's boxes all show a number`, async () => {
    const boxes = await readBoxes(pg, pre);
    return { ok: ACTIVITY_KEYS.every(key => /\d/.test(boxes[key]?.text ?? '')), got: printed(boxes) };
  });
}

/** The number a box's text is, from its printed form ("1,380" -> 1380). */
const numberOf = (text: string) => Number(text.replace(/,/g, ''));

/** What the menu of `pre` shows for its numbers: a number on every box, written with thousands separators; `zeroKey` is a box that
 * must be 0. Returns the boxes read. */
async function checkNumbers(pg: Page, pre: string, zeroKey) {
  await waitForCounts(pg, pre);
  const boxes = await readBoxes(pg, pre);
  check(same(Object.keys(boxes).sort(), [...ACTIVITY_KEYS].sort()), `${pre} menu: the boxes are ${Object.keys(boxes)}`);
  for (const [key, box] of Object.entries(boxes)) {
    check(
      /^\d{1,3}(,\d{3})*$/.test(box.text),
      `${pre} menu, ${key}: the number reads "${box.text}", expected digits with thousands separators`,
    );
  }
  check(numberOf(boxes[zeroKey].text) === 0, `${pre} menu: ${zeroKey} holds ${boxes[zeroKey].text} pieces, expected 0`);
  return boxes;
}

/** The menu of `pre` (open, at the Everyday tab) through the whole story: numbers on every box; Item level min 790 (`minId`) changes
 * the numbers to Sage's top gear (the boxes with none show 0); a box ticked and the market board switch change no number. */
async function checkCounts(pg: Page, pre: string, minId, wait, relicsAtTop) {
  const before = await checkNumbers(pg, pre, 'gold_saucer');
  check(
    numberOf(before.crafted.text) > 0 && numberOf(before.quests.text) > 0,
    `${pre} menu: crafted ${before.crafted.text}, quests ${before.quests.text}: expected pieces`,
  );

  // a tick (and the market board switch) changes the list or the pool, not the numbers
  await pg.locator(`#${pre}-from-menu input[data-activity="quests"]`).uncheck();
  await pg.locator(`#${pre}-market`).uncheck();
  await wait();
  check(
    same(printed(await readBoxes(pg, pre)), printed(before)),
    `${pre} menu: the numbers changed when a box and the market board were switched off`,
  );
  await pg.locator(`#${pre}-from-menu input[data-activity="quests"]`).check();
  await pg.locator(`#${pre}-market`).check();

  // a filter changes them: Item level from 790 leaves the top gear
  await pg.keyboard.press('Escape');
  await expect(pg.locator(`#${pre}-from-menu`)).toBeHidden();
  await pg.fill(minId, '790');
  await pg.locator(minId).dispatchEvent('change');
  await pg.click(`#${pre}-from`);
  await expect(pg.locator(`#${pre}-from-menu`)).toBeVisible();
  await poll(`the ${pre} menu's numbers follow Item level 790 and up`, async () => {
    const got = printed(await readBoxes(pg, pre));
    return { ok: got.quests === '0', got };
  });
  const top = await checkNumbers(pg, pre, 'quests');
  const expected = Object.fromEntries(ACTIVITY_KEYS.map(key => [key, { ...TOP_GEAR, relics: relicsAtTop }[key] ?? 0]));
  check(
    ACTIVITY_KEYS.every(key => numberOf(top[key].text) === expected[key]),
    `${pre} menu at item level 790 and up: ${JSON.stringify(printed(top))}, expected ${JSON.stringify(expected)}`,
  );
  check(top.crafted.text === '0' && before.crafted.text !== '0', `${pre} menu: crafted ${before.crafted.text} then ${top.crafted.text}`);

  // put the filter back
  await pg.keyboard.press('Escape');
  await pg.fill(minId, '');
  await pg.locator(minId).dispatchEvent('change');
}

/** The Gear browser's menu: Sage, the browser's own filters. */
export async function checkGearFromCountsBrowser(pg: Page) {
  await showTab(pg, 'browse');
  await setJob(pg, 'SGE');
  await pg.click('#b-from');
  await expect(pg.locator('#b-from-menu')).toBeVisible();
  await checkCounts(pg, 'b', '#b-min', () => pg.waitForTimeout(300), 2);
}

/** The Auto-fill settings' menu: a Sage set, Gear to search. */
export async function checkGearFromCountsFill(pg: Page) {
  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await pg.click('#s-from');
  await expect(pg.locator('#s-from-menu')).toBeVisible();
  await checkCounts(
    pg,
    's',
    '#s-min',
    async () => {
      await pg.waitForTimeout(300);
      await expect(pg.locator('#s-count[data-state="ready"]')).toBeVisible();
    },
    1,
  );
}
