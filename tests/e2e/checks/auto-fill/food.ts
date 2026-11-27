// The Auto-fill settings dialog: Food and the best meal.

import { DIALOG_SHEET, DIALOG_SYNC, expectSavedFill } from './dialog.ts';
import { STORE_KEY, shot } from '../../lib/constants.ts';
import { coreRecipe } from '../../lib/core.ts';
import { check, checkNoBadText, expect, poll } from '../../lib/expect.ts';
import { runFill, setNumber } from '../../lib/nav.ts';
import { checkTotals } from '../../lib/shared-checks.ts';
import { expectApplyCount, expectMealEmpty, openSet, seedSheet } from '../../lib/sheets.ts';
import { pickOption } from '../../lib/select.ts';
import type { Page } from 'playwright';

/** Food in the Auto-fill settings: switched on, Auto-fill picks the meal with the core's numbers (every stat of the Total row,
 * meal included), the Food row names it, and the Take boxes agree with what Apply does: one per changed row and one for
 * the meal, Apply's count follows them, and declining the meal leaves the totals the core finds without it. With a Target
 * GCD the meal and the gear are chosen together, so the GCD asked is the one reached with the meal; a second Auto-fill on the
 * applied set suggests only the meal. */
export async function checkFillFood(pg: Page) {
  const fill = fields => coreRecipe('SGE', DIALOG_SYNC, { target: 'crit', ...fields });
  const [noFood, food, withGcd] = await Promise.all([fill({ food: false }), fill({}), fill({ gcd: 2.4 })]);
  const usable = [
    check(food.meal && food.bonus.crit > 0, 'Sage level 100: the best meal adds no Critical Hit; pick another case'),
    check(food.totals.crit > noFood.totals.crit, 'Food does not raise Critical Hit; pick another case'),
    check(withGcd.meal && withGcd.bonus.sps > 0, 'Sage level 100: the meal for a GCD of 2.40 adds no speed; pick another case'),
  ].every(Boolean);
  if (!usable) {
    return;
  }
  // the gear's totals alone, on the same base
  const without = want => Object.fromEntries(Object.keys(want.totals).map(stat => [stat, want.totals[stat] - want.bonus[stat]]));
  const takeBoxes = pg.locator('#sh-gear .takebox input');
  const applyCount = async () => Number.parseInt((await pg.locator('#sh-apply').innerText()).replace(/\D+/g, ''), 10);

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await pickOption(pg, '#s-target', 'crit');
  check(await pg.locator('#s-food').isChecked(), 'Food is on by default');
  await pg.locator('#s-food').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'Food off', f => f.goal.food === false);
  await pg.locator('#s-food').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'Food on', f => f.goal.food === true);

  // 1. the best meal: the core's totals for every stat, its name on the Food row, a Take box per row and one for the meal
  await runFill(pg);
  await checkTotals(pg, 'Food on', food.totals);
  await expect(pg.locator('#sh-meal-btn')).toContainText(food.meal);
  const boxes = await takeBoxes.count();
  check(boxes === 12, `${boxes} Take boxes for a Sage's 11 rows and a meal, expected 12`);
  check((await takeBoxes.evaluateAll(b => b.filter(x => x.checked).length)) === boxes, 'a Take box starts unticked');
  check((await applyCount()) === boxes, `Apply says "${await pg.locator('#sh-apply').innerText()}" for ${boxes} Take boxes`);
  await pg.screenshot({ path: shot('fill-food.png'), fullPage: true });

  // 2. declining the meal: Apply counts one less and the totals are the gear's alone on the same base
  await pg.locator('#sh-food-row .takebox input').uncheck();
  await expectApplyCount(pg, boxes - 1);
  await checkTotals(pg, 'meal declined', without(food));
  await pg.locator('#sh-food-row .takebox input').check();
  await expectApplyCount(pg, boxes);
  await checkTotals(pg, 'meal taken again', food.totals);
  await pg.click('#sh-discard');

  // 3. a Target GCD with food: the GCD reached is the one asked, with the meal; declining the meal still applies what the
  // preview showed, and the next Auto-fill suggests the meal alone
  await pg.click('#sh-settings');
  await setNumber(pg, '#s-gcd', '2.40');
  await expectSavedFill(pg, DIALOG_SHEET, 'Target GCD 2.40', f => Number(f.goal.gcd) === 2.4);
  await runFill(pg);
  await checkTotals(pg, 'Food and Target GCD 2.40', withGcd.totals);
  await expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(withGcd.gcd);
  await pg.locator('#sh-food-row .takebox input').uncheck();
  await checkTotals(pg, 'Target GCD, meal declined', without(withGcd));
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'applied without the meal', without(withGcd));
  await expectMealEmpty(pg);
  await runFill(pg);
  await expectApplyCount(pg, 1);
  check((await takeBoxes.count()) === 1, `${await takeBoxes.count()} Take boxes for a meal alone, expected 1`);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'applied with the meal', withGcd.totals);
  await expect(pg.locator('#sh-figures [data-fig="gcd"] b')).toHaveText(withGcd.gcd);
  await expect(pg.locator('#sh-meal-btn')).toContainText(withGcd.meal);
  await checkNoBadText(pg, 'a set with food');
  await pg.click('[data-tab=browse]');
}

