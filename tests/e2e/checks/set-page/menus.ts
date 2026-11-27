// The pick menu and the Food menu of a set page.

import assert from 'node:assert';
import { shot } from '../../lib/constants.ts';
import { check, checkNoBadText, expect, poll } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { hasHScroll } from '../../lib/nav.ts';
import { expectApplyCount, expectMealEmpty, expectPieceEmpty, openSageSet, seedSheet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** Longest main-thread task allowed while a set page's piece menu or Food menu opens and draws its rows, at 4x slower CPU
 * (ms), on a machine as fast as the one it was measured on (CALIBRATION_REFERENCE_MS); a slower or busier machine gets a
 * proportionally longer limit (see menuLimit). Measured at 4x: 1.0 to 2.1 s before the menus drew their rows in steps and 0.07 to
 * 0.25 s after. */
const MENU_LONG_TASK_MS = 1000;

/** How many times a menu is opened and timed; the best (shortest) longest task counts, because a busy machine only ever
 * makes a task longer, so a menu that draws in steps is fast at least once and one that does not is slow every time. */
const MENU_RUNS = 3;

/** The calibration task: a fixed amount of plain arithmetic (loop passes), timed in the page at the same 4x slowdown as the menus,
 * so a slow or busy machine lengthens it as it lengthens the menus' own tasks. It is run CALIBRATION_RUNS times and the shortest
 * counts (load only lengthens a task). */
const CALIBRATION_PASSES = 10_000_000;
const CALIBRATION_RUNS = 4;

/** What the calibration task takes at 4x slower CPU on an idle machine (ms; measured 71 to 75 ms on the owner's machine): the speed
 * MENU_LONG_TASK_MS is stated for. */
const CALIBRATION_REFERENCE_MS = 75;

/** The longest task allowed for a menu (ms) when the calibration task took `calibrationMs`: MENU_LONG_TASK_MS on a machine as fast
 * as the reference (or faster), and that much times how many times slower than the reference the machine is now. A menu that
 * draws its rows with more work than before takes longer by the same factor whatever the machine's speed, so it still fails. */
const menuLimit = calibrationMs => MENU_LONG_TASK_MS * Math.max(1, calibrationMs / CALIBRATION_REFERENCE_MS);

/** The menus of a set page draw a long list in steps (ui/views/limit-rows.ts): on open the menu shows a window of rows and
 * the later ones follow, so no task is long at 4x slower CPU; every piece is still there at the end (the footer's count),
 * the search finds the last piece of the list, and the Food menu ends with all its meals. */
export async function checkMenuSteps(pg: Page) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Open `buttonSel`; the row counts of `menuSel` at its first frame and when they stop growing; the longest task
  const open = (buttonSel: string, menuSel: string) =>
    pg.evaluate(
      async ([buttonSelector, menuSelector]) => {
        const frame = () => new Promise(done => requestAnimationFrame(done));
        const rows = () => document.querySelectorAll(`${menuSelector} .same-item`).length;
        let longest = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            longest = Math.max(longest, entry.duration);
          }
        });
        observer.observe({ type: 'longtask' });
        document.querySelector(buttonSelector).click();
        while (!document.querySelector(`${menuSelector} .same-item`)) {
          await frame();
        }
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
  // The shortest of CALIBRATION_RUNS runs of the calibration task (ms), at the page's current slowdown
  const calibrate = () =>
    pg.evaluate(
      ([passes, runs]) => {
        let shortest = Number.POSITIVE_INFINITY;
        let sink = 0; // the sum is kept so the loop is not optimized away
        for (let run = 0; run < runs; run++) {
          const start = performance.now();
          for (let pass = 0; pass < passes; pass++) {
            sink += pass % 7;
          }
          shortest = Math.min(shortest, performance.now() - start);
        }
        return sink >= 0 ? shortest : 0;
      },
      [CALIBRATION_PASSES, CALIBRATION_RUNS],
    );
  // Open the menu MENU_RUNS times (shut between); the rows are checked on every run, the longest task is the best of the runs.
  // `limit` is what the longest task may be (ms): the calibration task is timed before and after, and the shorter of the two
  // sets it (menuLimit), so a machine that is busy for the whole step is allowed what it is slower by
  const openBest = async (buttonSel: string, menuSel: string) => {
    let best;
    let calibrationMs = await calibrate();
    for (let run = 0; run < MENU_RUNS; run++) {
      if (run) {
        await close();
      }
      const got = await open(buttonSel, menuSel);
      assert.ok(got.last > got.first, `${menuSel} draws its rows in steps: ${got.first} then ${got.last}`);
      if (!best || got.longest < best.longest) {
        best = got;
      }
    }
    calibrationMs = Math.min(calibrationMs, await calibrate());
    return { ...best, limit: menuLimit(calibrationMs), calibrationMs };
  };
  const close = async () => {
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => document.body.click());
    await expect(pg.locator('.same-menu:visible')).toHaveCount(0); // the Food menu stays in the page, hidden
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
    head.longest < head.limit,
    `the head menu's longest task at 4x: ${Math.round(head.longest)} ms (limit ${Math.round(head.limit)} for a calibration task of ${Math.round(head.calibrationMs)} ms, best of ${MENU_RUNS})`,
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
    food.longest < food.limit,
    `the Food menu's longest task at 4x: ${Math.round(food.longest)} ms (limit ${Math.round(food.limit)} for a calibration task of ${Math.round(food.calibrationMs)} ms, best of ${MENU_RUNS})`,
  );
  await close();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
}

