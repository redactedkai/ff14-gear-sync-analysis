// The pick menu and the Food menu of a set page.

import assert from 'node:assert';
import { shot } from '../../lib/constants.mjs';
import { check, checkNoBadText, expect, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { hasHScroll } from '../../lib/nav.mjs';
import { expectApplyCount, expectMealEmpty, expectPieceEmpty, openSageSet, seedSheet } from '../../lib/sheets.mjs';

/** Longest main-thread task allowed while a set page's piece menu or Food menu opens and draws its rows, at 4x slower CPU
 * (ms). Measured at 4x: 1.0 to 2.1 s before the menus drew their rows in steps and 0.2 to 0.3 s after; the margin is wide so a busy machine does not fail the run. */
const MENU_LONG_TASK_MS = 1000;

/** How many times a menu is opened and timed; the best (shortest) longest task counts, because a busy machine only ever
 * makes a task longer, so a menu that draws in steps is fast at least once and one that does not is slow every time. */
const MENU_RUNS = 3;

/** The menus of a set page draw a long list in steps (ui/views/limit-rows.js): on open the menu shows a window of rows and
 * the later ones follow, so no task is long at 4x slower CPU; every piece is still there at the end (the footer's count),
 * the search finds the last piece of the list, and the Food menu ends with all its meals. */
export async function checkMenuSteps(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Open `buttonSel`; the row counts of `menuSel` at its first frame and when they stop growing; the longest task
  const open = (buttonSel, menuSel) =>
    pg.evaluate(
      async ([buttonSel, menuSel]) => {
        const frame = () => new Promise(done => requestAnimationFrame(done));
        const rows = () => document.querySelectorAll(`${menuSel} .same-item`).length;
        let longest = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
        });
        observer.observe({ type: 'longtask' });
        document.querySelector(buttonSel).click();
        while (!document.querySelector(menuSel)) await frame();
        await frame();
        const first = rows();
        let last = first;
        for (let still = 0; still < 30; ) {
          await frame();
          still = rows() === last ? still + 1 : 0;
          last = rows();
        }
        await new Promise(done => setTimeout(done, 100)); // long-task entries arrive after the task
        observer.disconnect();
        return { first, last, longest };
      },
      [buttonSel, menuSel],
    );
  // Open the menu MENU_RUNS times (shut between); the rows are checked on every run, the longest task is the best of the runs
  const openBest = async (buttonSel, menuSel) => {
    let best;
    for (let run = 0; run < MENU_RUNS; run++) {
      if (run) await close();
      const got = await open(buttonSel, menuSel);
      assert.ok(got.last > got.first, `${menuSel} draws its rows in steps: ${got.first} then ${got.last}`);
      if (!best || got.longest < best.longest) best = got;
    }
    return best;
  };
  const close = async () => {
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => document.body.click());
    await expect(pg.locator('.same-menu')).toHaveCount(0);
  };

  // the head piece menu (a long list): a window first, then every piece
  const head = await openBest('#sh-gear tr[data-row="2"] [data-pick]', '.pick-menu');
  const total = Number((await pg.locator('.pick-menu .same-foot').innerText()).match(/^(\d+) pieces/)[1]);
  assert.ok(total > 200, `a long list to test with (${total} pieces)`);
  assert.ok(head.first < total / 2, `the head menu opens with a window of rows, not all ${total}: ${head.first}`);
  assert.equal(
    head.last,
    total, // every piece: "Empty this slot" is a button in the search row, not a row of the list
    'the head menu ends with every piece',
  );
  assert.ok(
    head.longest < MENU_LONG_TASK_MS,
    `the head menu's longest task at 4x: ${head.longest} ms (limit ${MENU_LONG_TASK_MS}, best of ${MENU_RUNS})`,
  );
  const lastKey = await pg.locator('.pick-menu .same-item[data-game-id]').last().getAttribute('data-game-id');
  const lastName = await pg.locator('.pick-menu .same-item[data-game-id]').last().locator('span span').first().innerText();
  await close();

  // the search finds the last piece of the list at once, before the later rows are drawn
  await pg.locator('#sh-gear tr[data-row="2"] [data-pick]').click();
  await pg.locator('.pick-menu input[type=text]').fill(lastName);
  await expect(pg.locator(`.pick-menu .same-item[data-game-id="${lastKey}"]`)).toHaveCount(1);
  await close();

  // the Food menu: a window first, then every meal
  const food = await openBest('#sh-meal-btn', '#sh-meal-menu');
  assert.ok(food.last > food.first, `the Food menu draws its meals in steps: ${food.first} then ${food.last}`);
  assert.ok(
    food.longest < MENU_LONG_TASK_MS,
    `the Food menu's longest task at 4x: ${food.longest} ms (limit ${MENU_LONG_TASK_MS}, best of ${MENU_RUNS})`,
  );
  await close();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
}