/** "Best for goal" on the Food row (B17: the note beside the meal, the menu's switch, the pill in the full list):
 * an Auto-fill with Food on, applied whole, shows the "best for goal" star (the saved list holds the several meals that tie), nothing while the result
 * waits; the menu opens on the tagged meals alone (N rows, the switch on) and the switch off lists every meal with the tagged
 * ones wearing the pill; a meal picked by hand and applied shows no note. The computed layout is B17's: the note 10 px from
 * the meal button, the pill 0.64rem bold with 6 px before it. */
export async function checkFillBestMeal(pg: Page) {
  // item level sync 123: several meals tie; sync off: one meal is best (the note, no count)
  await bestMealCase(pg, { ...DIALOG_SHEET, id: 's_best_sync', name: 'Best meal sync', sync: { on: true, cap: 123 } }, true);
  await bestMealCase(pg, DIALOG_SHEET, false);
}

/** One sheet of checkFillBestMeal: `several` says whether an Auto-fill ties several meals. */
async function bestMealCase(pg: Page, sheet, several) {
  await seedSheet(pg, sheet);
  await openSet(pg, sheet.name, 'Empty');
  await pg.click('#sh-settings');
  await pickOption(pg, '#s-target', 'crit');
  await pg.locator('#s-food').check();
  await expectSavedFill(pg, sheet, 'Food on', f => f.goal.food === true);
  const note = pg.locator('#sh-food-row .mealline > .small');
  const switchIs = on =>
    poll(`the Best for goal switch ${on ? 'on' : 'off'}`, async () => ({
      ok: (await pg.locator('#sh-meal-menu .menu-tools .toggle input').isChecked()) === on,
      got: !on,
    }));
  const count = pg.locator('#sh-meal-btn .same-count');
  const savedList = () =>
    pg.evaluate(([key, id]) => JSON.parse(localStorage.getItem(`${key}:sheet:${id}`))?.sets[0]?.bestMeals ?? null, [STORE_KEY, sheet.id]);

  // 1. the result waits: no note; applied whole: the note, and the tie list saved with the set (no "1 of N" count)
  await runFill(pg);
  await expect(note).toBeHidden();
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(note).toBeVisible(); // the note is a star mark beside the meal; a screen reader reads it as "best for goal"
  await expect(note.locator('.star')).toHaveCount(1);
  check(Boolean(await note.locator('.star').getAttribute('aria-label')), 'the star has a name for a screen reader');
  await expect(note.getByRole('img')).toHaveCount(1);
  await expect(count).toHaveCount(0);
  await poll('the tie list saved with the set', async () => ({ ok: Boolean(await savedList()), got: await savedList() }));
  const tied = (await savedList()).length;
  if (several) {
    check(tied >= 2, `an Auto-fill on Sage level 100 for Critical Hit with sync 123 ties ${tied} meals, expected several`);
  } else {
    check(tied === 1, `an Auto-fill with sync off ties ${tied} meals, expected one`);
  }

  // 2. the layout against B17 (proto-b17-settings: .mealline, .pill)
  const layout = await pg.evaluate(() => {
    const css = (el, ...props) => Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]]));
    const line = document.querySelector('#sh-food-row .mealline');
    const small = line.querySelector(':scope > .small');
    const btn = document.querySelector('#sh-meal-btn');
    return {
      line: css(line, 'display', 'alignItems', 'flexWrap'),
      note: {
        ...css(small, 'marginLeft', 'whiteSpace'),
        gap: small.getBoundingClientRect().left - btn.closest('.same').getBoundingClientRect().right,
      },
      oneLine:
        small.getBoundingClientRect().top >= line.getBoundingClientRect().top &&
        small.getBoundingClientRect().bottom <= line.getBoundingClientRect().bottom,
    };
  });
  check(
    layout.line.display === 'flex' && layout.line.flexWrap === 'nowrap' && layout.line.alignItems === 'center',
    `meal line layout ${JSON.stringify(layout.line)}`,
  );
  check(layout.note.marginLeft === '10px' && layout.note.whiteSpace === 'nowrap', `note ${JSON.stringify(layout.note)}`);
  check(Math.abs(layout.note.gap - 10) < 1, `the note is ${layout.note.gap} px from the meal button, expected 10`);
  check(layout.oneLine, 'the note is not on the meal line');

  // 3. the menu: the switch on, the tagged meals alone; off: every meal, the tagged ones with the pill
  await pg.click('#sh-meal-btn');
  const menu = pg.locator('#sh-meal-menu');
  const rows = menu.locator('.same-item[data-meal]:not([data-meal=""])');
  const toggle = menu.locator('.menu-tools .toggle input');
  await switchIs(true);
  await expect(menu.locator('.menu-tools .toggle')).toBeVisible();
  await expect(rows).toHaveCount(tied);
  check((await menu.locator('.meal-item.best').count()) === 0, 'the pill shows while the switch is on');
  await pg.screenshot({ path: shot('best-meal-menu-on.png') });
  await toggle.uncheck();
  await poll('every meal listed', async () => {
    const listed = await rows.count();
    return { ok: listed > tied, got: listed };
  });
  await expect(menu.locator('.meal-item.best')).toHaveCount(tied);
  // the pill is a gold star (a mask) after the name, its alt text the words, 6 px from the name
  const star = await menu
    .locator('.meal-item.best .meal-name')
    .first()
    .evaluate(el => {
      const after = getComputedStyle(el, '::after');
      return Object.fromEntries(['content', 'width', 'height', 'marginLeft', 'maskImage', 'webkitMaskImage'].map(p => [p, after[p]]));
    });
  check(
    Math.abs(Number.parseFloat(star.width) - 15.2) < 0.5 && star.width === star.height && star.marginLeft === '6px',
    `star size ${JSON.stringify(star)}`,
  );
  check(`${star.maskImage}${star.webkitMaskImage}`.includes('svg'), `star mask ${JSON.stringify(star)}`);
  await pg.screenshot({ path: shot('best-meal-menu-off.png') });
  await toggle.check();
  await expect(rows).toHaveCount(tied);
  // the switch stays as it was left: off, closed and opened again, still off; on again, still on
  await toggle.uncheck();
  await pg.click('#sh-meal-btn');
  await pg.click('#sh-meal-btn');
  await switchIs(false);
  await toggle.check();
  await pg.click('#sh-meal-btn');
  await pg.click('#sh-meal-btn');
  await switchIs(true);

  // 4. a meal picked by hand (not tagged) and applied: the note goes, the menu keeps its switch and the tagged meals
  await toggle.uncheck();
  await menu.locator('.same-item[data-meal]:not([data-meal=""]):not(.best)').first().click();
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(note).toBeHidden();
  await pg.click('#sh-meal-btn');
  await expect(menu.locator('.menu-tools .toggle')).toHaveCount(1);
  await switchIs(false);
  await expect(menu.locator('.meal-item.best')).toHaveCount(tied);
  await toggle.check();
  await expect(rows).toHaveCount(tied + 1); // the tagged meals and the meal the set holds
  await expect(menu.locator('.meal-item.on')).toHaveCount(1);
  // the held meal leads alone, under its own heading
  await expect(menu.locator('[data-group="pick"] .same-head')).toBeVisible();
  await expect(menu.locator('[data-group="pick"] .meal-item')).toHaveCount(1);
  await pg.screenshot({ path: shot('best-meal-pick.png') });
  // the switch off: it still leads the full list, once
  await toggle.uncheck();
  await expect(menu.locator('[data-group="pick"] .same-head')).toBeVisible();
  await expect(menu.locator('.meal-item.on')).toHaveCount(1);
  await toggle.check();
  await pg.click('#sh-meal-btn');
  await checkNoBadText(pg, 'a set with a tagged meal');
  await pg.click('[data-tab=browse]');
}
