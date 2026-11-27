/* "Best for goal" on a set page (docs/engineering/ui.md, the Food row): an Auto-fill with Food on that is applied whole saves
   the meals tied for the best result with the set; the Food row says "best for goal" and the menu offers its
   switch while the set is as Auto-fill made it. A meal or piece changed by hand, a change of the Auto-fill settings, a declined Take
   box and Food off drop it. Real Sage gear at level 100 and at level 50, item level sync 123. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoodMenuModel } from '../../../../../src/ui/elements/set-page/food-menu-model.ts';
import type { MealMenuData } from '../../../../../src/ui/elements/set-page/food-menu-model.ts';
import type { PageView } from '../../../../../src/ui/elements/set-page/set-page-types.ts';
import type { SavedGearSet } from '../../../../../src/ui/sheets/saved-types.ts';
import { fakeFrames } from '../../../helpers/fakes/frames.ts';
import { bind, twoToFill } from '../../../helpers/fixtures/set-page-bind.ts';
import { SAGE_IDS } from '../../../helpers/fixtures/sheet-fixtures.ts';
import { createSheetsFacade } from '../../../helpers/fixtures/stores.ts';

fakeFrames({ immediate: true });

const FEET = 6;
const HANDS = 4;
const NO_NOTE = { note: '' };

/* A page for the two-rows-to-fill Sage set with Food on and Critical Hit the goal, an Auto-fill run and its result waiting. */
async function filled(sheetOptions: Parameters<typeof bind>[2] = {}) {
  const page = bind(twoToFill(), undefined, sheetOptions);
  page.session.settings.setGoalField('food', true);
  page.session.settings.setGoal(0, 'crit');
  await page.session.fill.fill();
  assert.equal(page.view().mode, 'suggestion');
  return page;
}
const mealsOf = <Meal>(menu: { groups: { items: Meal[] }[] }): Meal[] => menu.groups.flatMap(group => group.items);

/* The first meal of the menu that is not tagged "best for goal"; fails the test when every meal is. */
function untaggedMeal(menu: MealMenuData) {
  const meal = mealsOf(menu).find(item => !item.best);
  assert.ok(meal, 'every meal is tagged');
  return meal;
}

/* How many changes the waiting suggestion makes; fails the test when none waits. */
function suggestedTotal(view: PageView): number {
  assert.ok(view.suggest, 'no suggestion is waiting');
  return view.suggest.total;
}

/* The saved gear set the page is open on; fails the test when none is. */
function savedSet(sheets: { currentSet: SavedGearSet | null }): SavedGearSet {
  assert.ok(sheets.currentSet, 'no gear set is open');
  return sheets.currentSet;
}
/* The meals tagged "best for goal" in the saved set; fails the test when the set has no list. */
function tiedMeals(sheets: { currentSet: SavedGearSet | null }): string[] {
  const { bestMeals } = savedSet(sheets);
  assert.ok(bestMeals, 'the set has no tie list');
  return bestMeals;
}

test('Auto-fill then Apply whole: the tie list is saved, the Food row says "best for goal", the menu offers the switch', async () => {
  for (const sheetOptions of [{}, { level: 50, sync: { on: true, cap: 123 } }]) {
    const { session, sheets, storage, view, mealMenu } = await filled(sheetOptions);
    session.fill.applySuggestion();
    const saved = savedSet(sheets);
    const tied = tiedMeals(sheets);
    assert.ok(tied.length > 1, 'several meals tie');
    assert.ok(saved.meal !== null && tied.includes(saved.meal), 'the set holds one of them');
    assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged');
    // the Food menu: the switch is offered, the tagged meals are marked
    const menu = mealMenu();
    assert.equal(menu.hasBest, true);
    assert.deepEqual(
      mealsOf(menu)
        .filter(x => x.best)
        .map(x => x.key)
        .sort(),
      [...tied].sort(),
    );
    // a reload reads it back
    assert.deepEqual(createSheetsFacade({ storage }).sheet('s_1')?.sets[0].bestMeals, tied);
  }
});

test('a suggestion is not "best for goal" yet; a draft of the meal alone keeps the tags and the switch, one of a piece does not', async () => {
  const { session, view, mealMenu } = await filled();
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  assert.equal(mealMenu().hasBest, false);
  session.fill.applySuggestion();
  assert.equal(mealMenu().hasBest, true);
  const tied = mealsOf(mealMenu()).filter(x => x.best).length;
  // a meal picked by hand: a draft that still offers the switch and the tagged meals; the note leaves the row
  const other = untaggedMeal(mealMenu());
  session.edits.setMeal(other.key);
  assert.equal(view().mode, 'draft');
  assert.deepEqual(view().rows.food.best, NO_NOTE, 'the picked meal is not tagged: no note');
  assert.equal(mealMenu().hasBest, true, 'the switch stays');
  assert.equal(mealsOf(mealMenu()).filter(x => x.best).length, tied);
  session.edits.discardDraft();
  assert.ok(view().rows.food.best.note.length > 0, 'Discard: the set is as Auto-fill made it again');
  // a piece changed by hand: no longer what Auto-fill made
  session.edits.pick(HANDS, null);
  assert.equal(view().mode, 'draft');
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  assert.equal(mealMenu().hasBest, false);
  session.edits.discardDraft();
  assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged again');
});