/** The rows of the piece menu and the Food menu are picked through one click handler on the list (the rows carry
 * data-game-id and data-meal): a piece row picks its piece, Empty this slot empties the row, a Unique ring worn in the other
 * ring row is disabled and a click on it does nothing, a meal row picks its meal and No food clears it. */
export async function checkMenuClicks(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  const AGATE = 49579; // Bygone Brass Ring of Healing, a Unique ring
  const sheet = structuredClone(SET_SHEET);
  sheet.sets[0].pieces[11] = { slot: 'ring', gameId: AGATE, stones: [] }; // the second ring row wears it
  await seedSheet(pg, sheet);
  await openSageSet(pg);
  const ring = pg.locator('#sh-gear tr[data-row="10"] [data-pick]');
  const menu = pg.locator('.pick-menu');
  const ringName = (await ring.innerText()).trim(); // the piece the second ring row starts with
  await ring.click();
  await expect(menu).toBeVisible();

  // a Unique ring worn in the other row: disabled, and a click on it changes nothing
  const taken = menu.locator(`.same-item[data-game-id="${AGATE}"]`);
  await taken.scrollIntoViewIfNeeded();
  await expect(taken).toBeDisabled();
  await taken.click({ force: true });
  await expect(menu).toBeVisible();
  await expect(pg.locator('#sh-apply')).toHaveCount(0);

  // a piece row picks that piece
  const piece = menu.locator('.same-item[data-game-id]:not([disabled])').first();
  const pieceName = (await piece.locator('span span').first().innerText()).trim();
  await piece.click();
  await expect(menu).toHaveCount(0);
  await expect(ring).toContainText(pieceName);
  await expectApplyCount(pg, 1);

  // Empty this slot empties the row: a button in the search row, named in full, not a row of the list
  await ring.click();
  await expect(menu.locator('.menu-list [data-empty-slot]')).toHaveCount(0);
  await expect(menu.locator('.menu-tools [data-empty-slot]')).toHaveAttribute('aria-label', 'Empty this slot');
  await expect(menu.locator('.menu-tools [data-empty-slot]')).toHaveText('Empty');
  await menu.locator('.menu-tools [data-empty-slot]').click();
  await expect(menu).toHaveCount(0);
  await expectPieceEmpty(pg, 10);
  // a row that holds no piece has nothing to empty: no button
  await ring.click();
  await expect(menu.locator('[data-empty-slot]')).toHaveCount(0);
  await pg.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // the Food menu: a meal row picks its meal, No food clears it
  const food = pg.locator('#sh-meal-btn');
  const mealMenu = pg.locator('#sh-meal-menu');
  await food.click();
  const meal = mealMenu.locator('.same-item[data-meal]:not([data-meal=""])').first();
  const mealKey = await meal.getAttribute('data-meal');
  await meal.click();
  await expect(mealMenu).toHaveCount(0);
  await expect(food).toContainText(mealKey);
  await food.click();
  await mealMenu.locator('.same-item[data-meal=""]').click();
  await expect(mealMenu).toHaveCount(0);
  await expectMealEmpty(pg);

  await pg.click('#sh-discard');
  await expect(ring).toHaveText(ringName); // Discard puts the piece back
  await pg.click('[data-tab=browse]');
}

