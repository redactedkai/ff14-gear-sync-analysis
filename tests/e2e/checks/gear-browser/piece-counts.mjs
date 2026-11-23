// The "Gear categories" menu's piece counts: the number at the end of each box's title line, in the Gear browser's menu and in the
// Auto-fill settings' menu.

import { ACTIVITY_KEYS } from '../../lib/constants.mjs';
import { check, expect, poll, same } from '../../lib/expect.mjs';
import { setJob, showTab } from '../../lib/nav.mjs';
import { openSet, seedSheet } from '../../lib/sheets.mjs';
import { DIALOG_SHEET } from '../auto-fill/dialog.mjs';

/** The widths and heights of the windows the menu is looked at: the 960 px floor, and a wide one. */
const WINDOWS = [
  [960, 720],
  [1920, 1080],
];

/** Sage's gear of item level 790 to 795 (the highest there is) by box: the Savage set (nine armor pieces and the weapon) and the
 * augmented tomestone set (nine armor pieces and a weapon, each armor piece a hunt seal upgrade and a Savage upgrade, the weapon a
 * Savage upgrade only), the Ultimate weapon and the Phantom relic weapon(s). The Gear browser also lists the relic weapon whose substats
 * the player allocates (Occultum), which Auto-fill's pool leaves out. Every other box is 0. */
const TOP_GEAR = { savage_current: 20, tomes_current: 10, hunts: 9, ultimate: 1 };

/** Every box of the open menu of `pre` ('b' the browser, 's' the Auto-fill settings): {key: {text, hidden, color, weight, title,
 * described, opacity, nameLines, width}} read from the DOM (the tabs not shown have layout too). `color` is the number's, `opacity` the
 * checkbox's, `described` the text of the hidden description of the box's number, `nameLines` how many lines the title takes. */
function readBoxes(pg, pre) {
  return pg.evaluate(menuSel => {
    const result = {};
    for (const input of document.querySelectorAll(`${menuSel} input[data-activity]`)) {
      const row = input.closest('label');
      const count = row.querySelector('.from-count');
      const name = row.querySelector('.from-name');
      const ids = input.getAttribute('aria-describedby').split(' ');
      const described = ids.map(id => document.getElementById(id)?.textContent.trim() ?? null);
      result[input.dataset.activity] = {
        text: count.textContent.trim(),
        hidden: count.getAttribute('aria-hidden') === 'true',
        color: getComputedStyle(count).color,
        weight: Number(getComputedStyle(count).fontWeight),
        title: row.getAttribute('title'),
        described,
        opacity: getComputedStyle(input).opacity,
        nameColor: getComputedStyle(name).color,
        nameLines: name.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(name).lineHeight),
        width: count.getBoundingClientRect().width,
      };
    }
    return result;
  }, `#${pre}-from-menu`);
}

/** The numbers of the boxes as the menu prints them, as {key: text}. */
const printed = boxes => Object.fromEntries(Object.entries(boxes).map(([key, box]) => [key, box.text]));