test('a piece applied by hand drops the tags; a meal picked by hand and applied, or a pin, keeps them', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  const tied = tiedMeals(sheets);
  session.edits.togglePin(HANDS);
  assert.deepEqual(savedSet(sheets).bestMeals, tied, 'a pin changes no piece');
  session.edits.pick(FEET, SAGE_IDS.feet);
  session.edits.applyDraft();
  assert.equal(savedSet(sheets).bestMeals, null);
  assert.deepEqual(view().rows.food.best, NO_NOTE);

  const second = await filled();
  second.session.fill.applySuggestion();
  const other = untaggedMeal(second.mealMenu());
  second.session.edits.setMeal(other.key);
  second.session.edits.applyDraft();
  assert.ok(tiedMeals(second.sheets).length > 1, 'the list stays');
  assert.equal(savedSet(second.sheets).meal, other.key);
  assert.deepEqual(second.view().rows.food.best, NO_NOTE, 'no note beside a meal that is not tagged');
  assert.equal(second.mealMenu().hasBest, true, 'the switch stays after Apply');
});

test('a change of the Auto-fill settings drops it, as it drops a waiting result', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  assert.ok(savedSet(sheets).bestMeals);
  session.settings.setGoal(1, 'det');
  assert.equal(savedSet(sheets).bestMeals, null);
  assert.deepEqual(view().rows.food.best, NO_NOTE);
});

test('a declined Take box (a piece, or the meal) and an Auto-fill with Food off save no tie list', async () => {
  const declined = await filled();
  declined.session.fill.setTake(FEET, false);
  declined.session.fill.applySuggestion();
  assert.equal(savedSet(declined.sheets).bestMeals, null);

  const noMeal = await filled();
  noMeal.session.fill.setTake(null, false);
  noMeal.session.fill.applySuggestion();
  assert.equal(savedSet(noMeal.sheets).bestMeals, null);

  const off = bind(twoToFill());
  off.session.settings.setGoal(0, 'crit');
  off.session.settings.setGoalField('food', false);
  await off.session.fill.fill();
  off.session.fill.applySuggestion();
  assert.deepEqual([savedSet(off.sheets).bestMeals, savedSet(off.sheets).meal], [null, null]);
  assert.deepEqual(off.view().rows.food.best, NO_NOTE);
});

test('Auto-fill again after a hand edit (the piece unpinned) saves a new list; an Auto-fill with nothing to change saves one too', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  session.edits.pick(FEET, SAGE_IDS.feet);
  session.edits.applyDraft();
  assert.equal(savedSet(sheets).bestMeals, null);
  session.edits.togglePin(FEET);
  await session.fill.fill();
  assert.ok(suggestedTotal(view()) > 0);
  session.fill.applySuggestion();
  const kept = tiedMeals(sheets);
  assert.ok(kept.length > 1);
  await session.fill.fill();
  assert.equal(suggestedTotal(view()), 0, 'nothing to change: Apply is off');
  assert.deepEqual(savedSet(sheets).bestMeals, kept, 'the list is saved without Apply');
  session.fill.discardSuggestion();
  assert.deepEqual(savedSet(sheets).bestMeals, kept);
});

test('a set that is already what Auto-fill makes gets its list from an Auto-fill with nothing to change, with Apply off', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  const tied = tiedMeals(sheets);
  sheets.updateSet(savedSet(sheets).id, { bestMeals: null });
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  await session.fill.fill();
  assert.equal(suggestedTotal(view()), 0, 'nothing to change');
  assert.deepEqual(savedSet(sheets).bestMeals, tied, 'the Auto-fill itself saved the list');
  session.fill.discardSuggestion();
  assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged again');
});

test('the Food menu: the switch is on at first and stays as left, turning it on clears the pills, and off lists every meal', async () => {
  const { session, mealMenu } = await filled();
  session.fill.applySuggestion();
  const m = new FoodMenuModel();
  m.menu = mealMenu();
  m.startOpen();
  const tied = mealsOf(mealMenu()).filter(x => x.best);
  assert.equal(m.bestOnly, true);
  assert.deepEqual(
    mealsOf(m.list)
      .map(x => x.key)
      .sort(),
    tied.map(x => x.key).sort(),
  );
  m.setBestOnly(false);
  const everyMeal = mealsOf(m.list);
  assert.ok(everyMeal.length > tied.length);
  assert.equal(everyMeal.filter(x => x.rowClass.includes('best')).length, tied.length);
  // a pill with the switch off, then the switch on again: the pills clear
  m.toggleStat(m.pills[0].stat);
  assert.equal(m.stats.length, 1);
  m.setBestOnly(true);
  assert.deepEqual([m.stats, m.sortBy], [[], 'ilvl']);
  // opened again: as left (off stays off)
  m.setBestOnly(false);
  m.startOpen();
  assert.equal(m.bestOnly, false);
});