/** A set page's piece menu (the .pick-menu, roadmap A9) at the shortest window the page supports for height (960 x 700),
 * on a row near the table's bottom: it opens without a sideways scroll, between the pinned header and the window's bottom
 * and inside its right edge; Escape closes it; a row's menu button scrolled under the sticky heading stays under it (the
 * header and the column names draw over it); the search box takes the keys, a search with no match says so and Clear
 * search brings the pieces back; a picked piece is what the row shows and a draft of one change that Discard undoes. */
export async function checkPickMenu(pg) {
  await pg.setViewportSize({ width: 960, height: 700 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const button = pg.locator('#sh-gear tr[data-row="6"] [data-pick]'); // the feet row: open, and near the table's bottom
  const menu = pg.locator('.pick-menu');
  await expectPieceEmpty(pg, 6);
  await button.click();
  await expect(menu).toBeVisible();
  check(!(await hasHScroll(pg)), `the piece menu scrolls the page sideways at 960 px`);
  await poll('the menu to sit between the pinned header and the window bottom, inside the right edge', async () => {
    const got = await pg.evaluate(() => {
      const box = document.querySelector('.pick-menu').getBoundingClientRect();
      const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
      const round = Math.round;
      return {
        menuTop: round(box.top),
        menuBottom: round(box.bottom),
        headBottom: round(head.bottom),
        window: innerHeight,
        menuRight: round(box.right),
        width: document.documentElement.clientWidth,
      };
    });
    return { ok: got.menuTop >= got.headBottom && got.menuBottom <= got.window && got.menuRight <= got.width, got };
  });
  await pg.screenshot({ path: shot('pick-menu.png') });
  await pg.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // scrolled under the sticky headings, the row's menu button stays below the pinned header and the column names
  const covered = await pg.evaluate(() => {
    const row = document.querySelector('#sh-gear tr[data-row="6"] [data-pick]');
    scrollBy(0, row.getBoundingClientRect().top - 4); // the row to the window's top, where the headings stick
    const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
    const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const hit = y => document.elementFromPoint(box.left + 10, y);
    const bad = [];
    if (!hit((head.top + head.bottom) / 2)?.closest('.shead')) bad.push('pinned header');
    if (!hit((names.top + names.bottom) / 2)?.closest('th')) bad.push('column names');
    return bad.join(' and ');
  });
  check(!covered, `a row's menu button draws over the ${covered}`);

  // search: the box has the focus; no match says so; Clear search brings the pieces back
  await button.click();
  await expect(menu).toBeVisible();
  await pg.waitForFunction(() => document.activeElement?.matches('.pick-menu input[type="text"]'));
  const pieces = menu.locator('.same-item[data-game-id]');
  // the menu draws its rows in steps (checkMenuSteps): wait for all of them, as many as the footer counts
  const count = Number((await menu.locator('.same-foot').innerText()).match(/^(\d+) pieces/)[1]);
  await expect(pieces).toHaveCount(count);
  check(count > 1, `the feet menu lists ${count} pieces`);
  await menu.locator('input[type="text"]').fill('zzzz');
  await expect(pieces).toHaveCount(0);
  await expect(menu.locator('.menu-empty')).toContainText('zzzz');
  await menu.locator('.menu-empty button').click();
  await expect(pieces).toHaveCount(count);

  // a pick: the row shows it, the change waits as a draft, Discard puts the row back
  const other = pieces.first();
  const name = (await other.locator('span span').first().innerText()).trim();
  await other.click();
  await expect(menu).toHaveCount(0);
  await expect(button).toContainText(name);
  await expectApplyCount(pg, 1);
  await checkNoBadText(pg, 'the piece menu');
  await pg.click('#sh-discard');
  await expectPieceEmpty(pg, 6);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