/** The color a token resolves to on the page, as the browser's computed rgb string. */
function tokenColor(pg, token) {
  return pg.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/** Wait until every box of the menu of `pre` shows a number (the count has landed). */
async function waitForCounts(pg, pre) {
  await poll(`the ${pre} menu's boxes all show a number`, async () => {
    const boxes = await readBoxes(pg, pre);
    return { ok: ACTIVITY_KEYS.every(key => /\d/.test(boxes[key]?.text ?? '')), got: printed(boxes) };
  });
}

/** The number a box's text is, from its printed form ("1,380" -> 1380). */
const numberOf = text => Number(text.replace(/,/g, ''));

/** What the menu of `pre` shows for its numbers, with every box in view: a number on every box, in the mono type, muted, aria-hidden,
 * with its sentence as the row's title and a hidden description (the hint stays in the description too); a gold bold 0 for a box with
 * nothing (`zeroKey` is one that must be 0); nothing dimmed. Returns the boxes read. */
async function checkNumbers(pg, pre, zeroKey) {
  await waitForCounts(pg, pre);
  const boxes = await readBoxes(pg, pre);
  const gold = await tokenColor(pg, '--gold');
  const muted = await tokenColor(pg, '--muted');
  check(same(Object.keys(boxes).sort(), [...ACTIVITY_KEYS].sort()), `${pre} menu: the boxes are ${Object.keys(boxes)}`);
  const nameColors = new Set(Object.values(boxes).map(box => box.nameColor));
  check(nameColors.size === 1, `${pre} menu: the box names are not all one color (a dimmed box?): ${[...nameColors]}`);
  for (const [key, box] of Object.entries(boxes)) {
    const where = `${pre} menu, ${key}`;
    const n = numberOf(box.text);
    check(/^\d{1,3}(,\d{3})*$/.test(box.text), `${where}: the number reads "${box.text}", expected digits with thousands separators`);
    check(box.hidden, `${where}: the visible number is not aria-hidden`);
    check(box.opacity === '1', `${where}: the box is dimmed (opacity ${box.opacity})`);
    check(
      box.width > 0 && Math.abs(box.width - boxes[ACTIVITY_KEYS[0]].width) < 0.5,
      `${where}: the number's column is not the same width as the others (${box.width})`,
    );
    check(box.nameLines < 1.5, `${where}: the title takes ${box.nameLines} lines`);
    const sentence =
      n === 0
        ? 'No pieces in this category for this job and filters.'
        : `${box.text} ${n === 1 ? 'piece' : 'pieces'} in this category under the current filters.`;
    check(box.title === sentence, `${where}: the row's title is "${box.title}", expected "${sentence}"`);
    check(
      box.described.length === 2 && box.described[1] === sentence && box.described[0]?.length > 0,
      `${where}: the box's description is ${JSON.stringify(box.described)}`,
    );
    check(
      n === 0 ? box.color === gold && box.weight >= 700 : box.color === muted && box.weight < 700,
      `${where}: the number "${box.text}" is ${box.color} at weight ${box.weight} (0 is gold and bold, others muted and regular)`,
    );
  }
  check(numberOf(boxes[zeroKey].text) === 0, `${pre} menu: ${zeroKey} holds ${boxes[zeroKey].text} pieces, expected 0`);
  return boxes;
}

/** The menu of `pre` (open) at each of the WINDOWS, opened again after each resize: inside the window sideways (and downwards too in the
 * Auto-fill settings, whose menus float and are cut to the window; the browser's menu hangs from its field and the page scrolls),
 * nothing scrolling sideways, no title on two lines, and the same width every time (the numbers do not change it). Returns the widths. */
async function checkMenuFits(pg, pre) {
  const normal = pg.viewportSize();
  const widths = [];
  for (const [width, height] of WINDOWS) {
    await pg.setViewportSize({ width, height });
    await pg.keyboard.press('Escape');
    await expect(pg.locator(`#${pre}-from-menu`)).toBeHidden();
    await pg.click(`#${pre}-from`);
    await expect(pg.locator(`#${pre}-from-menu`)).toBeVisible();
    await pg.evaluate(() => new Promise(requestAnimationFrame));
    const fit = await pg.evaluate(menuSel => {
      const menu = document.querySelector(menuSel);
      const box = menu.getBoundingClientRect();
      const wide = [...menu.querySelectorAll('.from-name')].filter(
        name => name.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(name).lineHeight) * 1.5,
      );
      return {
        box: [box.left, box.top, box.right, box.bottom].map(Math.round),
        width: box.width,
        window: [document.documentElement.clientWidth, innerHeight],
        pageSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        menuScrolls: menu.scrollWidth > menu.clientWidth + 1,
        wrapped: wide.map(name => name.textContent),
      };
    }, `#${pre}-from-menu`);
    const [left, top, right, bottom] = fit.box;
    check(
      left >= 0 && top >= 0 && right <= fit.window[0] && (pre === 'b' || bottom <= fit.window[1]) && !fit.pageSideways && !fit.menuScrolls,
      `the ${pre} menu is not whole inside a ${width} x ${height} window: ${JSON.stringify(fit)}`,
    );
    check(fit.wrapped.length === 0, `the ${pre} menu at ${width} px has titles on two lines: ${fit.wrapped}`);
    check(fit.width >= 435, `the ${pre} menu at ${width} px is ${fit.width} px wide, less than 436`);
    widths.push(Math.round(fit.width));
  }
  check(
    widths.every(w => w === widths[0]),
    `the ${pre} menu changes width with the window: ${widths}`,
  );
  await pg.setViewportSize(normal);
  return widths;
}

/** The menu of `pre` (open, at the Everyday tab) through the whole story: numbers on every box with a gold 0 and nothing dimmed;
 * the menu inside the window at the floor and a wide one; Item level min 790 (`minId`) changes the numbers to Sage's top gear (the
 * boxes with none show a gold 0), and the menu keeps its width; a box ticked and the market board switch change no number. */
async function checkCounts(pg, pre, minId, wait, relicsAtTop) {
  const before = await checkNumbers(pg, pre, 'gold_saucer');
  check(
    numberOf(before.crafted.text) > 0 && numberOf(before.quests.text) > 0,
    `${pre} menu: crafted ${before.crafted.text}, quests ${before.quests.text}: expected pieces`,
  );
  const widthBefore = (await checkMenuFits(pg, pre))[0];

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
  check((await checkMenuFits(pg, pre))[0] === widthBefore, `the ${pre} menu changes width when its numbers change`);

  // put the filter back
  await pg.keyboard.press('Escape');
  await pg.fill(minId, '');
  await pg.locator(minId).dispatchEvent('change');
}

/** The Gear browser's menu: Sage, the browser's own filters. */
export async function checkGearFromCountsBrowser(pg) {
  await showTab(pg, 'browse');
  await setJob(pg, 'SGE');
  await pg.click('#b-from');
  await expect(pg.locator('#b-from-menu')).toBeVisible();
  await checkCounts(pg, 'b', '#b-min', () => pg.waitForTimeout(300), 2);
}

/** The Auto-fill settings' menu: a Sage set, Gear to search. */
export async function checkGearFromCountsFill(pg) {
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
