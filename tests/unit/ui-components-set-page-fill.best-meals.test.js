/* "Best for goal" on a set page (docs/engineering/ui.md, the Food row): a Fill with Food on that is applied whole saves
   the meals tied for the best result with the set; the Food row says "best for goal" and the menu offers its
   switch while the set is as Fill made it. A meal or piece changed by hand, a change of the Fill settings, a declined Take
   box and Food off drop it. Real Sage gear at level 100 and at level 50, item level sync 123. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetStore } from '../../src/ui/sheet-store.js';
import { mealMenu as mealMenuComponent } from '../../src/ui/components/meal-menu.js';
import { fakeFrames, pageMagics } from './helpers/page-magics.js';
import { bind, twoToFill } from './helpers/set-page-bind.js';
import { SAGE_IDS } from './helpers/sheet-fixtures.js';

fakeFrames({ immediate: true });

const FEET = 6;
const HANDS = 4;
const NO_NOTE = { note: '' };

/* A page for the two-rows-to-fill Sage set with Food on and Critical Hit the goal, a Fill run and its result waiting. */
async function filled(sheetOptions = {}) {
  const page = bind(twoToFill(), undefined, sheetOptions);
  page.c.setGoalField('food', true);
  page.c.setGoal(0, 'crit');
  await page.c.fill();
  assert.equal(page.c.view.mode, 'suggestion');
  return page;
}
const mealsOf = menu => menu.groups.flatMap(g => g.items);

test('Fill then Apply whole: the tie list is saved, the Food row says "best for goal", the menu offers the switch', async () => {
  for (const sheetOptions of [{}, { level: 50, sync: { on: true, cap: 123 } }]) {
    const { c, sheets, storage } = await filled(sheetOptions);
    c.applySuggestion();
    const saved = sheets.currentSet;
    assert.ok(saved.bestMeals.length > 1, 'several meals tie');
    assert.ok(saved.bestMeals.includes(saved.meal), 'the set holds one of them');
    assert.deepEqual(c.view.rows.food.best, { note: 'best for goal' });
    // the Food menu: the switch is offered, the tagged meals are marked
    const menu = c.mealMenuView;
    assert.equal(menu.hasBest, true);
    assert.deepEqual(
      mealsOf(menu)
        .filter(x => x.best)
        .map(x => x.key)
        .sort(),
      [...saved.bestMeals].sort(),
    );
    // a reload reads it back
    assert.deepEqual(createSheetStore({ storage }).sheet('s_1').sets[0].bestMeals, saved.bestMeals);
  }
});

test('a suggestion is not "best for goal" yet; a draft of the meal alone keeps the tags and the switch, one of a piece does not', async () => {
  const { c } = await filled();
  assert.deepEqual(c.view.rows.food.best, NO_NOTE);
  assert.equal(c.mealMenuView.hasBest, false);
  c.applySuggestion();
  assert.equal(c.mealMenuView.hasBest, true);
  const tied = mealsOf(c.mealMenuView).filter(x => x.best).length;
  // a meal picked by hand: a draft that still offers the switch and the tagged meals; the note leaves the row
  const other = mealsOf(c.mealMenuView).find(x => !x.best);
  c.setMeal(other.key);
  assert.equal(c.view.mode, 'draft');
  assert.deepEqual(c.view.rows.food.best, NO_NOTE, 'the picked meal is not tagged: no note');
  assert.equal(c.mealMenuView.hasBest, true, 'the switch stays');
  assert.equal(mealsOf(c.mealMenuView).filter(x => x.best).length, tied);
  c.discardDraft();
  assert.equal(c.view.rows.food.best.note, 'best for goal', 'Discard: the set is as Fill made it again');
  // a piece changed by hand: no longer what Fill made
  c.pick(HANDS, null);
  assert.equal(c.view.mode, 'draft');
  assert.deepEqual(c.view.rows.food.best, NO_NOTE);
  assert.equal(c.mealMenuView.hasBest, false);
  c.discardDraft();
  assert.equal(c.view.rows.food.best.note, 'best for goal');
});

test('a piece applied by hand drops the tags; a meal picked by hand and applied, or a pin, keeps them', async () => {
  const { c, sheets } = await filled();
  c.applySuggestion();
  const tied = sheets.currentSet.bestMeals;
  c.togglePin(HANDS);
  assert.deepEqual(sheets.currentSet.bestMeals, tied, 'a pin changes no piece');
  c.pick(FEET, SAGE_IDS.feet);
  c.applyDraft();
  assert.equal(sheets.currentSet.bestMeals, null);
  assert.deepEqual(c.view.rows.food.best, NO_NOTE);

  const second = await filled();
  second.c.applySuggestion();
  const other = mealsOf(second.c.mealMenuView).find(x => !x.best);
  second.c.setMeal(other.key);
  second.c.applyDraft();
  assert.ok(second.sheets.currentSet.bestMeals.length > 1, 'the list stays');
  assert.equal(second.sheets.currentSet.meal, other.key);
  assert.deepEqual(second.c.view.rows.food.best, NO_NOTE, 'no note beside a meal that is not tagged');
  assert.equal(second.c.mealMenuView.hasBest, true, 'the switch stays after Apply');
});

