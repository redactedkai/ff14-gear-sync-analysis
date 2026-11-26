// A pick in a set page's materia menu or Food menu reaches the page's store: the row shows it and the Total row is what the core
// finds for the same set. The stories prove the menus send their pick (materia-menu.spec, food-menu.spec) and the unit tests prove
// the stones and the totals; this proves the page wires one to the other.

import { check, expect, poll } from '../../lib/expect.mjs';
import { coreSet } from '../../lib/core.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { checkTotals } from '../../lib/shared-checks.mjs';
import { expectApplyCount, expectMealEmpty, openSageSet, seedSheet } from '../../lib/sheets.mjs';

/** The seeded Sage sheet's item level sync, as the core takes it (the sheet's own: level 100, item level sync 123). */
const SAGE_SYNC = { cap: SET_SHEET.sync.cap, sync: SET_SHEET.sync.on, level: SET_SHEET.level };
/** The head row of the set page (its table row, the piece the seeded set wears) and its first materia chip. */
const HEAD_ROW = 2;
const HEAD_CHIP = `[data-chip="${HEAD_ROW}:0"]`;

/** The seeded set's pieces, as saved, with `stones` on its head piece. */
function setWithHeadStones(stones, meal = null) {
  const [saved] = SET_SHEET.sets;
  return { pieces: saved.pieces.map((piece, row) => (row === HEAD_ROW ? { ...piece, stones } : piece)), meal };
}

/** Picking a stone in the head piece's materia menu: the chip shows the stone, the change waits as a draft, and the Total row is the
 * core's for the head piece with that stone (the first stone of the menu that changes the Total, so the pick cannot pass by adding
 * nothing); Discard puts the Total back. */
export async function checkMateriaPick(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const baseline = await coreSet('SGE', SAGE_SYNC, setWithHeadStones([]));
  await checkTotals(pg, 'the seeded set', baseline);

  // the menu's stones, as "stat:grade"; the first one whose Total differs from the bare piece's
  const chip = pg.locator(HEAD_CHIP);
  await chip.click();
  const menu = pg.locator('.matpop');
  await expect(menu).toBeVisible();
  const offered = await menu
    .locator('button[data-stone]:not([disabled])')
    .evaluateAll(buttons => buttons.map(button => button.dataset.stone));
  check(offered.length > 0, 'the head piece materia menu offers no stone');
  let picked = null;
  for (const stone of offered) {
    const [stat, grade] = stone.split(':');
    const totals = await coreSet('SGE', SAGE_SYNC, setWithHeadStones([{ stat, grade: Number(grade) }]));
    if (Object.keys(totals).some(key => totals[key] !== baseline[key])) {
      picked = { stone, totals };
      break;
    }
  }
  check(picked !== null, `none of the ${offered.length} stones of the head menu changes the Total; pick another piece`);

  await menu.locator(`button[data-stone="${picked.stone}"]`).click();
  await expect(menu).toBeHidden();
  await poll('the focus to go back to the head chip', async () => ({
    ok: await chip.evaluate(element => element === document.activeElement),
    got: 'elsewhere',
  }));
  await expectApplyCount(pg, 1);
  await checkTotals(pg, `the head piece with ${picked.stone}`, picked.totals);

  // the stone is the head chip's: its menu opens on it, and Discard puts the piece and the Total back
  await chip.click();
  await expect(menu.locator(`button[data-stone="${picked.stone}"].on`)).toHaveCount(1);
  await pg.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'after Discard', baseline);
  await pg.click('[data-tab=browse]');
}

/** Picking a meal in the Food menu: the Food row names it, the change waits as a draft, and the Total row is the core's for the set
 * with that meal (the menu's first meal; at least one stat differs from the set without it); No food and Discard put the Total back. */
export async function checkMealPick(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const baseline = await coreSet('SGE', SAGE_SYNC, setWithHeadStones([]));
  await expectMealEmpty(pg);

  const food = pg.locator('#sh-meal-btn');
  const menu = pg.locator('#sh-meal-menu');
  await food.click();
  const meal = menu.locator('.same-item[data-meal]:not([data-meal=""])').first();
  const mealKey = await meal.getAttribute('data-meal');
  const withMeal = await coreSet('SGE', SAGE_SYNC, setWithHeadStones([], mealKey));
  check(
    Object.keys(withMeal).some(key => withMeal[key] !== baseline[key]),
    `the first meal of the Food menu (${mealKey}) changes no stat of the seeded set; pick another case`,
  );
  await meal.click();
  await expect(menu).toBeHidden();
  await expectMealEmpty(pg, false);
  await expect(food).toContainText(mealKey);
  await expectApplyCount(pg, 1);
  await checkTotals(pg, `the set with ${mealKey}`, withMeal);

  // No food takes the meal away again: the Total is the bare set's and the Food row is empty
  await food.click();
  await menu.locator('.same-item[data-meal=""]').click();
  await expect(menu).toBeHidden();
  await expectMealEmpty(pg);
  await checkTotals(pg, 'after No food', baseline);
  if (await pg.locator('#sh-discard').count()) {
    await pg.click('#sh-discard'); // the draft stays open with no change in it
  }
  await pg.click('[data-tab=browse]');
}