/** The rows of the piece menu and the Food menu are picked through one click handler on the list (the rows carry
 * data-game-id and data-meal): a piece row picks its piece, Empty this slot empties the row, a Unique ring worn in the other
 * ring row is disabled and a click on it does nothing, a meal row picks its meal and No food clears it. */
export async function checkMenuClicks(pg: Page) {
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
  await expect(menu).toBeHidden(); // the one menu element stays, hidden
  await expect(ring).toContainText(pieceName);
  await expectApplyCount(pg, 1);

  // Empty this slot empties the row: a button in the search row, named in full, not a row of the list
  await ring.click();
  await expect(menu).toBeVisible();
  await expect(menu.locator('.menu-list [data-empty-slot]')).toHaveCount(0);
  await expect(menu.locator('.menu-tools [data-empty-slot]')).toHaveAttribute('aria-label', 'Empty this slot');
  await expect(menu.locator('.menu-tools [data-empty-slot]')).toHaveText('Empty');
  await menu.locator('.menu-tools [data-empty-slot]').click();
  await expect(menu).toBeHidden(); // the one menu element stays, hidden
  await expectPieceEmpty(pg, 10);
  // a row that holds no piece has nothing to empty: no button
  await ring.click();
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-empty-slot]')).toHaveCount(0);
  await pg.keyboard.press('Escape');
  await expect(menu).toBeHidden(); // the one menu element stays, hidden

  // the Food menu: a meal row picks its meal, No food clears it
  const food = pg.locator('#sh-meal-btn');
  const mealMenu = pg.locator('#sh-meal-menu');
  await food.click();
  const meal = mealMenu.locator('.same-item[data-meal]:not([data-meal=""])').first();
  const mealKey = await meal.getAttribute('data-meal');
  await meal.click();
  await expect(mealMenu).toBeHidden();
  await expect(food).toContainText(mealKey);
  await food.click();
  await mealMenu.locator('.same-item[data-meal=""]').click();
  await expect(mealMenu).toBeHidden();
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
export async function checkPickMenu(pg: Page) {
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
  await expect(menu).toBeHidden(); // the one menu element stays, hidden

  // scrolled under the sticky headings, the row's menu button stays below the pinned header and the column names
  const covered = await pg.evaluate(() => {
    const row = document.querySelector('#sh-gear tr[data-row="6"] [data-pick]');
    scrollBy(0, row.getBoundingClientRect().top - 4); // the row to the window's top, where the headings stick
    const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
    const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const hit = y => document.elementFromPoint(box.left + 10, y);
    const bad = [];
    if (!hit((head.top + head.bottom) / 2)?.closest('.shead')) {
      bad.push('pinned header');
    }
    if (!hit((names.top + names.bottom) / 2)?.closest('th')) {
      bad.push('column names');
    }
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
  await expect(menu).toBeHidden(); // the one menu element stays, hidden
  await expect(button).toContainText(name);
  await expectApplyCount(pg, 1);
  await checkNoBadText(pg, 'the piece menu');
  await pg.click('#sh-discard');
  await expectPieceEmpty(pg, 6);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