test('a change of the Fill settings drops it, as it drops a waiting result', async () => {
  const { c, sheets } = await filled();
  c.applySuggestion();
  assert.ok(sheets.currentSet.bestMeals);
  c.setGoal(1, 'det');
  assert.equal(sheets.currentSet.bestMeals, null);
  assert.deepEqual(c.view.rows.food.best, NO_NOTE);
});

test('a declined Take box (a piece, or the meal) and a Fill with Food off save no tie list', async () => {
  const declined = await filled();
  declined.c.setTake(FEET, false);
  declined.c.applySuggestion();
  assert.equal(declined.sheets.currentSet.bestMeals, null);

  const noMeal = await filled();
  noMeal.c.setTake(null, false);
  noMeal.c.applySuggestion();
  assert.equal(noMeal.sheets.currentSet.bestMeals, null);

  const off = bind(twoToFill());
  off.c.setGoal(0, 'crit');
  await off.c.fill();
  off.c.applySuggestion();
  assert.deepEqual([off.sheets.currentSet.bestMeals, off.sheets.currentSet.meal], [null, null]);
  assert.deepEqual(off.c.view.rows.food.best, NO_NOTE);
});

test('Fill again after a hand edit (the piece unpinned) saves a new list; a Fill with nothing to change saves one too', async () => {
  const { c, sheets } = await filled();
  c.applySuggestion();
  c.pick(FEET, SAGE_IDS.feet);
  c.applyDraft();
  assert.equal(sheets.currentSet.bestMeals, null);
  c.togglePin(FEET);
  await c.fill();
  assert.ok(c.view.suggest.total > 0);
  c.applySuggestion();
  const kept = sheets.currentSet.bestMeals;
  assert.ok(kept.length > 1);
  await c.fill();
  assert.equal(c.view.suggest.total, 0, 'nothing to change: Apply is off');
  assert.deepEqual(sheets.currentSet.bestMeals, kept, 'the list is saved without Apply');
  c.discardSuggestion();
  assert.deepEqual(sheets.currentSet.bestMeals, kept);
});

test('a set that is already what Fill makes gets its list from a Fill with nothing to change, with Apply off', async () => {
  const { c, sheets } = await filled();
  c.applySuggestion();
  const tied = sheets.currentSet.bestMeals;
  sheets.updateSet(sheets.currentSet.id, { bestMeals: null });
  assert.deepEqual(c.view.rows.food.best, NO_NOTE);
  await c.fill();
  assert.equal(c.view.suggest.total, 0, 'nothing to change');
  assert.deepEqual(sheets.currentSet.bestMeals, tied, 'the Fill itself saved the list');
  c.discardSuggestion();
  assert.equal(c.view.rows.food.best.note, 'best for goal');
});

test('the menu component: the switch is on at first and stays as left, turning it on clears the pills, and off lists every meal', async () => {
  const { c } = await filled();
  c.applySuggestion();
  const source = { menu: () => c.mealMenuView, pick: () => {}, watch: 'open' };
  const m = Object.assign(mealMenuComponent(source), {
    keepMenuInView: () => {},
    $watch: () => {},
    ...pageMagics(['mealQuery', 'mealList']),
  });
  m.init();
  m.toggleMealMenu();
  const tied = mealsOf(c.mealMenuView).filter(x => x.best);
  assert.equal(m.mealBestOnly, true);
  assert.deepEqual(
    mealsOf(m.fullMealView)
      .map(x => x.key)
      .sort(),
    tied.map(x => x.key).sort(),
  );
  m.setMealBest(false);
  const everyMeal = mealsOf(m.fullMealView);
  assert.ok(everyMeal.length > tied.length);
  assert.equal(everyMeal.filter(x => x.rowClass.includes('best')).length, tied.length);
  // a pill with the switch off, then the switch on again: the pills clear
  m.toggleMealStat(m.mealPills[0].stat);
  assert.equal(m.mealStats.length, 1);
  m.setMealBest(true);
  assert.deepEqual([m.mealStats, m.mealSortBy], [[], 'ilvl']);
  // closed and opened again: as left (off stays off, on stays on)
  m.setMealBest(false);
  m.toggleMealMenu();
  m.toggleMealMenu();
  assert.equal(m.mealBestOnly, false);
  m.setMealBest(true);
  m.toggleMealMenu();
  m.toggleMealMenu();
  assert.equal(m.mealBestOnly, true);
});
